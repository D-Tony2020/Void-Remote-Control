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

function smoothScroll() {
  if (!isScrolling) return;

  if (Math.abs(scrollSpeed) > 0.3) {
    window.scrollBy({ top: scrollSpeed, behavior: 'instant' });
    requestAnimationFrame(smoothScroll);
  } else {
    isScrolling = false;
  }
}
