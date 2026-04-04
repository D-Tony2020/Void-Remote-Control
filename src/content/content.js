// ─── Smooth Scroll Controller ───
// Receives scroll commands from the side panel and smoothly scrolls the page.

let scrollSpeed = 0;
let isScrolling = false;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'gesture-scroll') {
    scrollSpeed = msg.speed;
    if (!isScrolling) {
      isScrolling = true;
      smoothScroll();
    }
  } else if (msg.type === 'gesture-stop') {
    scrollSpeed = 0;
    // isScrolling will self-terminate when speed decays to 0
  }
});

function findScrollableElement() {
  // Try the element currently under the viewport center
  const centerEl = document.elementFromPoint(
    window.innerWidth / 2,
    window.innerHeight / 2
  );

  // Walk up from center element to find the nearest scrollable container
  let el = centerEl;
  while (el && el !== document.documentElement) {
    const style = getComputedStyle(el);
    const overflowY = style.overflowY;
    if (
      (overflowY === 'auto' || overflowY === 'scroll') &&
      el.scrollHeight > el.clientHeight
    ) {
      return el;
    }
    el = el.parentElement;
  }

  // Fallback to documentElement or body
  return document.scrollingElement || document.documentElement;
}

function smoothScroll() {
  if (!isScrolling) return;

  if (Math.abs(scrollSpeed) > 0.3) {
    const target = findScrollableElement();
    target.scrollBy({ top: scrollSpeed, behavior: 'instant' });
    requestAnimationFrame(smoothScroll);
  } else {
    isScrolling = false;
  }
}
