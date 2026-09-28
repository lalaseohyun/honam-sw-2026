// 조 선택 + 기기 1대 고정
//
// 모두 같은 링크로 들어와 조를 고른다. 고른 폰이 /claims/{team}에 자기 기기 ID를
// 기록하고, 이후 다른 폰은 규칙에 막혀 그 조를 고를 수 없다.
// 풀어주는 방법: 그 폰에서 "조 변경"(released: true 기록) 또는 운영자가 /claims/{team} 삭제.

import { db, ref, set, onValue, serverTimestamp, withTimeout, isPermissionDenied, read } from './db.js';

const SESSION_KEY = 'honam.session';
const DEVICE_KEY = 'honam.device';

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} }
};

// ── 로컬 세션 ────────────────────────────────
export function loadSession() {
  const s = store.get(SESSION_KEY);
  return s && Number.isInteger(s.teamNo) ? s : null;
}
export const saveSession = teamNo => store.set(SESSION_KEY, { teamNo });
export const clearSession = () => store.del(SESSION_KEY);

export function deviceId() {
  let id = store.get(DEVICE_KEY);
  if (!id) {
    id = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    store.set(DEVICE_KEY, id);
  }
  return id;
}

// claim 값 → 'free' | 'mine' | 'other'
export const claimStatus = v =>
  !v || v.released ? 'free' : v.device === deviceId() ? 'mine' : 'other';

// ── 서버 ────────────────────────────────────
// 반환: 'ok' | 'taken' (다른 폰이 이미 사용 중). 네트워크 문제는 throw
export async function claimTeam(teamNo) {
  try {
    await withTimeout(
      set(ref(db, `claims/${teamNo}`), { device: deviceId(), at: serverTimestamp() }),
      10000, '접속 등록'
    );
  } catch (e) {
    if (isPermissionDenied(e)) return 'taken';
    throw e;
  }
  // 저장 재확인 (사양서 §8-2)
  if (claimStatus(await read(`claims/${teamNo}`)) !== 'mine') throw new Error('접속 등록을 확인하지 못했어요');
  return 'ok';
}

// 이 폰이 잡고 있던 조를 놓는다 ("조 변경")
export async function releaseTeam(teamNo) {
  await withTimeout(
    set(ref(db, `claims/${teamNo}`), { device: deviceId(), at: serverTimestamp(), released: true }),
    10000, '조 해제'
  );
}

// 전체 조 사용 현황. cb({ [teamNo]: 'free'|'mine'|'other' })
export function watchClaims(cb) {
  return onValue(ref(db, 'claims'), s => {
    const all = s.val() || {};
    const out = {};
    for (const n of Object.keys(all)) out[n] = claimStatus(all[n]);
    cb(out);
  });
}
