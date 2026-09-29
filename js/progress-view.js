// 참가자 폰 — 진행 제출 탭 (6단계). 운영자 화면(admin.html)의 '직접 입력'도 이 화면을 그대로 쓴다
//
// 단계 목록은 한 번만 그리고, 상태 글자만 제자리에서 바꾼다 — 입력 중인 칸이
// 다시 그려져 날아가지 않도록. 입력 중인 글은 이 폰에 임시 저장(draft)해 둔다.

import { db, ref, get, onValue } from './db.js';
import { STAGES } from './data.js';
import {
  stageById, preparePhoto, uploadPdf, buildSubmission, submit,
  onQueueChange, startQueueWorker, PDF_MAX
} from './progress.js';

const MAX_PHOTOS = 3;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const hhmm = t => new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });

const DRAFT = (team, sid) => `honam.draft.${team}.${sid}`;
const draft = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} }
};

/**
 * @param {HTMLElement} el
 * @param {number} teamNo
 * @param {{openStage?: string}} [opts]  처음부터 펼쳐 둘 단계 (운영자 화면에서 칸을 눌렀을 때)
 */
export function mountProgress(el, teamNo, { openStage } = {}) {
  startQueueWorker();

  let pub = {};          // /public/{team}
  let queue = [];
  let openId = null;
  let busy = false;      // 제출 중 — 화면 전환·새로고침 막기
  // 열린 폼의 상태
  let form = null;       // { sid, photos:[{full,thumb}], pdf:{pdfUrl,pdfName}|null, pdfFile:File|null }

  el.innerHTML = `
    <div class="qwarn" id="pg-queue" hidden></div>
    <div class="stages">${STAGES.map((s, i) => `
      <section class="stg" data-stage="${s.id}">
        <button class="stg-head" data-open="${s.id}">
          <span class="sn">${i + 1}</span><span class="nm">${esc(s.name)}</span>
          <span class="stt" data-stt="${s.id}">미제출</span><span class="chev">›</span>
        </button>
        <div class="stg-body" data-body="${s.id}" hidden></div>
      </section>`).join('')}
    </div>`;

  const $ = s => el.querySelector(s);

  // ── 상태 표시 ─────────────────────────────
  function paintStatus() {
    const queued = new Set(queue.filter(q => q.key.startsWith(`${teamNo}/`)).map(q => q.key.split('/')[1]));
    for (const s of STAGES) {
      const stt = $(`[data-stt="${s.id}"]`);
      const sec = $(`[data-stage="${s.id}"]`);
      const done = pub[s.id]?.submittedAt;
      if (queued.has(s.id)) { stt.textContent = '재전송 대기'; stt.className = 'stt wait'; }
      else if (done) { stt.textContent = `제출 ${hhmm(done)}`; stt.className = 'stt done'; }
      else { stt.textContent = '미제출'; stt.className = 'stt'; }
      sec.classList.toggle('done', !!done && !queued.has(s.id));
    }
    const qw = $('#pg-queue');
    const mine = queue.filter(q => q.key.startsWith(`${teamNo}/`));
    qw.hidden = !mine.length;
    qw.innerHTML = `<span class="spinner"></span>재전송 대기 ${mine.length}건 · 연결되면 자동으로 보내요. 이 화면을 닫아도 괜찮아요.`;
  }

  // ── 단계 열기 ─────────────────────────────
  async function open(sid) {
    if (busy) return;
    if (openId) { $(`[data-body="${openId}"]`).hidden = true; $(`[data-stage="${openId}"]`).classList.remove('open'); }
    if (openId === sid) { openId = null; form = null; return; }
    openId = sid;
    const body = $(`[data-body="${sid}"]`);
    $(`[data-stage="${sid}"]`).classList.add('open');
    body.hidden = false;
    body.innerHTML = `<div class="pg-loading"><span class="spinner"></span>불러오는 중…</div>`;

    // 이미 낸 내용이 있으면 불러와 채운다 (사진·PDF 포함)
    let prev = null;
    try { prev = (await get(ref(db, `private/${teamNo}/${sid}`))).val(); } catch {}
    if (openId !== sid) return;
    const d = draft.get(DRAFT(teamNo, sid));
    form = {
      sid,
      photos: (prev?.photos || []).map(full => ({ full, thumb: null })),
      pdf: prev?.pdfUrl ? { pdfUrl: prev.pdfUrl, pdfName: prev.pdfName } : null,
      pdfFile: null
    };
    renderForm(body, stageById(sid), { ...(prev?.fields || {}), ...(d?.fields || {}) }, !!prev, !!d);
    body.closest('.stg').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function renderForm(body, stage, values, submitted, fromDraft) {
    body.innerHTML = `
      ${fromDraft ? `<div class="pg-note">이 폰에 임시 저장된 글을 불러왔어요.</div>` : ''}
      ${stage.fields.map(f => `
        <label class="fld">
          <span class="fl">${esc(f.label)}</span>
          ${f.hint ? `<span class="fh">${esc(f.hint)}</span>` : ''}
          ${f.long
            ? `<textarea name="${f.key}" rows="3">${esc(values[f.key] || '')}</textarea>`
            : `<input name="${f.key}" value="${esc(values[f.key] || '')}" autocomplete="off">`}
        </label>`).join('')}
      ${stage.photo ? `
        <div class="fld">
          <span class="fl">사진 <small>(선택 · 최대 ${MAX_PHOTOS}장 · 첫 장이 현황판에 떠요)</small></span>
          <div class="photos" data-photos></div>
          <label class="pickbtn" data-pick-photo>＋ 사진 추가<input type="file" accept="image/*" multiple hidden data-photo-input></label>
        </div>` : ''}
      ${stage.pdf ? `
        <div class="fld">
          <span class="fl">발표자료 PDF <small>(20MB 이하)</small></span>
          <div class="pdfcur" data-pdfcur></div>
          <label class="pickbtn">PDF 고르기<input type="file" accept="application/pdf,.pdf" hidden data-pdf-input></label>
          <div class="pbar" data-pdfbar hidden><i></i></div>
        </div>` : ''}
      <div class="pg-msg" data-msg></div>
      <button class="btn wide" data-submit>${submitted ? '수정해서 다시 제출' : '제출하기'}</button>`;
    paintPhotos(body);
    paintPdf(body);
  }

  function paintPhotos(body) {
    const box = body.querySelector('[data-photos]');
    if (!box) return;
    box.innerHTML = form.photos.map((p, i) => `
      <div class="ph"><img src="${p.thumb || p.full}" alt=""><button data-rm-photo="${i}" aria-label="사진 빼기">✕</button></div>`).join('');
    body.querySelector('[data-pick-photo]').hidden = form.photos.length >= MAX_PHOTOS;
  }

  function paintPdf(body) {
    const cur = body.querySelector('[data-pdfcur]');
    if (!cur) return;
    if (form.pdfFile) cur.innerHTML = `새 파일: <b>${esc(form.pdfFile.name)}</b> (${(form.pdfFile.size / 1048576).toFixed(1)}MB)`;
    else if (form.pdf) cur.innerHTML = `제출한 파일: <a href="${esc(form.pdf.pdfUrl)}" target="_blank" rel="noopener">${esc(form.pdf.pdfName)}</a>`;
    else cur.textContent = '아직 올린 파일이 없어요';
  }

  function setMsg(body, text, kind = '') {
    const m = body.querySelector('[data-msg]');
    m.className = `pg-msg ${kind}`;
    m.innerHTML = text;
  }

  // ── 제출 ─────────────────────────────────
  async function doSubmit(body) {
    const stage = stageById(form.sid);
    const fields = {};
    for (const f of stage.fields) fields[f.key] = body.querySelector(`[name="${f.key}"]`).value.trim();

    const empty = stage.fields.filter(f => !fields[f.key]);
    if (empty.length) return setMsg(body, `${empty.map(f => f.label).join(', ')}을(를) 채워주세요.`, 'err');
    if (stage.pdf && !form.pdfFile && !form.pdf) return setMsg(body, '발표자료 PDF를 골라주세요.', 'err');

    busy = true;
    const btn = body.querySelector('[data-submit]');
    btn.disabled = true;
    body.querySelectorAll('input, textarea').forEach(x => x.disabled = true);
    setMsg(body, `<span class="spinner"></span>제출 중… 화면을 닫지 마세요`);

    try {
      // PDF는 파일이 커서 이 폰에 보관할 수 없다 — 올리기 실패는 바로 알린다
      if (stage.pdf && form.pdfFile) {
        const bar = body.querySelector('[data-pdfbar]');
        bar.hidden = false;
        try {
          form.pdf = await uploadPdf(teamNo, form.pdfFile, p => { bar.firstElementChild.style.width = `${Math.round(p * 100)}%`; });
          form.pdfFile = null;
        } catch (e) {
          console.error(e);
          throw new Error(`PDF를 올리지 못했어요. ${e.message?.includes('PDF') || e.message?.includes('MB') ? e.message : '연결을 확인하고 다시 제출해 주세요.'}`);
        } finally { bar.hidden = true; }
      }
      // 불러온 사진은 썸네일이 없다 — 첫 장만 만들면 된다
      if (form.photos[0] && !form.photos[0].thumb) {
        const blob = await (await fetch(form.photos[0].full)).blob();
        form.photos[0] = await preparePhoto(blob);
      }

      const r = await submit(buildSubmission(teamNo, form.sid, { fields, photos: form.photos, pdf: form.pdf }));
      draft.del(DRAFT(teamNo, form.sid));
      if (r === 'ok') {
        setMsg(body, `✓ 제출 완료 · ${hhmm(Date.now())} · 서버 저장까지 확인했어요`, 'ok');
        btn.textContent = '수정해서 다시 제출';
      } else {
        setMsg(body, '연결이 불안정해서 이 폰에 보관했어요. 연결되면 자동으로 보내요.', 'warn');
      }
    } catch (e) {
      setMsg(body, e.message || '제출하지 못했어요. 다시 눌러주세요.', 'err');
    }

    busy = false;
    btn.disabled = false;
    body.querySelectorAll('input, textarea').forEach(x => x.disabled = false);
  }

  // ── 이벤트 ───────────────────────────────
  el.addEventListener('click', e => {
    const head = e.target.closest('[data-open]');
    if (head) return open(head.dataset.open);
    const body = e.target.closest('[data-body]');
    if (!body || !form) return;
    const rm = e.target.closest('[data-rm-photo]');
    if (rm && !busy) { form.photos.splice(Number(rm.dataset.rmPhoto), 1); paintPhotos(body); return; }
    if (e.target.closest('[data-submit]') && !busy) doSubmit(body);
  });

  el.addEventListener('change', async e => {
    const body = e.target.closest('[data-body]');
    if (!body || !form) return;
    if (e.target.matches('[data-photo-input]')) {
      const files = [...e.target.files].slice(0, MAX_PHOTOS - form.photos.length);
      e.target.value = '';
      setMsg(body, `<span class="spinner"></span>사진 줄이는 중…`);
      try { for (const f of files) form.photos.push(await preparePhoto(f)); setMsg(body, ''); }
      catch (err) { setMsg(body, err.message || '사진을 읽지 못했어요.', 'err'); }
      paintPhotos(body);
    }
    if (e.target.matches('[data-pdf-input]')) {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      if (f.size >= PDF_MAX) return setMsg(body, '20MB보다 작은 파일만 올릴 수 있어요.', 'err');
      form.pdfFile = f;
      setMsg(body, '');
      paintPdf(body);
    }
  });

  // 입력 중인 글은 이 폰에 임시 저장
  el.addEventListener('input', e => {
    const body = e.target.closest('[data-body]');
    if (!body || !form || !e.target.name) return;
    const fields = {};
    body.querySelectorAll('[name]').forEach(x => { fields[x.name] = x.value; });
    draft.set(DRAFT(teamNo, form.sid), { fields });
  });

  const onBeforeUnload = e => { if (busy) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', onBeforeUnload);

  const offPub = onValue(ref(db, `public/${teamNo}`), s => { pub = s.val() || {}; paintStatus(); });
  const offQ = onQueueChange(q => { queue = q; paintStatus(); });
  if (openStage) open(openStage);

  return () => { offPub(); offQ(); window.removeEventListener('beforeunload', onBeforeUnload); };
}
