// 진행자 화면 (host.html) — 부안 청년포럼 퀴즈(lalaseohyun/buanforum js/host/sessions/quiz.js) 레이아웃
//
// 한 문항 = 한 화면에서 이어지는 4페이지. 화살표(또는 Space) 한 번에 한 페이지씩:
//   0 문제만 · 1 +보기 · 2 +제출현황 · 3 정답 공개 (정답 보기만 노랗게 + 해설 박스)
//   (q3처럼 기억 격자가 있는 문항은 그 앞에 격자 페이지가 하나 더 있다)
// 페이지가 바뀌어도 문제·보기 위치는 1px도 안 움직인다 — 아직 보여줄 차례가 아닌 보기·제출현황도
// 자리는 처음부터 잡아두고 visibility:hidden으로 가린다.
//
// 공유 상태(quiz/state)에는 phase·index·showGrid·open·revealed·openedAt·asked만 올린다.
// "보기만 보이는지, 제출현황까지 보이는지"는 이 화면의 로컬 상태다 (사양서 §6-7).
// state를 쓸 때마다 deriveLive()로 quiz/live를 다시 계산해 같은 update()로 함께 쓴다.

import { db, ref, update, onValue, onConnection, serverTimestamp, withTimeout, loadAuth } from '../db.js';
import { QUESTIONS, TEAM_NOS } from '../data.js';
import { deriveLive, emptyState, questionStart, stageOf } from './state.js';
import { rank, realAnswers, tally } from '../score.js';
import { setupFullscreen, toggleFullscreen, refit } from '../stage.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const nl2br = s => esc(s).replace(/\n/g, '<br>');
// 해설은 문장마다 줄을 바꿔 가운데 정렬로 보여준다
const sentences = s => String(s || '').split(/(?<=[.!?])\s+/).filter(Boolean).map(x => `<p>${esc(x)}</p>`).join('');

// ── 상태 ─────────────────────────────────────
let state = null;            // quiz/state (null = 아직 못 받음)
let answers = {};            // quiz/answers
let claims = {};             // claims (접속한 조)
let connected = false;
let busy = false;
let page = 0;                // 로컬: 답안이 열린 동안 1(보기) / 2(+제출현황)
let showRanking = false;     // 로컬: 순위 패널
let lastKey = '';
// 로컬: QR 대기화면을 덮어 보여주는 중 — 진행자 화면을 열면 실제 진행이 어디까지 갔든
// 항상 QR부터 보여준다(부안 coverMode). ▶/Space 한 번이면 실제 진행 화면으로. DB는 안 건드린다.
let cover = true;

const norm = s => {
  const x = { ...emptyState(), ...(s || {}) };
  x.asked = Array.isArray(x.asked) ? x.asked : Object.values(x.asked || {});
  return x;
};
const cur = () => QUESTIONS[state.index];
const claimedTeams = () => TEAM_NOS.filter(n => claims[n] && !claims[n].released);
const answeredTeams = () => TEAM_NOS.filter(n => QUESTIONS.some(q => realAnswers(answers[q.id]).some(([k]) => Number(k) === n)));
// 순위·시상 대상 — 접속했거나 한 번이라도 답한 조만. 아무도 없으면 전체(리허설용)
const rankTeams = () => {
  const s = new Set([...claimedTeams(), ...answeredTeams()]);
  return s.size ? TEAM_NOS.filter(n => s.has(n)) : TEAM_NOS;
};
const scoreboard = (asked = state.asked) => rank(QUESTIONS, answers, rankTeams(), asked);

// 지금 몇 페이지째인가 — 'grid' | 0 | 1 | 2 | 3
function pageNow() {
  const st = stageOf(state);
  if (st === 'grid') return 'grid';
  if (st === 'ready') return 0;
  if (st === 'open') return Math.max(1, page);
  if (st === 'closed') return 2;
  return 3;
}

