// 프로젝터 화면(host.html, board.html) 공용 — 전체화면 + 화면 전체 확대
//
// 전체화면을 켜면 페이지 전체(상단 바·본문·조작 바)를 한 배율로 키운다.
// 배율은 MAX에서 시작해 fitTarget()이 넘치지 않을 때까지 줄여서 정한다 —
// 문제 글이 길거나 해설이 붙어도 스크롤이 생기지 않게.
// 화면이 다시 그려질 때마다 refit()을 불러야 한다(내용 길이가 바뀌므로).

const MAX = 1.6, STEP = 0.05;

let on = false;
let fitTarget = () => null;
let btn = null;

function setZoom(k) {
  document.documentElement.style.zoom = k === 1 ? '' : String(k);
  // 100dvh(height·min-height)는 확대 배율을 곱해 계산되므로 높이를 직접 맞춘다
  document.body.style.height = k === 1 ? '' : `${window.innerHeight / k}px`;
  document.body.style.minHeight = k === 1 ? '' : '0';
}

const overflows = el => el && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1);

export function refit() {
  if (!on) { setZoom(1); return; }
  let k = MAX;
  for (; k > 1; k -= STEP) {
    setZoom(k);
    const t = fitTarget();
    const pageOver = document.documentElement.scrollHeight > window.innerHeight + 1 ||
                     document.documentElement.scrollWidth > window.innerWidth + 1;
    if (!pageOver && !(typeof t === 'boolean' ? t : overflows(t))) break;
  }
  setZoom(Math.max(1, Math.round(k * 100) / 100));
  fitTarget();   // 정한 배율에서 한 번 더 맞춘다 (fitTarget이 글자 크기를 조정하는 화면용)
}

function setOn(v) {
  on = v;
  document.body.classList.toggle('fs', on);
  if (btn) btn.textContent = on ? '⛶ 전체화면 끄기' : '⛶ 전체화면';
  refit();
}

export function toggleFullscreen() {
  if (!on) {
    setOn(true);
    document.documentElement.requestFullscreen?.().catch(() => {});
  } else {
    setOn(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }
}

/**
 * @param {HTMLElement} button   전체화면 버튼
 * @param {() => HTMLElement|boolean} target  넘치는지 확인할 요소 (보통 본문 영역),
 *        또는 직접 판단한 "넘친다" 여부(true = 넘침)
 */
export function setupFullscreen(button, target) {
  btn = button;
  fitTarget = target;
  btn.textContent = '⛶ 전체화면';
  btn.addEventListener('click', toggleFullscreen);
  // Esc로 브라우저 전체화면만 빠져나오면 확대도 함께 끈다
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && on) setOn(false); });
  let t;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(refit, 100); });
}
