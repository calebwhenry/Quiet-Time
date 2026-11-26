import { onSync } from "./store";

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, any> = {}, ...kids: (Node | string | null | undefined | false)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k in el && typeof v !== "string") (el as any)[k] = v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const kid of kids) if (kid != null && kid !== false) el.append(kid);
  return el;
}

const LABELS: Record<string, string> = {
  synced: "Synced", saving: "Saving…", pending: "Saved on this device", offline: "Offline · saved on this device", error: "Sync problem",
};

export function syncBadge(): HTMLElement {
  const el = h("span", { class: "sync", role: "status", "aria-live": "polite" });
  const off = onSync(({ state, pending, message }) => {
    el.dataset.state = state;
    el.textContent = LABELS[state] + (pending && state !== "synced" ? ` (${pending})` : "");
    el.title = message || (state === "synced" ? "Everything is saved to the cloud" : "");
  });
  const obs = new MutationObserver(() => { if (!el.isConnected) { off(); obs.disconnect(); } });
  queueMicrotask(() => obs.observe(document.body, { childList: true, subtree: true }));
  return el;
}

export function themeToggle(): HTMLElement {
  const b = h("button", { class: "icon-btn", title: "Light / dark", "aria-label": "Toggle light or dark theme" });
  b.innerHTML = `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M15.5 12.6A6.5 6.5 0 0 1 7.4 4.5a6.5 6.5 0 1 0 8.1 8.1z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
  b.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("qt-theme", next);
  });
  return b;
}

export function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: "long", month: "long", day: "numeric" }) {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, opts);
}
export function addDays(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// On a Mac, Option-N / Option-E are dead keys (˜ ´): Safari can still type the accent into
// whatever field gains focus right after a shortcut. Arm a short guard and undo that stray mark.
let deadUntil = 0;
export const armDeadKeyGuard = () => { deadUntil = Date.now() + 1200; };
const DEAD = /^[\u02DC\u00B4\u00A8\u02C6`~\u02CB]$/;
export function stripDeadKey(el: HTMLTextAreaElement | HTMLInputElement, e: Event): boolean {
  const data = (e as InputEvent).data;
  if (Date.now() > deadUntil || !data || !DEAD.test(data)) return false;
  const pos = el.selectionStart ?? el.value.length;
  if (el.value[pos - 1] !== data) return false;
  el.value = el.value.slice(0, pos - 1) + el.value.slice(pos);
  el.setSelectionRange(pos - 1, pos - 1);
  deadUntil = 0;
  return true;
}