// ── 렌더 배칭 (사양서 §6-6) ──────────────────
let queued = false;
const scheduleRender = () => {
  if (queued) return;
  queued = true;
  setTimeout(() => { queued = false; render(); }, 0);
};

// ── 쓰기 ─────────────────────────────────────
// state와 live를 한 번에. extra로 답안 삭제 등을 같은 원자적 update에 싣는다
async function commit(patch, extra = {}) {
  if (busy) return;
  const next = norm({ ...state, ...patch });
  const ranking = next.phase === 'final' || next.revealed ? scoreboard(next.asked) : undefined;
  busy = true; scheduleRender();
  try {
    await withTimeout(update(ref(db), {
      'quiz/state': next,
      'quiz/live': deriveLive(next, QUESTIONS, ranking),
      ...extra
    }), 10000, '진행 상태 저장');
  } catch (e) {
    console.error(e);
    alert(/PERMISSION_DENIED/i.test(e.message)
      ? '권한이 없어 저장하지 못했어요. 로그아웃 후 다시 로그인해 주세요.\n' + e.message
      : '저장하지 못했어요. 연결을 확인하고 다시 눌러주세요.\n' + e.message);
  }
  busy = false; scheduleRender();
}

// 문항으로 이동: 이미 정답까지 공개한 문항이면 공개 상태로, 아니면 처음부터
function goTo(index) {
  if (index < 0 || index >= QUESTIONS.length) return;
  const done = state.asked.includes(QUESTIONS[index].id);
  page = 0;
  commit({ phase: 'quiz', ...(done
    ? { index, showGrid: false, open: false, revealed: true, openedAt: state.openedAt || 1 }
    : questionStart(index, QUESTIONS)) });
}

const openAnswers = () => { page = 1; commit({ open: true, openedAt: Date.now() }); };
const closeAnswers = () => commit({ open: false });
const reveal = () => commit({ open: false, revealed: true, asked: [...new Set([...state.asked, cur().id])] });
const goFinal = () => commit({ phase: 'final', open: false });

// 화살표 하나로 처음부터 끝까지
function stepForward() {
  if (!state || busy) return;
  // QR 대기화면에서 ▶ — 아직 시작 전이면 1번 문제로, 진행 중이었으면 그 화면으로
  if (cover) { cover = false; return state.phase === 'lobby' ? goTo(0) : scheduleRender(); }
  if (state.phase === 'lobby') return goTo(0);
  if (state.phase === 'final') return;
  const p = pageNow();
  if (p === 'grid') return commit({ showGrid: false });
  if (p === 0) return openAnswers();
  if (p === 1) { page = 2; return scheduleRender(); }
  if (p === 2) return reveal();
  if (state.index >= QUESTIONS.length - 1) return goFinal();
  goTo(state.index + 1);
}
function stepBack() {
  if (!state || busy || cover) return;
  if (state.phase === 'final') return goTo(QUESTIONS.length - 1);
  if (state.phase !== 'quiz') return;
  const p = pageNow();
  // 정답 공개를 되돌리면 마감 상태(제출현황 페이지)로
  if (p === 3) { page = 2; return commit({ revealed: false, open: false, asked: state.asked.filter(id => id !== cur().id) }); }
  if (p === 2 && stageOf(state) === 'open') { page = 1; return scheduleRender(); }
  // 보기 페이지(답안 받는 중)에서 ◀ — 답안 받기를 취소하고 문제만 보이는 페이지로
  if (p === 1) {
    if (!confirm('답안 받기를 취소하고 문제만 보이는 화면으로 돌아갈까요?\n이 문제에 이미 낸 답은 지워져요.')) return;
    page = 0;
    return commit(questionStart(state.index, QUESTIONS), { [`quiz/answers/${cur().id}`]: null });
  }
  goTo(state.index - 1);
}

