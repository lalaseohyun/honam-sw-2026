// 참가자 폰 — 퀴즈 응답
//
// 구독: quiz/live (문제·단계), session/resetAt (전체 리셋 신호 — watchQuizReset, 페이지 단위).
// 쓰기: quiz/answers/{qid}/{teamNo} — 자기 키만. 답안은 호스트만 읽을 수 있으므로
// 내가 고른 답은 이 폰의 localStorage에 둔다 (쓰기 성공 = 서버 확인).
// ms는 이 폰이 보기를 처음 본 시각부터 잰다 (사양서 §6-2).

import { db, ref, set, onValue, serverTimestamp, withTimeout, isPermissionDenied } from '../db.js';

const LOCAL = qid => `honam.quiz.${qid}`;
const RESET_KEY = 'honam.quiz.resetAt';

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} }
};

// 이 폰에 남은 퀴즈 기록(보기 처음 본 시각·고른 답)을 모두 버린다.
// 새로 조를 고를 때도 부른다 — 다른 조였을 때의 기록이 "제출됨"으로 보이지 않도록.
export function clearQuizLocal() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('honam.quiz.q')) localStorage.removeItem(k);
  } catch {}
}

// 전체 리셋 신호(session/resetAt)가 바뀌면 이 폰의 퀴즈 기록을 버린다.
// 퀴즈 화면이 떠 있는지와 무관하게 페이지가 열리자마자 한 번 걸어둔다 —
// 리셋과 동시에 대표 폰 해제가 오면 퀴즈 화면이 먼저 닫혀 신호를 못 받기 때문.
const resetListeners = new Set();
let resetWatching = false;
export function watchQuizReset() {
  if (resetWatching) return;
  resetWatching = true;
  onValue(ref(db, 'session/resetAt'), s => {
    const v = s.val();
    if (v && v !== store.get(RESET_KEY)) {
      clearQuizLocal();
      store.set(RESET_KEY, v);
      resetListeners.forEach(fn => fn());
    }
  });
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

/**
 * @param {HTMLElement} el     그릴 자리
 * @param {number} teamNo
 * @param {(needsAnswer:boolean)=>void} [onAttention]  답할 문제가 열렸는지 (탭 배지용)
 * @returns {() => void} 구독 해제
 */
export function mountQuiz(el, teamNo, onAttention = () => {}) {
  let live = null;
  let sending = null;   // 전송 중인 보기 번호
  let error = '';

  const mine = () => (live?.qid && store.get(LOCAL(live.qid))) || {};

  function onLive(v) {
    live = v || { phase: 'lobby' };
    error = '';
    if (live.phase === 'quiz') {
      const key = LOCAL(live.qid);
      // 문제가 처음 상태로 돌아왔으면(문제별 리셋) 이 폰의 기록도 버린다
      if (live.stage === 'grid' || live.stage === 'ready') store.del(key);
      // 보기를 처음 본 시각
      if (live.stage === 'open' && !store.get(key)?.seenAt) store.set(key, { seenAt: Date.now() });
    }
    render();
  }


  async function choose(i) {
    if (live?.stage !== 'open' || sending !== null) return;
    const qid = live.qid;
    const rec = mine();
    const ms = Math.max(0, Date.now() - (rec.seenAt || Date.now()));
    sending = i; error = ''; render();
    try {
      await withTimeout(
        set(ref(db, `quiz/answers/${qid}/${teamNo}`), { choice: i, ms, at: serverTimestamp() }),
        8000, '답 제출'
      );
      store.set(LOCAL(qid), { ...rec, choice: i, ms });
    } catch (e) {
      console.error(e);
      error = isPermissionDenied(e) ? '이미 마감된 문제예요.' : '전송하지 못했어요. 다시 눌러주세요.';
    }
    sending = null;
    render();
  }

  el.addEventListener('click', e => {
    const b = e.target.closest('[data-choice]');
    if (b) choose(Number(b.dataset.choice));
  });

  // ── 그리기 ───────────────────────────────
  function render() {
    const needs = live?.stage === 'open' && typeof mine().choice !== 'number';
    onAttention(needs);
    try { el.innerHTML = view(); }
    catch (e) { console.error('퀴즈 화면 그리기 실패', e, live); }
  }

  // 부안 청년포럼과 같은 구성 — 문제 문구·보기 글자는 빔프로젝터에서 읽는다.
  // 손에 든 화면은 문제 번호와 보기 번호만 큼직하게 눌러 제출하는 키패드다.
  const pulse = (title, sub, slim = false) => `<div class="waitbox ${slim ? 'slim' : ''}">
    <div class="pulse"></div><div class="wt">${title}</div>${sub ? `<div class="ws">${sub}</div>` : ''}</div>`;

  function view() {
    if (!live) return `<div class="center qwait"><div class="pulse"></div></div>`;
    if (live.phase === 'lobby') return `<div class="center qwait"><div class="pulse"></div><div class="sub">곧 시작합니다</div></div>`;
    if (live.phase === 'final') return finalView();

    const head = `<div class="badges"><span class="badge num">문제 ${live.no} / ${live.total}</span></div>`;

    if (live.stage === 'grid' && Array.isArray(live.grid)) {
      return `${head}<div class="memtitle">잘 기억하세요!</div>
        <div class="memgrid">${live.grid.map(row => row.map(c => `<span>${esc(c)}</span>`).join('')).join('')}</div>`;
    }
    // 보기가 아직 안 실렸으면(쓰기 도중의 중간 상태 포함) 대기 화면으로
    if (live.stage === 'ready' || !Array.isArray(live.choices)) {
      return head + pulse('화면의 문제를 읽어주세요', '보기가 열리면 여기서 번호를 누르면 돼요');
    }

    const my = mine();
    const chosen = sending ?? my.choice;
    const has = typeof chosen === 'number';

    if (live.stage === 'revealed') return head + revealView(my);

    // 마감됐는데 아직 정답 공개 전 — 기다리는 화면만
    if (live.stage === 'closed') {
      return head + pulse(has ? `${chosen + 1}번 제출 완료` : '답을 제출하지 못했어요', '잠시만 기다려주세요<br>곧 정답을 공개합니다');
    }

    const top = error ? `<div class="status err">${error}</div>`
      : sending !== null ? `<div class="status">보내는 중…</div>`
      : has ? pulse(`✓ ${chosen + 1}번 제출 완료`, '다른 조가 제출하는 동안 기다려주세요<br>마감 전까지 다시 고를 수 있어요', true)
      : `<div class="status">답을 골라주세요 · 조당 대표 한 분만</div>`;
    const keys = live.choices.map((_, i) =>
      `<button class="key ${i === chosen ? 'sel' : ''}" data-choice="${i}"><span class="n">${i + 1}</span></button>`).join('');
    return `${head}${top}<div class="keys">${keys}</div>`;
  }

  // 정답 공개 — 우리 조가 맞았는지와 점수·순위만 짧게 (문제·해설은 빔프로젝터에서)
  function revealView(my) {
    const none = typeof my.choice !== 'number';
    const ok = !none && my.choice === live.answer;
    const r = (live.ranking || []).find(x => x.teamNo === teamNo);
    return `<div class="verdict ${none ? '' : ok ? 'ok' : 'no'}">
        <div class="mk">${none ? '–' : ok ? 'O' : 'X'}</div>
        <div class="lb">${none ? '답을 제출하지 않았어요' : ok ? '정답입니다!' : '아쉬워요'}</div>
        <div class="an">정답 · ${live.answer + 1}번</div>
      </div>
      ${r ? `<div class="scorebar">
        <div class="sb"><div class="k">우리 조 점수</div><div class="v">${r.correct}</div></div>
        <div class="sb"><div class="k">현재 순위</div><div class="v">${r.rank}위</div></div>
      </div>` : ''}`;
  }

  function finalView() {
    const r = (live.ranking || []).find(x => x.teamNo === teamNo);
    if (!r) return `<div class="center qwait"><div class="pulse"></div><div class="sub">최종 순위 집계 중</div></div>`;
    const medal = { 1: '🥇', 2: '🥈', 3: '🥉' }[r.rank] || '🎉';
    return `<div class="center">
      <div class="medal">${medal}</div>
      <div class="sub">${teamNo}조 최종</div>
      <div class="rankbig">${r.rank}위</div>
      <div class="big">${r.correct} / ${live.total || '?'} 문제 정답</div></div>`;
  }

  const offLive = onValue(ref(db, 'quiz/live'), s => onLive(s.val()), e => { console.error(e); });
  watchQuizReset();
  const onReset = () => render();
  resetListeners.add(onReset);
  render();

  return () => { offLive(); resetListeners.delete(onReset); };
}
