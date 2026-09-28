import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getDatabase, ref, get, set, update, remove, onValue, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

const firebaseConfig = {
  apiKey: "AIzaSyDlZvM92UiV8lhW3iJrKGf_TuOjoz8XPjk",
  authDomain: "honam-4f631.firebaseapp.com",
  // 지역 포함 전체 주소 (사양서 §8-5)
  databaseURL: "https://honam-4f631-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "honam-4f631",
  storageBucket: "honam-4f631.firebasestorage.app",
  messagingSenderId: "613380214854",
  appId: "1:613380214854:web:281157185c8c1006867a47"
};

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

// 운영자·진행자 로그인 (host.html, admin.html). 참가자 화면은 불러오지 않는다
export const loadAuth = async () => {
  const m = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
  return { auth: m.getAuth(app), ...m };
};

export { ref, get, set, update, remove, onValue, serverTimestamp };

export class TimeoutError extends Error {
  constructor(label) { super(`${label || '요청'} 시간 초과`); this.name = 'TimeoutError'; }
}

// RTDB 쓰기는 오프라인이면 Promise가 끝나지 않는다. UI가 멈추지 않도록 상한을 둔다.
export function withTimeout(promise, ms = 10000, label) {
  let t;
  return Promise.race([
    promise,
    new Promise((_, reject) => { t = setTimeout(() => reject(new TimeoutError(label)), ms); })
  ]).finally(() => clearTimeout(t));
}

export const isPermissionDenied = e =>
  /PERMISSION_DENIED|permission.denied/i.test(`${e?.code || ''} ${e?.message || ''}`);

export async function read(path, ms = 10000) {
  const snap = await withTimeout(get(ref(db, path)), ms, `${path} 읽기`);
  return snap.val();
}

// 연결 상태 구독. 콜백에 true/false
export function onConnection(cb) {
  return onValue(ref(db, '.info/connected'), s => cb(s.val() === true));
}