function primaryAction() {
  if (!state) return null;
  if (cover) return { label: state.phase === 'lobby' ? '퀴즈 시작' : '진행 화면으로' };
  if (state.phase === 'lobby') return { label: '퀴즈 시작' };
  if (state.phase === 'final') return { label: '퀴즈 끝', disabled: true };
  const p = pageNow();
  const last = state.index >= QUESTIONS.length - 1;
  return { label: { grid: '문제로 넘기기', 0: '보기 보여주기', 1: '제출 현황', 2: '정답 공개', 3: last ? '최종 순위' : '다음 문제' }[p] };
}

async function resetQuestion() {
  const q = cur();
  if (!q || !confirm(`${q.no}번 문제의 답안을 모두 지우고 처음부터 다시 할까요?`)) return;
  page = 0;
  await commit({ ...questionStart(state.index, QUESTIONS), asked: state.asked.filter(id => id !== q.id) },
    { [`quiz/answers/${q.id}`]: null });
}

async function resetAll() {
  if (!confirm('퀴즈를 전체 초기화할까요?\n모든 답안과 점수가 지워지고 대기 화면으로 돌아갑니다.')) return;
  const alsoClaims = confirm('조별 대표 폰 등록도 지울까요?\n\n리허설 뒤 실전 전이라면 [확인]\n행사 중이라면 [취소] (대표 폰이 다시 조를 골라야 합니다)');
  page = 0; showRanking = false; cover = true;
  await commit(emptyState(), {
    'quiz/answers': null,
    'session/resetAt': serverTimestamp(),
    ...(alsoClaims ? { claims: null } : {})
  });
}

// ── 그리기 ───────────────────────────────────
function render() {
  if (!state) { $('#stage').innerHTML = `<div class="center"><div class="pulse"></div></div>`; return; }

  const key = `${state.phase}:${state.index}`;
  if (key !== lastKey) { lastKey = key; if (stageOf(state) !== 'open') page = 0; }

  document.body.classList.toggle('offline', !connected);

  $('#stage').innerHTML =
    cover || state.phase === 'lobby' ? lobbyView(claimedTeams()) :
    state.phase === 'final' ? finalView() : questionView();
  if (cover || state.phase === 'lobby') mountQr($('#qrHolder'));

  $('#rankpanel').hidden = cover || !showRanking || state.phase !== 'quiz';
  if (showRanking && state.phase === 'quiz') $('#rankpanel').innerHTML = rankPanel();

  renderControls();
  refit();      // 전체화면이면 배율을 다시 잡는다 (배율마다 fitQuestion이 다시 돈다)
  if (!document.body.classList.contains('fs')) fitQuestion();
}

function renderControls() {
  const a = primaryAction();
  const btn = $('#primary');
  btn.textContent = busy ? '저장 중…' : a?.label || '';
  btn.disabled = busy || !a || a.disabled;
  // 제출현황 페이지에서 접속한 조가 모두 냈으면 깜빡여 알린다
  const q = state.phase === 'quiz' && cur();
  const joined = claimedTeams();
  btn.classList.toggle('ready', !!(q && pageNow() === 2 && joined.length &&
    joined.every(n => realAnswers(answers[q.id]).some(([k]) => Number(k) === n))));

  const inQuiz = !cover && state.phase === 'quiz';
  $('#prev').disabled = busy || cover || state.phase === 'lobby' || (inQuiz && state.index === 0 && (pageNow() === 0 || pageNow() === 'grid'));
  $('#next').disabled = busy || (!cover && state.phase === 'final');
  $('#close').hidden = !(inQuiz && stageOf(state) === 'open');
  $('#to-lobby').disabled = busy || cover || state.phase === 'lobby';
  $('#reset-q').disabled = busy || !inQuiz;
  $('#toggle-rank').disabled = !inQuiz;
  $('#toggle-rank').classList.toggle('on', showRanking);
  $('#joined').innerHTML = `접속 <b>${claimedTeams().length}</b>조`;
  $('#dot').classList.toggle('live', connected);
}

// 참가자 주소 = 진행자 주소에서 host.html을 뗀 곳
const joinUrl = () => location.href.replace(/host\.html.*$/, '');

