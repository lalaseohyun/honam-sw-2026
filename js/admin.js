// 운영자 화면 (admin.html) — 로그인 필요
//   · 제출 건수 카운터: public(현황판)과 private(원본)을 따로 세어 대조 (사양서 §8-6)
//   · 전체 제출물 열람 · 삭제
//   · 조별 대표 폰 해제 (PIN 초기화를 대신함)
//   · 진행 제출 직접 입력 — 참가자 폰의 입력 화면(progress-view.js)을 그대로 띄운다
//   · JSON 전체 백업 · CSV 내보내기 (사양서 §8-7)

import { db, ref, get, update, remove, onValue, onConnection, withTimeout, loadAuth } from './db.js';
import { TEAMS, TEAM_NOS, STAGES } from './data.js';
import { toCsv, progressRows, quizRows, countSubmissions, fmtTime } from './export.js';
import { mountProgress } from './progress-view.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const hhmm = t => t ? new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';

const data = { pub: {}, priv: {}, claims: {}, connected: false, loaded: false };
let detail = null;   // { n, sid } — 열려 있는 제출물

// ── 그리기 ───────────────────────────────────
let queued = false;
const scheduleRender = () => {
  if (queued) return;
  queued = true;
  setTimeout(() => { queued = false; render(); }, 0);
};

export function renderInto(root, d, openDetail) {
  const counts = countSubmissions(d.pub, d.priv);
  const totalPub = counts.reduce((a, c) => a + c.pub, 0);
  const totalPriv = counts.reduce((a, c) => a + c.priv, 0);
  const claimed = TEAM_NOS.filter(n => d.claims[n] && !d.claims[n].released);

  root.innerHTML = `
    <section class="counter" style="--cols:${STAGES.length + 1}">
      <div class="big-count">
        <div class="k">제출 건수</div>
        <div class="v"><b>${totalPriv}</b> / ${TEAM_NOS.length * STAGES.length}</div>
        <div class="chk ${totalPub === totalPriv ? 'ok' : 'bad'}">
          ${totalPub === totalPriv ? '✓ 현황판과 원본 건수 일치' : `⚠ 현황판 ${totalPub}건 · 원본 ${totalPriv}건 — 불일치`}
        </div>
      </div>
      ${counts.map((c, i) => `
        <div class="stage-count ${c.pub !== c.priv ? 'bad' : ''}">
          <div class="k">${i + 1}. ${esc(c.name)}</div>
          <div class="v"><b>${c.priv}</b>/${TEAM_NOS.length}</div>
          ${c.pub !== c.priv ? `<div class="warn">현황판 ${c.pub}</div>` : ''}
        </div>`).join('')}
      <div class="stage-count">
        <div class="k">대표 폰 접속</div>
        <div class="v"><b>${claimed.length}</b>/${TEAM_NOS.length}</div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>조별 제출물</h2>
        <span class="hint">칸을 누르면 내용을 볼 수 있어요</span>
      </div>
      <div class="tablewrap"><table class="grid">
        <thead><tr>
          <th>조</th><th>대표 폰</th>
          ${STAGES.map((s, i) => `<th>${i + 1}. ${esc(s.name)}</th>`).join('')}
        </tr></thead>
        <tbody>${TEAM_NOS.map(n => {
          const c = d.claims[n];
          const phone = c && !c.released
            ? `<span class="on">● ${hhmm(c.at)} 접속</span><button class="mini" data-release="${n}">해제</button>`
            : `<span class="off">—</span>`;
          return `<tr>
            <th class="tn" title="${esc(TEAMS[n].members.join(', '))}">${n}조<button class="mini entry-btn" data-entry="${n}">입력</button></th>
            <td class="phone">${phone}</td>
            ${STAGES.map(s => {
              const v = d.priv[n]?.[s.id];
              const p = d.pub[n]?.[s.id];
              if (!v) return `<td class="sub empty">${p ? '<span class="warn">현황판에만 있음</span>' : `<button data-entry="${n}:${s.id}" title="${n}조 ${esc(s.name)} 직접 입력">＋</button>`}</td>`;
              const extra = v.pdfName ? '📄' : v.photos?.length ? `📷${v.photos.length}` : '';
              return `<td class="sub done"><button data-open="${n}:${s.id}">
                <span class="t">${hhmm(v.submittedAt)}</span><span class="x">${extra}</span>
                <span class="s">${esc(p?.summary ?? '')}</span></button></td>`;
            }).join('')}
          </tr>`;
        }).join('')}</tbody>
      </table></div>
      <div class="row-actions">
        <button class="ghost danger" data-release-all>대표 폰 전체 해제</button>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head"><h2>내보내기</h2><span class="hint">행사 끝나면 바로 JSON 백업을 받아두세요</span></div>
      <div class="exports">
        <button data-export="json"><b>JSON 전체 백업</b><span>제출물·사진·퀴즈·접속 기록 전부</span></button>
        <button data-export="csv"><b>진행 제출 CSV</b><span>조별 한 줄 · 엑셀에서 바로 열림</span></button>
        <button data-export="quiz"><b>퀴즈 결과 CSV</b><span>순위 · 정답 수 · 문제별 선택</span></button>
      </div>
    </section>

    ${openDetail ? detailView(d, openDetail) : ''}`;
}

