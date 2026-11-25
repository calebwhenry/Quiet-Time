import { h } from "./ui";
import posterUrl from "./assets/dawn-poster.jpg";

// "Dawn": a reader on a hillside above the clouds. Muted, looping, never on the typing screen.
export const DAWN_VIDEO = "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260324_151826_c7218672-6e92-402c-9e45-f1e0f454bdc4.mp4";

/** Inset media frame: soft poster first, then the video settles in when it can play. */
export function dawnStage(extraClass = ""): { stage: HTMLElement; content: HTMLElement } {
  const poster = h("div", { class: "stage-poster", "aria-hidden": "true", style: `background-image:url("${posterUrl}")` });
  const video = h("video", { class: "stage-video", muted: true, loop: true, playsInline: true, autoplay: true, preload: "auto", "aria-hidden": "true" }) as HTMLVideoElement;
  video.muted = true;
  video.setAttribute("playsinline", "");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const saveData = (navigator as any).connection?.saveData;
  if (!saveData) {
    video.src = DAWN_VIDEO;
    video.addEventListener("canplay", () => { video.classList.add("is-ready"); if (reduce) video.pause(); }, { once: true });
    video.play().catch(() => {});
  }
  const content = h("div", { class: "stage-content" });
  const stage = h("section", { class: `stage ${extraClass}` }, poster, video, h("div", { class: "stage-scrim", "aria-hidden": "true" }), content);
  // Pause when hidden to save battery on iPad.
  new IntersectionObserver(([e]) => { if (e.isIntersecting) video.play().catch(() => {}); else video.pause(); }).observe(stage);
  return { stage, content };
}

export function wordmark(href = "#/"): HTMLElement {
  const a = h("a", { href, class: "wordmark", "aria-label": "Quiet Time home" });
  a.innerHTML = `<svg viewBox="0 0 28 20" width="28" height="20" aria-hidden="true"><path d="M2 3.5c3.6-1.4 7.4-1.2 12 1.6 4.6-2.8 8.4-3 12-1.6v14c-3.6-1.4-7.4-1.2-12 1.6-4.6-2.8-8.4-3-12-1.6z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M14 5.1v14" stroke="currentColor" stroke-width="1.4"/></svg><span>Quiet Time</span>`;
  return a;
}
