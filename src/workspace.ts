import { compare } from "./compare";
import { verseIdsInRange, splitId, BOOK_NAMES, formatId, type Ref } from "./books";
import { getTx, saveTx, pullTx, getVerses, setProgress, resolveConflict, type Plan, type TxRec, type Verse } from "./store";
import { h, esc, syncBadge, themeToggle, fmtDate, addDays } from "./ui";
import { notesPanel } from "./notes";

interface VerseCtl {
  id: number;
  source?: Verse;
  rec: TxRec;
  ta: HTMLTextAreaElement;
  backdrop: HTMLElement;
  hint: HTMLElement;
  row: HTMLElement;
  refEl?: HTMLElement;
  composing: boolean;
  firstError: number;
}

const PREF_KEY = "qt-panels";
type Layout = { cols: [number, number, number]; hidden: [boolean, boolean, boolean] };
function loadLayout(): Layout {
  try { return JSON.parse(localStorage.getItem(PREF_KEY)!) ?? { cols: [30, 40, 30], hidden: [false, false, false] }; }
  catch { return { cols: [30, 40, 30], hidden: [false, false, false] }; }
}

export async function renderWorkspace(root: HTMLElement, plan: Plan, day: number, focusVerse?: number) {
  const passages = plan.days[day - 1];
  if (!passages) { root.replaceChildren(h("p", {}, "No such day.")); return; }
  const date = addDays(plan.start_date, day - 1);
  const ranges: Ref[] = passages.map((p) => ({ s: p.start_id, e: p.end_id }));
  const layout = loadLayout();
  const saveLayout = () => localStorage.setItem(PREF_KEY, JSON.stringify(layout));

  // ---------- shell ----------
  const refPanel = h("section", { class: "panel ref-panel", "aria-label": "Scripture" });
  const txPanel = h("section", { class: "panel tx-panel", "aria-label": "Transcription" });
  const notes = notesPanel({ dayRanges: ranges, current: () => active?.id ?? null, onReturn: () => active?.ta.focus() });
  const notesSec = h("section", { class: "panel notes-sec", "aria-label": "Notes" }, notes.el);
  const panels = [refPanel, txPanel, notesSec];
  const grid = h("div", { class: "workspace" });
  const tabs = h("div", { class: "tabs", role: "tablist" });
  const tabNames = ["Scripture", "Transcribe", "Notes"];
  let mobileTab = 1;
  let sideTab: 0 | 2 = 0; // medium layout: which side panel shows next to transcription

  const progressEl = h("span", { class: "day-progress" });
  const header = h("header", { class: "topbar" },
    h("a", { href: "#/", class: "ghost", title: "Home" }, "← Home"),
    h("div", { class: "day-title" },
      h("strong", {}, `Day ${day}`), h("span", { class: "muted" }, ` · ${fmtDate(date)}`),
      h("div", { class: "muted small" }, passages.map((p) => p.label).join(" · "))),
    progressEl,
    h("nav", { class: "row" },
      day > 1 ? h("a", { href: `#/day/${day - 1}`, class: "ghost", title: "Previous day" }, "‹") : null,
      day < plan.days.length ? h("a", { href: `#/day/${day + 1}`, class: "ghost", title: "Next day" }, "›") : null),
    h("div", { class: "row" },
      ...[0, 1, 2].map((i) => h("button", { class: "ghost small toggle", "aria-pressed": String(!layout.hidden[i]), title: `Show/hide ${tabNames[i]} panel`,
        onclick: (e: Event) => { layout.hidden[i] = !layout.hidden[i]; if (layout.hidden.every(Boolean)) layout.hidden[1] = false; (e.currentTarget as HTMLElement).setAttribute("aria-pressed", String(!layout.hidden[i])); saveLayout(); applyLayout(); } }, tabNames[i])),
      syncBadge(), themeToggle()));

  let layoutKey = "";
  function applyLayout() {
    const w = window.innerWidth;
    const mode = w >= 1100 ? "wide" : w >= 700 ? "medium" : "narrow";
    grid.dataset.mode = mode;
    let visible: number[];
    if (mode === "wide") visible = [0, 1, 2].filter((i) => !layout.hidden[i]);
    else if (mode === "medium") visible = [sideTab, 1].sort();
    else visible = [mobileTab];
    const key = mode + visible.join();
    if (key === layoutKey) return;
    layoutKey = key;
    const hadFocus = document.activeElement as HTMLElement | null;
    panels.forEach((p, i) => (p.hidden = !visible.includes(i)));
    const resizers = grid.querySelectorAll<HTMLElement>(".resizer");
    resizers.forEach((r) => r.remove());
    grid.replaceChildren();
    const cols: string[] = [];
    visible.forEach((i, k) => {
      if (k > 0) {
        const r = h("div", { class: "resizer", role: "separator", "aria-orientation": "vertical", tabindex: "0" });
        attachResizer(r, visible[k - 1], i);
        grid.append(r); cols.push("6px");
      }
      grid.append(panels[i]);
      cols.push(mode === "narrow" ? "1fr" : `minmax(0, ${layout.cols[i]}fr)`);
    });
    grid.style.gridTemplateColumns = cols.join(" ");
    tabs.hidden = mode === "wide";
    tabs.replaceChildren(...(mode === "narrow" ? [0, 1, 2] : [0, 2]).map((i) =>
      h("button", { role: "tab", "aria-selected": String(visible.includes(i)), onclick: () => {
        if (mode === "narrow") mobileTab = i; else sideTab = i as 0 | 2;
        applyLayout();
      } }, tabNames[i])));
    if (hadFocus && grid.contains(hadFocus)) hadFocus.focus({ preventScroll: true });
  }
  function attachResizer(r: HTMLElement, a: number, b: number) {
    r.addEventListener("pointerdown", (e) => {
      r.setPointerCapture(e.pointerId);
      const startX = e.clientX, total = layout.cols[a] + layout.cols[b];
      const pxPerFr = grid.clientWidth / [0, 1, 2].filter((i) => !panels[i].hidden).reduce((s, i) => s + layout.cols[i], 0);
      const a0 = layout.cols[a];
      const move = (ev: PointerEvent) => {
        const na = Math.min(total - 12, Math.max(12, a0 + (ev.clientX - startX) / pxPerFr));
        layout.cols[a] = na; layout.cols[b] = total - na;
        applyColsOnly();
      };
      const up = () => { r.removeEventListener("pointermove", move); r.removeEventListener("pointerup", up); saveLayout(); };
      r.addEventListener("pointermove", move); r.addEventListener("pointerup", up);
    });
  }
  function applyColsOnly() {
    const cols: string[] = [];
    [...grid.children].forEach((c) => {
      if (c.classList.contains("resizer")) cols.push("6px");
      else cols.push(`minmax(0, ${layout.cols[panels.indexOf(c as HTMLElement)]}fr)`);
    });
    grid.style.gridTemplateColumns = cols.join(" ");
  }

  root.replaceChildren(header, tabs, grid);
  applyLayout();
  const onResize = () => applyLayout();
  window.addEventListener("resize", onResize);

  // ---------- data ----------
  txPanel.append(h("p", { class: "muted pad" }, "Loading…"));
  const ctls: VerseCtl[] = [];
  let anySource = false;
  const passageData: { ids: number[]; verses: Map<number, Verse>; tx: Map<number, TxRec> }[] = [];
  for (const p of passages) {
    const ids = verseIdsInRange(p.start_id, p.end_id);
    const [verses, tx] = await Promise.all([getVerses(p.start_id, p.end_id, ids.length), getTx(ids)]);
    if (verses.size) anySource = true;
    passageData.push({ ids, verses, tx });
  }

  // ---------- render ----------
  txPanel.replaceChildren();
  refPanel.replaceChildren();
  const returnBtn = h("button", { class: "return-btn small", hidden: true, onclick: () => { lastManual = 0; returnBtn.hidden = true; scrollRefToActive(true); } }, "↓ Return to current verse");
  const refScroll = h("div", { class: "ref-scroll" });
  refPanel.append(refScroll, returnBtn);
  if (!anySource) {
    refScroll.append(h("div", { class: "notice" },
      h("strong", {}, "NIV 1984 text not imported yet."),
      h("p", {}, "Type from your printed Bible. Every verse is saved, and will be checked automatically once the NIV 1984 text is imported.")));
  }

  passages.forEach((p, pi) => {
    const { ids, verses, tx } = passageData[pi];
    txPanel.append(h("h2", { class: "passage-title" }, p.label));
    const refSection = h("div", { class: "ref-passage" }, h("h2", { class: "passage-title" }, p.label));
    refScroll.append(refSection);
    let lastChap = -1;
    let refPara: HTMLElement | null = null;
    for (const id of ids) {
      const { b, c, v } = splitId(id);
      if (c !== lastChap) {
        const heading = `${BOOK_NAMES[b - 1]} ${c}`;
        txPanel.append(h("h3", { class: "chapter" }, heading));
        refPara = h("p", { class: "ref-chapter" });
        refSection.append(h("h3", { class: "chapter" }, heading), refPara);
        lastChap = c;
      }
      const source = verses.get(id);
      const rec: TxRec = tx.get(id) ?? { verse_id: id, typed: "", status: "draft", revision: 0 };
      const ta = h("textarea", {
        rows: 1, autocapitalize: "off", autocomplete: "off", spellcheck: false, "data-gramm": "false", "aria-label": `${formatId(id)} transcription`,
        placeholder: source ? "" : `${c}:${v}`,
      }) as HTMLTextAreaElement;
      ta.setAttribute("autocorrect", "off");
      ta.setAttribute("enterkeyhint", "next");
      ta.value = rec.typed;
      const backdrop = h("div", { class: "backdrop", "aria-hidden": "true" });
      const hint = h("div", { class: "hint" });
      const row = h("div", { class: "verse", "data-id": String(id) },
        h("button", { class: "vnum", tabindex: "-1", title: formatId(id), onclick: () => ta.focus() }, String(v)),
        h("div", { class: "field" }, backdrop, ta), hint);
      txPanel.append(row);
      let refEl: HTMLElement | undefined;
      if (source && refPara) {
        refEl = h("span", { class: "ref-v", "data-id": String(id) }, h("sup", {}, String(v)), " ", source.text, " ");
        refEl.addEventListener("click", () => { ta.focus(); });
        refPara.append(refEl);
      }
      const ctl: VerseCtl = { id, source, rec, ta, backdrop, hint, row, refEl, composing: false, firstError: -1 };
      ctls.push(ctl);
      wire(ctl);
    }
  });
  txPanel.append(h("div", { class: "end-of-day" }, h("p", { class: "muted" }, "End of today’s passages."),
    day < plan.days.length ? h("a", { href: `#/day/${day + 1}`, class: "ghost" }, `Day ${day + 1} ›`) : null));

  // Re-measure verse fields whenever the column width changes (resizing, rotation, layout switch).
  let lastW = 0;
  new ResizeObserver(() => {
    if (txPanel.clientWidth === lastW) return;
    lastW = txPanel.clientWidth;
    for (const c of ctls) autosize(c.ta);
  }).observe(txPanel);

  // Validate everything once (also revalidates old work against newly imported text).
  for (const c of ctls) { evaluate(c, false); autosize(c.ta); }
  updateProgress();

  // ---------- behaviour ----------
  let active: VerseCtl | null = null;
  let lastManual = 0;

  function evaluate(c: VerseCtl, persist: boolean): boolean {
    const typed = c.ta.value;
    let status: TxRec["status"];
    if (!c.source) {
      status = typed.trim() ? "unverified" : "draft";
      c.backdrop.innerHTML = esc(typed) + "​";
      c.hint.textContent = "";
      c.firstError = -1;
    } else {
      const r = compare(typed, c.source.text);
      status = r.complete ? "complete" : "draft";
      c.firstError = r.firstError;
      c.backdrop.innerHTML = paint(typed, r.errors, r.missing) + "​";
      c.hint.textContent = r.hint;
      c.row.classList.toggle("has-error", r.firstError >= 0);
    }
    const wasComplete = c.rec.status === "complete";
    c.row.dataset.status = status;
    c.refEl?.classList.toggle("done", status === "complete");
    if (c.rec.conflict) showConflict(c);
    const changed = typed !== c.rec.typed || status !== c.rec.status;
    if (changed) {
      c.rec.typed = typed; c.rec.status = status;
      if (persist || c.rec.revision > 0 || typed) saveTx({ ...c.rec, conflict: c.rec.conflict });
    }
    return !wasComplete && status === "complete";
  }

  function wire(c: VerseCtl) {
    const { ta } = c;
    ta.addEventListener("beforeinput", (e) => {
      // Never let the browser insert or replace Scripture for the user.
      if (["insertFromPaste", "insertFromDrop", "insertReplacementText", "insertFromYank", "insertTranspose"].includes(e.inputType)) e.preventDefault();
    });
    ta.addEventListener("paste", (e) => e.preventDefault());
    ta.addEventListener("drop", (e) => e.preventDefault());
    ta.addEventListener("compositionstart", () => (c.composing = true));
    ta.addEventListener("compositionend", () => { c.composing = false; onInput(c); });
    ta.addEventListener("input", () => { if (!c.composing) onInput(c); else autosize(ta); });
    ta.addEventListener("focus", () => setActive(c));
    ta.addEventListener("keydown", (e) => onKey(c, e));
  }

  function onInput(c: VerseCtl) {
    autosize(c.ta);
    const justCompleted = evaluate(c, true);
    updateProgress();
    if (justCompleted && c.ta.selectionStart === c.ta.value.length) {
      const next = ctls[ctls.indexOf(c) + 1];
      if (next) { next.ta.focus(); next.ta.setSelectionRange(next.ta.value.length, next.ta.value.length); }
      else celebrate();
    }
    setProgress({ plan_id: plan.id, current_day: day, verse_id: c.id, caret: c.ta.selectionStart });
  }

  function onKey(c: VerseCtl, e: KeyboardEvent) {
    const i = ctls.indexOf(c);
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      const next = ctls[i + 1];
      if (next) { next.ta.focus(); next.ta.setSelectionRange(next.ta.value.length, next.ta.value.length); }
    } else if (e.key === "Backspace" && c.ta.selectionStart === 0 && c.ta.selectionEnd === 0 && i > 0) {
      e.preventDefault();
      const prev = ctls[i - 1];
      prev.ta.focus(); prev.ta.setSelectionRange(prev.ta.value.length, prev.ta.value.length);
    } else if (e.key === "ArrowUp" && c.ta.selectionStart === 0 && i > 0) {
      e.preventDefault(); ctls[i - 1].ta.focus();
    } else if (e.key === "ArrowDown" && c.ta.selectionEnd === c.ta.value.length && ctls[i + 1]) {
      e.preventDefault(); ctls[i + 1].ta.focus(); ctls[i + 1].ta.setSelectionRange(0, 0);
    }
  }

  function setActive(c: VerseCtl) {
    if (active === c) return;
    active?.row.classList.remove("active");
    active?.refEl?.classList.remove("active");
    active = c;
    c.row.classList.add("active");
    c.refEl?.classList.add("active");
    notes.setVerse(c.id);
    scrollRefToActive(false);
    setProgress({ plan_id: plan.id, current_day: day, verse_id: c.id, caret: c.ta.selectionStart });
  }

  // Auto-scroll the reference text as the caret progresses, but never fight manual browsing.
  ["wheel", "touchmove", "keydown"].forEach((ev) => refScroll.addEventListener(ev, () => {
    lastManual = Date.now();
    returnBtn.hidden = !active?.refEl;
  }, { passive: true }));
  function scrollRefToActive(force: boolean) {
    const el = active?.refEl;
    if (!el || refPanel.hidden) return;
    if (!force && Date.now() - lastManual < 15000) { returnBtn.hidden = false; return; }
    const box = refScroll.getBoundingClientRect(), r = el.getBoundingClientRect();
    if (force || r.top < box.top + box.height * 0.2 || r.bottom > box.top + box.height * 0.7) {
      refScroll.scrollTo({ top: refScroll.scrollTop + r.top - box.top - box.height * 0.3, behavior: "smooth" });
    }
    returnBtn.hidden = true;
  }

  function updateProgress() {
    const done = ctls.filter((c) => c.row.dataset.status === "complete").length;
    const typed = ctls.filter((c) => c.row.dataset.status === "unverified").length;
    progressEl.textContent = anySource ? `${done} / ${ctls.length} verses` : `${typed} / ${ctls.length} typed`;
    progressEl.title = "Today’s progress";
  }

  function celebrate() {
    const m = h("div", { class: "toast" }, "Today’s passages are complete. Take a moment to reflect.");
    document.body.append(m); setTimeout(() => m.remove(), 6000);
  }

  function showConflict(c: VerseCtl) {
    const cf = c.rec.conflict!;
    c.hint.replaceChildren(h("div", { class: "conflict" },
      h("strong", {}, "This verse was edited on another device. "),
      h("div", { class: "muted" }, "Cloud version: ", h("q", {}, cf.typed)),
      h("button", { class: "small", onclick: async () => { await resolveConflict(c.id, "mine"); c.rec.revision = cf.revision; delete c.rec.conflict; evaluate(c, false); } }, "Keep this device’s"),
      h("button", { class: "small", onclick: async () => { await resolveConflict(c.id, "cloud"); c.rec = { verse_id: c.id, typed: cf.typed, status: cf.status, revision: cf.revision }; c.ta.value = cf.typed; evaluate(c, false); autosize(c.ta); } }, "Use cloud version")));
  }

  const keyHandler = (e: KeyboardEvent) => {
    if (!root.isConnected) return;
    if (e.altKey && e.code === "KeyN") { e.preventDefault(); if (grid.dataset.mode !== "wide") { sideTab = 2; mobileTab = 2; applyLayout(); } notes.newNote(); }
    else if (e.altKey && e.code === "KeyE") {
      e.preventDefault();
      const c = ctls.find((x) => x.firstError >= 0);
      if (c) { c.ta.focus(); c.ta.setSelectionRange(c.firstError, c.firstError); c.row.scrollIntoView({ block: "center", behavior: "smooth" }); }
    } else if (e.altKey && e.code === "KeyT") { e.preventDefault(); if (grid.dataset.mode === "narrow") { mobileTab = 1; applyLayout(); } active?.ta.focus(); }
    else if (e.key === "Escape" && notesSec.contains(document.activeElement)) { active?.ta.focus(); }
  };
  document.addEventListener("keydown", keyHandler);
  window.addEventListener("qt-conflict", ((e: CustomEvent) => {
    const c = ctls.find((x) => x.id === e.detail);
    if (c) { getTx([c.id]).then((m) => { const r = m.get(c.id); if (r) { c.rec = r; evaluate(c, false); } }); }
  }) as EventListener);
  const cleanup = new MutationObserver(() => {
    if (!root.contains(grid)) { window.removeEventListener("resize", onResize); document.removeEventListener("keydown", keyHandler); cleanup.disconnect(); }
  });
  cleanup.observe(root, { childList: true });

  // Restore position: requested verse, else saved progress, else first unfinished verse.
  const target = ctls.find((c) => c.id === focusVerse) ?? ctls.find((c) => c.row.dataset.status !== "complete" && c.row.dataset.status !== "unverified") ?? ctls[0];
  if (target) {
    target.ta.focus({ preventScroll: true });
    target.ta.setSelectionRange(target.ta.value.length, target.ta.value.length);
    target.row.scrollIntoView({ block: "center" });
    lastManual = 0; scrollRefToActive(true);
  }

  // Background: pull cloud state for today's ranges and merge (other devices).
  if (navigator.onLine) {
    for (const r of ranges) {
      pullTx(r.s, r.e).then(async (changedIds) => {
        if (!changedIds.length) return;
        const fresh = await getTx(changedIds.sort((a, b) => a - b));
        for (const id of changedIds) {
          const c = ctls.find((x) => x.id === id);
          const rec = fresh.get(id);
          if (!c || !rec) continue;
          c.rec = rec;
          if (document.activeElement !== c.ta || rec.conflict) { if (!rec.conflict) c.ta.value = rec.typed; evaluate(c, false); autosize(c.ta); }
        }
        updateProgress();
      }).catch(() => {});
    }
  }
}

function autosize(ta: HTMLTextAreaElement) {
  ta.style.height = "auto";
  ta.style.height = ta.scrollHeight + "px";
}

function paint(text: string, errors: [number, number][], missing: number[]): string {
  const marks: { at: number; html: string }[] = [];
  for (const [s, e] of errors) { marks.push({ at: s, html: "<mark class=\"err\">" }); marks.push({ at: e, html: "</mark>" }); }
  for (const m of missing) marks.push({ at: m, html: "<span class=\"miss\"></span>" });
  marks.sort((a, b) => a.at - b.at || (a.html.startsWith("</") ? -1 : 1));
  let out = "", pos = 0;
  for (const m of marks) { out += esc(text.slice(pos, m.at)) + m.html; pos = m.at; }
  return out + esc(text.slice(pos));
}
