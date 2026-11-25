import { sb } from "./supabase";
import { allDocs, countComplete, getProgress, getTx, sourceInfo, todayDay, type Plan } from "./store";
import { verseIdsInRange, BOOK_NAMES, splitId } from "./books";
import { h, syncBadge, themeToggle, fmtDate, addDays } from "./ui";
import { dawnStage, wordmark } from "./hero";
import { noteCard } from "./notes";
import SEGMENTS from "./data/segments.json";

export const TOTAL_VERSES = 31086;
const EMAIL_KEY = "qt-email";

function navLinks() {
  const cur = location.hash.split("?")[0];
  return [["#/notes", "Notes"], ["#/sermons", "Sermons"], ["#/plan", "Plan"], ["#/settings", "Settings"]].map(([href, label]) =>
    h("a", { href, "aria-current": cur === href ? "page" : null }, label));
}

export function shell(root: HTMLElement, title: string, ...content: (Node | null)[]) {
  root.replaceChildren(
    h("header", { class: "topbar" }, wordmark(),
      h("nav", { class: "links" }, ...navLinks()),
      h("div", { class: "row" }, syncBadge(), themeToggle())),
    h("main", { class: "page rise" }, title ? h("h1", { class: "page-title" }, title) : null, ...content));
}

function arrow() {
  const s = h("span", { class: "arrow", "aria-hidden": "true" });
  s.innerHTML = `<svg viewBox="0 0 16 16" width="16" height="16"><path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return s;
}

const dash = (label: string) => label.replace(/(\d)-(\d)/g, "$1–$2");

export async function dashboard(root: HTMLElement, plan: Plan | null) {
  if (!plan) { shell(root, "Quiet Time", h("p", {}, "The reading plan couldn’t be loaded. Check your connection and refresh.")); return; }
  const today = todayDay(plan);
  const day = Math.min(Math.max(today, 1), plan.days.length);
  const passages = plan.days[day - 1];
  const ids = passages.flatMap((p) => verseIdsInRange(p.start_id, p.end_id));
  const tx = await getTx(ids);
  const doneToday = ids.filter((id) => ["complete", "unverified"].includes(tx.get(id)?.status ?? "")).length;
  const prog = await getProgress();
  const pct = (100 * doneToday) / ids.length;

  // Which season of the plan we're in, and why this New Testament book sits here.
  const segs = (plan.meta?.segments ?? SEGMENTS) as any[];
  let acc = 0, seg = segs[0];
  for (const s of segs) { if (day <= acc + s.days) { seg = s; break; } acc += s.days; }
  const name = (b: number) => BOOK_NAMES[b - 1];
  const season = seg ? `${name(seg.ot[0])}${seg.ot.length > 1 ? "–" + name(seg.ot[seg.ot.length - 1]) : ""} with ${seg.nt.map(name).join(" & ")}` : "";
  const why = seg ? String(seg.rationale).split(/(?<=\.)\s/)[0] : "";

  const { stage, content } = dawnStage("stage-dash");
  const ot = passages.filter((p) => splitId(p.start_id).b <= 39), nt = passages.filter((p) => splitId(p.start_id).b > 39);
  const dateLabel = today < 1 ? `Begins ${fmtDate(plan.start_date)}` : fmtDate(addDays(plan.start_date, day - 1));
  content.append(
    h("header", { class: "stage-nav" }, wordmark(), h("nav", { class: "glass pill-nav" }, ...navLinks(), syncBadge(), themeToggle())),
    h("div", { class: "stage-spacer" }),
    h("div", { class: "stage-bottom" },
      h("div", { class: "stage-copy" },
        h("p", { class: "eyebrow rise d1" }, `Day ${day} of ${plan.days.length} · ${dateLabel}`),
        h("h1", { class: "display rise d2" },
          ...ot.map((p) => h("span", { class: "line" }, dash(p.label))),
          ...nt.map((p) => h("span", { class: "line soft" }, dash(p.label)))),
        h("div", { class: "cta-row rise d3" },
          h("a", { class: "btn-light", href: `#/day/${day}` }, doneToday ? "Continue today’s reading" : "Begin today’s reading", arrow()),
          prog.current_day && prog.current_day !== day ? h("a", { class: "btn-glass glass", href: `#/day/${prog.current_day}?v=${prog.verse_id ?? ""}` }, `Resume Day ${prog.current_day}`) : null),
        h("div", { class: "today-progress rise d4" },
          h("div", { class: "hair" }, h("span", { style: `width:${pct}%` })),
          h("span", {}, `${doneToday} of ${ids.length} verses today`))),
      seg ? h("aside", { class: "glass season rise d4" }, h("p", { class: "eyebrow" }, "This season"), h("p", { class: "season-title" }, season),
        h("p", { class: "season-why" }, why), h("a", { href: "#/plan" }, "The whole year", arrow())) : null));

  const overall = h("section", { class: "tile" }, h("p", { class: "eyebrow" }, "The whole Bible"), h("p", { class: "big-num" }, "·"));
  countComplete().then((n) => {
    const v = n ?? 0;
    overall.replaceChildren(h("p", { class: "eyebrow" }, "The whole Bible"),
      h("p", { class: "big-num" }, `${((100 * v) / TOTAL_VERSES).toFixed(v ? 1 : 0)}`, h("small", {}, "%")),
      h("div", { class: "hair dark" }, h("span", { style: `width:${(100 * v) / TOTAL_VERSES}%` })),
      h("p", { class: "muted small" }, n == null ? "Offline right now" : `${v.toLocaleString()} of ${TOTAL_VERSES.toLocaleString()} verses written and checked`));
  });

  const q = h("input", { type: "search", placeholder: "A word, a tag, or “Gen 1”", class: "search", "aria-label": "Search notes" });
  const notesTile = h("form", { class: "tile", onsubmit: (e: Event) => { e.preventDefault(); location.hash = `#/notes?q=${encodeURIComponent(q.value)}`; } },
    h("p", { class: "eyebrow" }, "Your notes"), q);
  const recent = (await allDocs("notes")).sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 3);
  if (recent.length) notesTile.append(h("div", { class: "note-list" }, ...recent.map((n) => noteCard(n, () => (location.hash = `#/notes?id=${n.id}`)))));
  else notesTile.append(h("p", { class: "muted small" }, "Reflections you write beside the text gather here, searchable by word, tag and passage."));

  const src = h("section", { class: "tile" }, h("p", { class: "eyebrow" }, "Source text"), h("p", { class: "tile-title" }, "·"));
  sourceInfo().then((s) => src.replaceChildren(h("p", { class: "eyebrow" }, "Source text"),
    h("p", { class: "tile-title" }, s ? s.translation : "Not imported"),
    h("p", { class: "muted small" }, s ? `${Number(s.verse_count).toLocaleString()} verses, every one checked as you type.` : "Type from your printed Bible for now.")));

  root.replaceChildren(h("div", { class: "dash-wrap" }, stage, h("main", { class: "tiles rise d4" }, overall, notesTile, src)));
}