// QR은 한 번만 그려 두고 대기화면을 다시 그릴 때마다 그 노드를 옮겨 붙인다
// (조가 접속할 때마다 새로 그리면 깜빡인다)
let qrNode = null;
function mountQr(holder) {
  if (!holder) return;
  if (!qrNode && window.QRCode) {
    qrNode = document.createElement('div');
    new window.QRCode(qrNode, { text: joinUrl(), width: 600, height: 600, colorDark: '#2c2c2a', colorLight: '#ffffff' });
  }
  if (qrNode) holder.replaceChildren(qrNode);
  else holder.innerHTML = `<div class="noqr">${esc(joinUrl())}</div>`;
}

export function lobbyView(claimed) {
  const on = new Set(claimed);
  const local = /^(localhost|127\.|\[::1\])/.test(location.hostname);
  return `<div class="lobby">
    <div class="qrside">
      <div class="qrbox"><div id="qrHolder"></div></div>
      ${local ? `<div class="qrwarn">지금 주소가 localhost라 폰에서 열리지 않아요.<br>배포 주소나 PC의 IP 주소로 진행자 화면을 열어주세요.</div>` : ''}
    </div>
    <div>
      <h2>휴대폰으로 <span>QR</span>을 찍고<br>우리 조 번호를 눌러주세요</h2>
      <div class="lsub">조당 한 분만 접속하시면 됩니다</div>
      <div class="lsub">접속한 조 <b>${on.size}</b> / ${TEAM_NOS.length}</div>
      <div class="chips">${TEAM_NOS.map(n => `<div class="chip ${on.has(n) ? 'on' : ''}">${n}</div>`).join('')}</div>
    </div>
  </div>`;
}
export { mountQr };

// 조 원 하나. mark: 'check' | 'O' | 'X' | '–' | null
function chip(n, cls, mark) {
  const mk = mark === 'check' ? `<span class="mk">✓</span>`
    : mark === 'O' ? `<span class="mk">O</span>`
    : mark === 'X' ? `<span class="mk x">X</span>`
    : mark === '–' ? `<span class="mk none">–</span>` : '';
  return `<div class="chip ${cls}">${n}${mk}</div>`;
}

// "A팀 — 요즘 AI가 …"처럼 " — "가 있으면 앞(핵심)과 뒤(부연)를 나눠 뒤를 작고 노랗게
function choiceHtml(c) {
  const i = c.indexOf(' — ');
  return i === -1 ? nl2br(c) : `${nl2br(c.slice(0, i))}<br><span class="sub">${nl2br(c.slice(i + 3))}</span>`;
}

// 보기 배치 — 짧은 보기(100회, 충전기 · 이어폰)는 부안처럼 가로 한 줄에 전부,
// 긴 보기(문장·순서 나열)는 2열로 두고 번호를 왼쪽에 붙인다
function choiceLayout(q) {
  if (q.choiceCols) return { cls: q.choiceCols === 1 ? 'long rows' : 'long', n: q.choiceCols };   // 문항에서 열 수를 정해 둔 경우 (q2: 다섯 줄)
  const longest = Math.max(...q.choices.map(c => c.split(' — ')[0].length));
  return longest <= 12 && !q.choices.some(c => c.includes(' — ')) ? { cls: '', n: q.choices.length } : { cls: 'long', n: 2 };
}

const dots = (total, now) => `<div class="pagedots">${Array.from({ length: total }, (_, i) =>
  `<i class="${i === now ? 'on' : ''}"></i>`).join('')}</div>`;

