import { allDocs, newDoc, saveDoc, type DocRec } from "./store";
import { parseRefs, formatRange, overlaps, BOOK_NAMES, splitId, type Ref } from "./books";
import { h } from "./ui";
import { ping } from "./activity";

export const refsText = (refs: Ref[]) => refs.map((r) => formatRange(r.s, r.e)).join("; ");

/** Editor for a note (or sermon when kind = sermons). Autosaves locally, syncs in background. */
export function docEditor(doc: DocRec, opts: { onClose?: () => void; onChange?: (d: DocRec) => void; compact?: boolean } = {}): HTMLElement {
  let t: number | undefined;
  const save = () => { ping("notes"); clearTimeout(t); t = window.setTimeout(() => { saveDoc(doc); opts.onChange?.(doc); }, 500); };
  const title = h("input", { class: "title-input", placeholder: doc.kind === "notes" ? "Title (optional)" : "Sermon title", value: doc.title,
    oninput: () => { doc.title = title.value; save(); } });
  const refIn = h("input", { placeholder: "References, e.g. Gen 1:1-3; John 1:1", value: refsText(doc.refs), spellcheck: false, autocapitalize: "off" });
  const refMsg = h("small", { class: "muted" });
  refIn.addEventListener("input", () => {
    const parsed = refIn.value.trim() ? parseRefs(refIn.value) : [];
    if (parsed) { doc.refs = parsed; refMsg.textContent = ""; save(); }
    else refMsg.textContent = "Can't read that reference yet; keeping the previous one.";
  });
  refIn.addEventListener("blur", () => { refIn.value = refsText(doc.refs); refMsg.textContent = ""; });
  const tagIn = h("input", { placeholder: "Tags, comma separated (faith, covenant)", value: doc.tags.join(", "), autocapitalize: "off",
    oninput: () => { doc.tags = tagIn.value.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean); save(); } });
  const body = h("textarea", { class: "body-input", placeholder: doc.kind === "notes" ? "Reflections, observations, questions, cross-references…" : "Write your sermon…",
    oninput: () => { doc.body = body.value; save(); } });
  body.value = doc.body;
  const del = h("button", { class: "ghost danger", onclick: () => {
    if (!confirm("Delete this " + (doc.kind === "notes" ? "note" : "sermon") + "?")) return;
    doc.deleted = true; saveDoc(doc); opts.onChange?.(doc); opts.onClose?.();
  } }, "Delete");
  const done = opts.onClose ? h("button", { onclick: () => { clearTimeout(t); saveDoc(doc).then(() => { opts.onChange?.(doc); opts.onClose!(); }); } }, "Done") : null;
  const wrap = h("div", { class: "doc-editor" + (opts.compact ? " compact" : "") },
    title, h("label", {}, refIn, refMsg), doc.kind === "notes" ? tagIn : null, body,
    h("div", { class: "row end" }, h("small", { class: "muted grow" }, doc.revision ? "" : "New"), del, done));
  (wrap as any).focusBody = () => body.focus();
  return wrap;
}

export function noteCard(d: DocRec, onOpen: (d: DocRec) => void): HTMLElement {
  const snippet = d.body.slice(0, 180) + (d.body.length > 180 ? "…" : "");
  return h("button", { class: "note-card", onclick: () => onOpen(d) },
    d.title || !snippet ? h("div", { class: "note-title" }, d.title || "Untitled") : null,
    d.refs.length ? h("div", { class: "note-refs" }, refsText(d.refs)) : null,
    snippet ? h("div", { class: "note-snippet" }, snippet) : null,
    d.tags.length ? h("div", { class: "tags" }, ...d.tags.map((t) => h("span", { class: "tag" }, t))) : null);
}

