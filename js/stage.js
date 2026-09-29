// 프로젝터 화면(host.html, board.html) 공용 — 전체화면 버튼
//
// 브라우저 전체화면만 켠다. 확대(zoom)는 하지 않는다 — 확대하면 레이아웃 폭이 바뀌어
// 문제 줄바꿈이 달라졌다(행사 당일 요청: "비율은 똑같이, 화면만 꽉 차게").
// 글자 크기는 원래 화면 폭(vw)에 맞춰 잡혀 있어서, 전체화면이 되면 그만큼 자연스럽게 채워진다.

let btn = null;

function sync() {
  const on = !!document.fullscreenElement;
  document.body.classList.toggle('fs', on);
  if (btn) btn.textContent = on ? '⛶ 전체화면 끄기' : '⛶ 전체화면';
}

export function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

/**
 * @param {HTMLElement} button   전체화면 버튼
 * @param {() => void} [onResize]  화면 크기가 바뀐 뒤 다시 맞출 일 (예: 문제 글자 크기 다시 재기)
 */
export function setupFullscreen(button, onResize = () => {}) {
  btn = button;
  btn.addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', sync);
  let t;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(onResize, 100); });
  sync();
}