export function questionView() {
  const q = cur();
  const p = pageNow();
  const hasGrid = !!q.showBefore?.grid;
  const totalPages = hasGrid ? 5 : 4;
  const dotIndex = p === 'grid' ? 0 : p + (hasGrid ? 1 : 0);
  const badge = `<div class="badges"><span class="badge num">문제 ${q.no} / ${QUESTIONS.length}</span></div>`;

  if (p === 'grid') {
    return `<div class="qview grid">${badge}
      <div class="q">잘 기억하세요!</div>
      <div class="memgrid">${q.showBefore.grid.map(r => r.map(c => `<span>${esc(c)}</span>`).join('')).join('')}</div>
      <div class="qbottom">${dots(totalPages, dotIndex)}</div>
    </div>`;
  }

  const revealed = p === 3;
  const ans = Object.fromEntries(realAnswers(answers[q.id]).map(([k, v]) => [Number(k), v]));
  const cnt = Object.keys(ans).length;
  const counts = tally(answers[q.id], q.choices.length);
  const total = Math.max(1, cnt);
  const joined = new Set(claimedTeams());
  const teams = rankTeams();

  const { cls, n } = choiceLayout(q);
  const ch = q.choices.map((c, i) => {
    const ok = revealed && i === q.answer;
    return `<div class="ch ${revealed ? (ok ? 'correct' : 'dimmed') : ''}">
      <div class="n">${i + 1}</div>
      <div class="t">${choiceHtml(c)}</div>
      ${revealed ? `<div class="tally">${counts[i]}조 · ${Math.round(counts[i] / total * 100)}%</div>` : ''}
    </div>`;
  }).join('');

  const closed = stageOf(state) === 'closed';
  const stat = cnt === 0 ? `<div class="tstat">${closed ? '제출한 조가 없어요 · 마감됨' : '답변을 기다리는 중'}</div>`
    : joined.size && [...joined].every(t => t in ans) && !closed ? `<div class="tstat done">전체 제출 완료!</div>`
    : `<div class="tstat"><b>${cnt}</b>조 제출 완료${closed ? ' · 마감됨' : ''}</div>`;
  const chips = teams.map(t => chip(t, t in ans ? 'done' : joined.has(t) ? 'on' : '', t in ans ? 'check' : null)).join('');

  // 정답 공개 — 누가 맞혔는지 조 원마다 O/X, 안 낸 조는 –
  const right = teams.filter(t => ans[t]?.choice === q.answer);
  const revealChips = teams.map(t => ans[t]
    ? chip(t, right.includes(t) ? 'done' : 'wrong', right.includes(t) ? 'O' : 'X')
    : chip(t, joined.has(t) ? 'on' : '', joined.has(t) ? '–' : null)).join('');

  // 아직 보여줄 차례가 아닌 것도 자리는 잡아둔다 — 페이지를 넘겨도 문제가 안 움직이게
  const veil = show => (show ? '' : 'visibility:hidden;');
  let body = `${badge}<div class="q">${nl2br(q.question)}</div>
    <div class="choices ${cls}" style="--n:${n};${veil(p >= 1)}">${ch}</div>`;
  if (revealed && q.explanationGrid) {
    // 표 해설 — 이름을 나란히, 그 아래 값 (q1: 대학 이름 아래 연도)
    body += `<div class="answerbox"><div class="egrid" style="--n:${q.explanationGrid.length}">${q.explanationGrid
      .map(([k, v]) => `<div><b>${esc(k)}</b><span>${esc(v)}</span></div>`).join('')}</div></div>`;
  } else if (revealed && q.explanation) body += `<div class="answerbox">${sentences(q.explanation)}</div>`;

  const foot = revealed
    ? `<div class="foot"><div class="tmeta"><div class="tstat"><b>${right.length}</b>조 정답 · ${cnt}조 제출</div></div><div class="chips">${revealChips}</div></div>`
    : `<div class="foot" style="${veil(p >= 2)}"><div class="tmeta">${stat}</div><div class="chips">${chips}</div></div>`;

  return `<div class="qview ${revealed ? 'revealed' : ''}">${body}
    <div class="qbottom">${foot}${dots(totalPages, dotIndex)}</div>
  </div>`;
}