function detailView(d, { n, sid }) {
  const s = STAGES.find(x => x.id === sid);
  const v = d.priv[n]?.[sid];
  if (!v) return '';
  return `<div class="modal" data-close>
    <div class="sheet" role="dialog" aria-label="${n}조 ${esc(s.name)}">
      <div class="sheet-head">
        <div><div class="k">${n}조 · ${esc(TEAMS[n].members.map(m => m.split(' ')[1]).join(' · '))}</div>
          <h3>${STAGES.indexOf(s) + 1}. ${esc(s.name)}</h3>
          <div class="k">제출 ${fmtTime(v.submittedAt)}</div></div>
        <button class="x" data-close aria-label="닫기">✕</button>
      </div>
      ${s.fields.map(f => `<div class="fv"><div class="fl">${esc(f.label)}</div><div class="fx">${esc(v.fields?.[f.key] || '')}</div></div>`).join('')}
      ${v.photos?.length ? `<div class="fv"><div class="fl">${esc(s.photoLabel || '사진')} ${v.photos.length}장</div>
        <div class="shots">${v.photos.map(src => `<img src="${esc(src)}" alt="">`).join('')}</div></div>` : ''}
      ${v.pdfUrl ? `<div class="fv"><div class="fl">발표자료</div><a class="pdf" href="${esc(v.pdfUrl)}" target="_blank" rel="noopener">📄 ${esc(v.pdfName)} 열기</a></div>` : ''}
      <div class="sheet-foot">
        <button class="ghost edit" data-entry="${n}:${sid}">수정하기</button>
        <button class="ghost danger" data-delete="${n}:${sid}">이 제출물 삭제</button>
      </div>
    </div>
  </div>`;
}

function render() {
  $('#dot').classList.toggle('live', data.connected);
  if (!data.loaded) return;
  const scroll = $('.modal .sheet')?.scrollTop;
  renderInto($('#app'), data, detail);
  if (scroll) $('.modal .sheet').scrollTop = scroll;
}

// ── 직접 입력 ────────────────────────────────
// 참가자 폰과 같은 입력 화면을 그 조 번호로 띄운다. 저장하면 현황판·그 조 폰에 바로 반영된다.
let unmountEntry = null;
function openEntry(n, sid) {
  closeEntry();
  detail = null; render();
  const box = $('#entry');
  box.hidden = false;
  box.innerHTML = `<div class="modal" data-entry-close>
    <div class="sheet entry-sheet" role="dialog" aria-label="${n}조 직접 입력">
      <div class="sheet-head">
        <div><div class="k">${esc(TEAMS[n].members.map(m => m.split(' ')[1]).join(' · '))}</div>
          <h3>${n}조 직접 입력</h3>
          <div class="k">저장하면 현황판과 ${n}조 폰에도 바로 반영돼요</div></div>
        <button class="x" data-entry-close aria-label="닫기">✕</button>
      </div>
      <div class="entry-body"></div>
    </div>
  </div>`;
  unmountEntry = mountProgress(box.querySelector('.entry-body'), n, { openStage: sid });
}
function closeEntry() {
  unmountEntry?.(); unmountEntry = null;
  const box = $('#entry');
  box.hidden = true; box.innerHTML = '';
}

