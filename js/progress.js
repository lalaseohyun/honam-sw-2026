// 진행 5단계 제출 로직 (사양서 §5, §8) — 화면은 progress-view.js
//
// 한 번 제출 = 한 번의 update()로 두 경로를 같이 쓴다.
//   /private/{team}/{stage} = { submittedAt, fields, photos[], pdfUrl?, pdfName? }
//   /public/{team}/{stage}  = { submittedAt, summary, thumb? }   ← 현황판은 이것만 본다
// 쓰기가 끝나면 두 경로를 다시 읽어 submittedAt이 같은지 확인한 뒤에야 "제출 완료".
// 실패하면 localStorage 큐에 넣고, 연결이 돌아오면 자동으로 다시 보낸다.

import { app, db, ref, update, get, onConnection, withTimeout } from './db.js';
import { STAGES } from './data.js';

export const stageById = id => STAGES.find(s => s.id === id);

// ── 요약 (현황판에 뜨는 한 줄) ─────────────────
export function summaryOf(stage, fields, pdfName) {
  if (stage.pdf) return `제출 완료 · ${pdfName || 'PDF'}`;
  const v = String(fields[stage.summary] || '').replace(/\s+/g, ' ').trim();
  return v.length > 60 ? v.slice(0, 59) + '…' : v;
}

// ── 사진 리사이즈 (사양서 §5: 원본 1200px, 썸네일 320px, JPEG 0.8) ──
async function loadImage(file) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch {}
  }
  return await new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('사진을 읽지 못했어요')); };
    img.src = url;
  });
}

function toJpeg(img, maxW, quality = 0.8) {
  const w0 = img.width, h0 = img.height;
  const k = Math.min(1, maxW / w0);
  const c = document.createElement('canvas');
  c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);   // 투명 PNG 대비
  g.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}

// → { full, thumb } (data URL)
export async function preparePhoto(file) {
  const img = await loadImage(file);
  return { full: toJpeg(img, 1200), thumb: toJpeg(img, 320) };
}

// ── PDF 업로드 (Storage) ───────────────────────
export const PDF_MAX = 20 * 1024 * 1024;

export async function uploadPdf(teamNo, file, onProgress = () => {}) {
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) throw new Error('PDF 파일만 올릴 수 있어요');
  if (file.size >= PDF_MAX) throw new Error('20MB보다 작은 파일만 올릴 수 있어요');
  const st = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js');
  const storage = st.getStorage(app);
  const safe = file.name.replace(/[\\/#?%*:|"<>]/g, '_');
  const r = st.ref(storage, `pdfs/${teamNo}/${Date.now()}_${safe}`);
  const task = st.uploadBytesResumable(r, file, { contentType: 'application/pdf' });
  await new Promise((res, rej) => task.on('state_changed',
    s => onProgress(s.bytesTransferred / s.totalBytes), rej, res));
  return { pdfUrl: await st.getDownloadURL(r), pdfName: file.name };
}

// ── 제출 ────────────────────────────────────
/**
 * @param {number} teamNo
 * @param {string} stageId
 * @param {{fields:Object, photos?:{full,thumb}[], pdf?:{pdfUrl,pdfName}}} data
 */
export function buildSubmission(teamNo, stageId, { fields, photos = [], pdf = null }) {
  const stage = stageById(stageId);
  const submittedAt = Date.now();
  const priv = { submittedAt, fields };
  if (photos.length) priv.photos = photos.map(p => p.full);
  if (pdf) Object.assign(priv, pdf);
  const pub = { submittedAt, summary: summaryOf(stage, fields, pdf?.pdfName) };
  if (photos[0]) pub.thumb = photos[0].thumb;
  return {
    key: `${teamNo}/${stageId}`,
    submittedAt,
    updates: { [`private/${teamNo}/${stageId}`]: priv, [`public/${teamNo}/${stageId}`]: pub }
  };
}

// 쓰고 → 다시 읽어 확인. 실패하면 throw
async function sendAndVerify(sub) {
  await withTimeout(update(ref(db), sub.updates), 15000, '제출');
  for (const path of Object.keys(sub.updates)) {
    const snap = await withTimeout(get(ref(db, `${path}/submittedAt`)), 10000, '제출 확인');
    if (snap.val() !== sub.submittedAt) throw new Error('저장을 확인하지 못했어요');
  }
}

// 반환: 'ok' (저장 확인됨) | 'queued' (이 폰에 보관, 자동 재전송)
export async function submit(sub) {
  try {
    await sendAndVerify(sub);
    dequeue(sub.key, sub.submittedAt);
    return 'ok';
  } catch (e) {
    console.warn('제출 실패 → 재전송 대기', e);
    enqueue(sub);
    return 'queued';
  }
}

// ── 재전송 큐 (localStorage) ───────────────────
const QKEY = 'honam.queue';
const listeners = new Set();

function readQ() { try { return JSON.parse(localStorage.getItem(QKEY)) || []; } catch { return []; } }
function writeQ(q) {
  try { localStorage.setItem(QKEY, JSON.stringify(q)); }
  catch (e) { console.error('재전송 큐 저장 실패 (저장 공간 부족?)', e); }
  listeners.forEach(fn => fn(q));
}
// 같은 단계는 최신 제출 하나만 남긴다
function enqueue(sub) { writeQ([...readQ().filter(x => x.key !== sub.key), sub]); }
function dequeue(key, submittedAt) {
  const q = readQ();
  const next = q.filter(x => !(x.key === key && x.submittedAt <= submittedAt));
  if (next.length !== q.length) writeQ(next);
}

export const pendingQueue = () => readQ();
export function onQueueChange(fn) { listeners.add(fn); fn(readQ()); return () => listeners.delete(fn); }

let flushing = false;
export async function flushQueue() {
  if (flushing) return;
  flushing = true;
  try {
    for (const sub of readQ()) {
      try { await sendAndVerify(sub); dequeue(sub.key, sub.submittedAt); }
      catch { break; }   // 아직 연결이 안 되면 나머지도 다음에
    }
  } finally { flushing = false; }
}

// 연결이 돌아오면, 그리고 20초마다 한 번씩 재시도
let started = false;
export function startQueueWorker() {
  if (started) return;
  started = true;
  onConnection(ok => { if (ok) flushQueue(); });
  window.addEventListener('online', flushQueue);
  setInterval(() => { if (readQ().length) flushQueue(); }, 20000);
}