// 문제 글자·보기 칸은 화면 폭에 맞춰 크게 잡아두고, 넘칠 때만 이 문항에서 줄인다 (부안 fitQuestion).
// 반환: 줄였거나 그래도 넘치면 true — 전체화면 배율을 고를 때 "이 배율은 너무 크다"는 신호
export function fitQuestion() {
  const view = $('#stage .qview');
  if (!view) return false;
  const set = (k, v) => view.style.setProperty(k, String(v));
  set('--qs', 1); set('--cs', 1);

  // 문제는 두 줄까지 — 데이터에서 끊어 둔 줄(\n)이 화면 폭에 밀려 세 줄 이상으로 꺾이면
  // 두 줄에 들어올 때까지 이 문항의 문제 글자만 줄인다 (보기·해설 크기와는 따로)
  let qs0 = 1;
  const qEl = view.querySelector('.q');
  if (qEl) {
    const lines = () => Math.round(qEl.offsetHeight / parseFloat(getComputedStyle(qEl).lineHeight));
    for (; qs0 > 0.45 && lines() > 2; qs0 -= 0.02) set('--qs', qs0.toFixed(2));
  }
  const shrankForLines = qs0 < 1;

  // 정답 페이지 — 해설이 넘치면 해설·보기·문제가 번갈아 조금씩 양보한다.
  // 한쪽만 줄이면 해설은 44px인데 보기가 못 읽을 만큼 작아지는 식으로 균형이 깨진다(q5 실측).
  const ab = view.querySelector('.answerbox');
  if (ab) {
    ab.style.fontSize = '';
    const tight = () => ab.scrollHeight - ab.clientHeight > 4 || view.scrollHeight - view.clientHeight > 4;
    if (!tight()) return shrankForLines;
    const base = parseFloat(getComputedStyle(ab).fontSize);
    const expl = min => { for (let px = parseFloat(ab.style.fontSize) || base; px >= min && tight(); px -= 0.5) ab.style.fontSize = px + 'px'; };
    let cs = 1, qs = qs0;
    const choices = min => { for (; cs >= min && tight(); cs -= 0.02) set('--cs', cs.toFixed(2)); };
    const question = min => { for (; qs >= min && tight(); qs -= 0.02) set('--qs', qs.toFixed(2)); };
    expl(34); choices(0.8); question(0.8);      // 1단계: 모두 조금씩
    expl(28); choices(0.68); question(0.65);    // 2단계
    expl(24); choices(0.55); question(0.5);     // 마지막: 최소 크기까지
    return true;
  }

  const over = () => view.scrollHeight - view.clientHeight > 4;
  if (!over()) return shrankForLines;
  let qs = qs0;
  for (; qs >= 0.8 && over(); qs -= 0.02) set('--qs', qs.toFixed(2));
  if (over()) for (let cs = 1; cs >= 0.6 && over(); cs -= 0.02) set('--cs', cs.toFixed(2));
  for (; qs >= 0.5 && over(); qs -= 0.02) set('--qs', qs.toFixed(2));
  return true;
}

function rankPanel() {
  const rows = scoreboard();
  return `<div class="rp-title">실시간 순위 <small>정답 공개한 ${state.asked.length}문제 기준</small></div>
    <ol class="ranks">${rows.map(r => `<li class="${r.rank === 1 ? 'first' : ''}">
      <span class="rk">${r.rank}</span><span class="tn">${r.teamNo}조</span><span class="rc">${r.correct}</span></li>`).join('')}</ol>`;
}

// 최종 순위 — 부안과 같은 구성: 큰 제목 + 2단 목록, 1위는 크림 카드
function finalView() {
  const rows = scoreboard();
  const cols = rows.length > 1 ? 2 : 1;
  return `<div class="finaltitle">최종 순위</div>
    <div class="rank" style="--cols:${cols};--rows:${Math.ceil(rows.length / cols)}">${rows.map(r => `
      <div class="row ${r.rank <= 3 ? 'p' + r.rank : ''}">
        <div class="r">${r.rank}위</div><div class="tm">${r.teamNo}조</div>
        <div class="sc">${r.correct}<small> / ${QUESTIONS.length}</small></div>
      </div>`).join('')}</div>`;
}