export interface NoteQuery { text?: string; tag?: string; ref?: Ref[] | null; book?: number }
export function searchNotes(notes: DocRec[], q: NoteQuery): DocRec[] {
  const words = (q.text ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  return notes.filter((n) => {
    const hay = (n.title + "\n" + n.body + "\n" + n.tags.join(" ")).toLowerCase();
    if (words.some((w) => !hay.includes(w))) return false;
    if (q.tag && !n.tags.includes(q.tag)) return false;
    if (q.ref && !n.refs.some((r) => q.ref!.some((x) => overlaps(r, x)))) return false;
    if (q.book && !n.refs.some((r) => splitId(r.s).b <= q.book! && splitId(r.e).b >= q.book!)) return false;
    return true;
  }).sort((a, b) => (a.refs[0]?.s ?? 1e9) - (b.refs[0]?.s ?? 1e9) || b.updated_at.localeCompare(a.updated_at));
}

/** Right-hand panel in the workspace. */
export function notesPanel(ctx: { dayRanges: Ref[]; current: () => number | null; onReturn: () => void }) {
  const el = h("div", { class: "notes-panel" });
  let editing: DocRec | null = null;
  let curVerse: number | null = null;
  const head = h("div", { class: "panel-head" });
  const editorSlot = h("div");
  const list = h("div", { class: "note-list" });
  const search = h("input", { type: "search", placeholder: "Search all notes…", class: "search", oninput: () => renderList() });
  el.append(head, editorSlot, search, list);

  async function renderList() {
    const all = await allDocs("notes");
    list.replaceChildren();
    if (search.value.trim()) {
      const res = searchNotes(all, { text: search.value });
      list.append(h("h4", {}, `${res.length} result${res.length === 1 ? "" : "s"}`), ...res.slice(0, 50).map((n) => noteCard(n, open)));
      return;
    }
    const cur = curVerse ? [{ s: curVerse, e: curVerse }] : [];
    const onVerse = cur.length ? searchNotes(all, { ref: cur }) : [];
    const onPassage = searchNotes(all, { ref: ctx.dayRanges }).filter((n) => !onVerse.includes(n));
    if (onVerse.length) list.append(h("h4", {}, "On this verse"), ...onVerse.map((n) => noteCard(n, open)));
    if (onPassage.length) list.append(h("h4", {}, "On today’s passages"), ...onPassage.map((n) => noteCard(n, open)));
    // Related: notes sharing tags with notes on today's passages, elsewhere in the Bible.
    const tags = new Set([...onVerse, ...onPassage].flatMap((n) => n.tags));
    const related = tags.size ? all.filter((n) => !onVerse.includes(n) && !onPassage.includes(n) && n.tags.some((t) => tags.has(t))).slice(0, 12) : [];
    if (related.length) list.append(h("h4", {}, "Related by tag"), ...related.map((n) => noteCard(n, open)));
    if (!onVerse.length && !onPassage.length) list.append(h("p", { class: "muted" }, "No notes on today’s passages yet. Option-N starts one for the current verse."));
  }

  function open(d: DocRec) {
    editing = d;
    const ed = docEditor(d, { compact: true, onClose: () => { editing = null; editorSlot.replaceChildren(); renderList(); ctx.onReturn(); }, onChange: () => renderList() });
    editorSlot.replaceChildren(ed);
    (ed as any).focusBody();
  }

  function renderHead() {
    head.replaceChildren(
      h("span", { class: "muted" }, curVerse ? formatRange(curVerse, curVerse) : ""),
      h("button", { class: "small", title: "New note on the current verse (Option-N)", onclick: () => newNote() }, "+ Note"));
  }

  function newNote() {
    const v = ctx.current();
    open(newDoc("notes", { refs: v ? [{ s: v, e: v }] : [] }));
  }

  window.addEventListener("qt-docs-changed", () => renderList());
  renderHead(); renderList();
  return {
    el,
    setVerse(v: number | null) {
      if (v === curVerse) return;
      curVerse = v; renderHead();
      if (!editing && !search.value) renderList();
    },
    newNote,
    isEditing: () => !!editing,
    focus: () => (editorSlot.querySelector("textarea") as HTMLElement | null)?.focus() ?? search.focus(),
  };
}

export function bookOptions() {
  return BOOK_NAMES.map((n, i) => h("option", { value: String(i + 1) }, n));
}