// ── 동작 ─────────────────────────────────────
async function run(label, fn) {
  try { await withTimeout(fn(), 15000, label); }
  catch (e) { console.error(e); alert(`${label} 실패: ${e.message}`); }
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const stamp = () => fmtTime(Date.now()).replace(/[-: ]/g, '').replace(/^(\d{8})(\d{4}).*/, '$1-$2');

async function exportJson() {
  const paths = ['public', 'private', 'claims', 'quiz/state', 'quiz/live', 'quiz/answers', 'session'];
  const out = { exportedAt: fmtTime(Date.now()) };
  for (const p of paths) out[p] = (await withTimeout(get(ref(db, p)), 20000, p)).val();
  download(`honam-backup-${stamp()}.json`, JSON.stringify(out, null, 2), 'application/json');
}
async function exportCsv() {
  const priv = (await withTimeout(get(ref(db, 'private')), 20000, 'private')).val() || {};
  download(`honam-progress-${stamp()}.csv`, toCsv(progressRows(priv)), 'text/csv;charset=utf-8');
}
async function exportQuiz() {
  const [answers, state] = await Promise.all(['quiz/answers', 'quiz/state'].map(p => withTimeout(get(ref(db, p)), 20000, p)));
  const asked = state.val()?.asked;
  download(`honam-quiz-${stamp()}.csv`, toCsv(quizRows(answers.val() || {}, Array.isArray(asked) ? asked : Object.values(asked || {}))), 'text/csv;charset=utf-8');
}

function bind() {
  $('#app').addEventListener('click', async e => {
    const t = e.target;
    const en = t.closest('[data-entry]');
    if (en) { const [n, sid] = en.dataset.entry.split(':'); return openEntry(Number(n), sid); }
    const open = t.closest('[data-open]');
    if (open) { const [n, sid] = open.dataset.open.split(':'); detail = { n: Number(n), sid }; return render(); }
    if (t.matches('[data-close]')) { detail = null; return render(); }

    const del = t.closest('[data-delete]');
    if (del) {
      const [n, sid] = del.dataset.delete.split(':');
      const s = STAGES.find(x => x.id === sid);
      if (!confirm(`${n}조 "${s.name}" 제출물을 삭제할까요?\n현황판에서도 사라지고 되돌릴 수 없어요.`)) return;
      detail = null;
      return run('삭제', () => update(ref(db), { [`private/${n}/${sid}`]: null, [`public/${n}/${sid}`]: null }));
    }
    const rel = t.closest('[data-release]');
    if (rel) {
      const n = rel.dataset.release;
      if (!confirm(`${n}조 대표 폰 연결을 해제할까요?\n그 폰은 "연결 해제" 화면으로 바뀌고, 어떤 폰이든 ${n}조를 다시 고를 수 있어요.\n제출물은 그대로 남아요.`)) return;
      return run('대표 폰 해제', () => remove(ref(db, `claims/${n}`)));
    }
    if (t.closest('[data-release-all]')) {
      if (!confirm('10개 조 대표 폰 연결을 모두 해제할까요?\n제출물은 그대로 남아요.')) return;
      return run('전체 해제', () => remove(ref(db, 'claims')));
    }
    const ex = t.closest('[data-export]');
    if (ex) {
      ex.disabled = true;
      await run('내보내기', { json: exportJson, csv: exportCsv, quiz: exportQuiz }[ex.dataset.export]);
      ex.disabled = false;
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (unmountEntry) closeEntry();
    else if (detail) { detail = null; render(); }
  });
  $('#entry').addEventListener('click', e => { if (e.target.matches('[data-entry-close]')) closeEntry(); });
}

function subscribe() {
  onConnection(ok => { data.connected = ok; scheduleRender(); });
  let pending = 3;
  const ready = () => { if (--pending === 0) data.loaded = true; scheduleRender(); };
  const sub = (path, key) => {
    let first = true;
    onValue(ref(db, path), s => { data[key] = s.val() || {}; if (first) { first = false; ready(); } else scheduleRender(); },
      e => { $('#app').innerHTML = `<div class="panel">${esc(path)}를 읽을 수 없어요: ${esc(e.message)}</div>`; });
  };
  sub('public', 'pub');
  sub('private', 'priv');
  sub('claims', 'claims');
}

// ── 로그인 ───────────────────────────────────
export async function startAdmin() {
  const { auth, onAuthStateChanged, signInWithEmailAndPassword, signOut } = await loadAuth();
  let started = false;

  $('#login').onsubmit = async e => {
    e.preventDefault();
    $('#login-msg').textContent = '';
    $('#login-btn').disabled = true;
    try { await signInWithEmailAndPassword(auth, $('#email').value.trim(), $('#password').value); }
    catch (err) {
      $('#login-msg').textContent = /invalid|wrong|user-not-found/i.test(err.code) ? '이메일 또는 비밀번호가 맞지 않아요' : `로그인 실패: ${err.code}`;
    }
    $('#login-btn').disabled = false;
  };
  $('#logout').onclick = () => confirm('로그아웃할까요?') && signOut(auth);

  onAuthStateChanged(auth, user => {
    document.body.classList.toggle('authed', !!user);
    if (user && !started) { started = true; bind(); subscribe(); }
    if (!user && started) location.reload();
  });
}