// ── 조작 ─────────────────────────────────────
function bindControls() {
  $('#primary').onclick = stepForward;
  $('#prev').onclick = stepBack;
  $('#next').onclick = stepForward;
  $('#close').onclick = closeAnswers;
  // 대기화면 — 진행자 화면에만 QR을 덮어 보여준다. 참가자 폰·진행 상태는 그대로, ▶ 한 번이면 돌아온다
  $('#to-lobby').onclick = () => { cover = true; scheduleRender(); };
  $('#reset-q').onclick = resetQuestion;
  $('#reset-all').onclick = resetAll;
  $('#toggle-rank').onclick = () => { showRanking = !showRanking; scheduleRender(); };
  // 전체화면 배율 — 문제가 줄어들지 않고 그대로 들어가는 가장 큰 배율
  setupFullscreen($('#fs'), () => {
    const shrank = fitQuestion();
    const s = $('#stage');
    return shrank || s.scrollHeight > s.clientHeight + 1 || s.scrollWidth > s.clientWidth + 1;
  });

  document.addEventListener('keydown', e => {
    if (e.target.closest('input, textarea') || !state) return;
    if (e.code === 'Space') { e.preventDefault(); stepForward(); }
    else if (e.key === 'ArrowRight') stepForward();
    else if (e.key === 'ArrowLeft') stepBack();
    else if (e.key === 'r' || e.key === 'R') { showRanking = !showRanking; scheduleRender(); }
    else if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('bar-hidden');
    else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
  });
  // 글꼴(Pretendard)이 늦게 도착하면 크기를 다시 잰다
  document.fonts?.ready.then(() => scheduleRender());
}

function subscribe() {
  onConnection(ok => { connected = ok; scheduleRender(); });
  onValue(ref(db, 'quiz/state'), s => { state = norm(s.val()); scheduleRender(); },
    e => { console.error(e); $('#stage').innerHTML = `<div class="center"><div class="big">quiz/state를 읽을 수 없어요</div><p class="note">${esc(e.message)}</p></div>`; });
  onValue(ref(db, 'quiz/answers'), s => { answers = s.val() || {}; scheduleRender(); });
  onValue(ref(db, 'claims'), s => { claims = s.val() || {}; scheduleRender(); });
}

// ── 로그인 ───────────────────────────────────
export async function startHost() {
  const { auth, onAuthStateChanged, signInWithEmailAndPassword, signOut } = await loadAuth();
  let started = false;

  $('#login').onsubmit = async e => {
    e.preventDefault();
    $('#login-msg').textContent = '';
    $('#login-btn').disabled = true;
    try {
      await signInWithEmailAndPassword(auth, $('#email').value.trim(), $('#password').value);
    } catch (err) {
      $('#login-msg').textContent = /invalid|wrong|user-not-found/i.test(err.code) ? '이메일 또는 비밀번호가 맞지 않아요' : `로그인 실패: ${err.code}`;
    }
    $('#login-btn').disabled = false;
  };
  $('#logout').onclick = () => confirm('로그아웃할까요?') && signOut(auth);

  onAuthStateChanged(auth, user => {
    document.body.classList.toggle('authed', !!user);
    if (user && !started) { started = true; bindControls(); subscribe(); render(); }
    if (!user && started) location.reload();
  });
}

// 레이아웃 확인용 — 로그인 없이 가짜 상태로 그려본다 (DB에는 아무것도 안 쓴다)
export function previewWith(fake) {
  state = norm(fake.state); answers = fake.answers || {}; claims = fake.claims || {}; page = fake.page ?? 0; cover = !!fake.cover;
  lastKey = `${state.phase}:${state.index}`;
  document.body.classList.add('authed');
  render();
}