export function loginPage(root: HTMLElement, onDone: () => void) {
  const { stage, content } = dawnStage("stage-login");
  const remembered = localStorage.getItem(EMAIL_KEY) ?? "";
  const panel = h("div", { class: "glass login-card rise d3" });
  const msg = () => h("p", { class: "form-msg", role: "alert" });
  const field = (label: string, input: HTMLElement) => h("label", { class: "field-l" }, h("span", {}, label), input);
  const busy = (btn: HTMLButtonElement, on: boolean, label: string) => { btn.disabled = on; btn.textContent = on ? "One moment…" : label; };
  const emailInput = (v: string) => h("input", { type: "email", autocomplete: "username", required: true, value: v, inputmode: "email", autocapitalize: "off", spellcheck: false }) as HTMLInputElement;

  function signIn() {
    const email = emailInput(remembered);
    const pw = h("input", { type: "password", autocomplete: "current-password", required: true }) as HTMLInputElement;
    const show = h("button", { type: "button", class: "peek", onclick: () => { pw.type = pw.type === "password" ? "text" : "password"; show.textContent = pw.type === "password" ? "Show" : "Hide"; pw.focus(); } }, "Show");
    const m = msg();
    const btn = h("button", { type: "submit", class: "btn-light wide" }, "Enter") as HTMLButtonElement;
    panel.replaceChildren(h("form", { onsubmit: async (e: Event) => {
      e.preventDefault(); m.textContent = ""; busy(btn, true, "Enter");
      const { error } = await sb.auth.signInWithPassword({ email: email.value.trim(), password: pw.value });
      busy(btn, false, "Enter");
      if (error) {
        m.textContent = /invalid/i.test(error.message) ? "That password doesn’t match. Try again, or reset it with your recovery code." : error.message;
        pw.select(); return;
      }
      localStorage.setItem(EMAIL_KEY, email.value.trim());
      onDone();
    } },
      h("p", { class: "card-title" }, remembered ? "Welcome back" : "Sign in"),
      field("Email", email),
      field("Password", h("div", { class: "pw-wrap" }, pw, show)),
      btn, m,
      h("button", { type: "button", class: "link-btn", onclick: () => recover(email.value) }, "Forgot your password?")));
    setTimeout(() => (remembered ? pw : email).focus({ preventScroll: true }), 50);
  }

  function recover(prefill: string) {
    const email = emailInput(prefill || remembered);
    const code = h("input", { required: true, autocomplete: "one-time-code", autocapitalize: "characters", spellcheck: false, placeholder: "XXXX-XXXX-XXXX-XXXX-XXXX" }) as HTMLInputElement;
    const pw = h("input", { type: "password", autocomplete: "new-password", required: true, minLength: 8 }) as HTMLInputElement;
    const m = msg();
    const label = "Set password & enter";
    const btn = h("button", { type: "submit", class: "btn-light wide" }, label) as HTMLButtonElement;
    panel.replaceChildren(h("form", { onsubmit: async (e: Event) => {
      e.preventDefault(); m.textContent = ""; busy(btn, true, label);
      const { data, error } = await sb.functions.invoke("recover-password", { body: { email: email.value.trim(), code: code.value, password: pw.value } });
      if (error || !data?.ok) {
        let text = "Couldn’t reset the password. Check your connection.";
        try { text = (await (error as any)?.context?.json())?.error ?? text; } catch { /* keep default */ }
        busy(btn, false, label); m.textContent = text; return;
      }
      const r = await sb.auth.signInWithPassword({ email: email.value.trim(), password: pw.value });
      busy(btn, false, label);
      if (r.error) { m.textContent = r.error.message; return; }
      localStorage.setItem(EMAIL_KEY, email.value.trim());
      onDone();
    } },
      h("p", { class: "card-title" }, "Reset your password"),
      h("p", { class: "card-sub" }, "No email, no waiting. Use the recovery code from Settings."),
      field("Email", email), field("Recovery code", code), field("New password · 8+ characters", pw),
      btn, m,
      h("button", { type: "button", class: "link-btn", onclick: signIn }, "Back to sign in")));
    setTimeout(() => code.focus({ preventScroll: true }), 50);
  }

  content.append(
    h("header", { class: "stage-nav" }, wordmark("#/")),
    h("div", { class: "stage-spacer" }),
    h("div", { class: "stage-bottom login-bottom" },
      h("div", { class: "stage-copy" },
        h("p", { class: "eyebrow rise d1" }, "Deuteronomy 17:19"),
        h("h1", { class: "display rise d2" }, h("span", { class: "line" }, "Write it down."), h("span", { class: "line soft" }, "Read it all your days.")),
        h("p", { class: "lede rise d3" }, "Every verse of the NIV, typed slowly by your own hand, one quiet morning at a time.")),
      panel));
  root.replaceChildren(stage);
  signIn();
}

export function securityCard() {
  const out = h("p", { class: "small", role: "status" });
  const pw = h("input", { type: "password", autocomplete: "new-password", placeholder: "New password (8+ characters)", minLength: 8 }) as HTMLInputElement;
  return h("section", { class: "card" }, h("h3", {}, "Password & recovery"),
    h("p", { class: "small" }, "A recovery code resets your password from the sign-in screen without any email. Making a new code replaces the old one, so keep the newest in your password manager."),
    h("div", { class: "row" }, h("button", { onclick: async () => {
      if (!confirm("Create a new recovery code? The previous one stops working.")) return;
      const { data, error } = await sb.rpc("new_recovery_code");
      out.replaceChildren(error ? document.createTextNode(error.message) : h("span", {}, "New recovery code: ", h("code", { class: "code" }, String(data)), " Save it now; it won’t be shown again."));
    } }, "New recovery code")),
    h("form", { class: "row", onsubmit: async (e: Event) => {
      e.preventDefault();
      const { error } = await sb.auth.updateUser({ password: pw.value });
      out.textContent = error ? error.message : "Password changed.";
      pw.value = "";
    } }, pw, h("button", { type: "submit" }, "Change password")),
    out);
}
