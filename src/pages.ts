import { sb } from "./supabase";
import { allDocs, newDoc, getTx, todayDay, flush, saveTx, saveDoc, type Plan, type DocRec, type TxRec } from "./store";
import * as idb from "./idb";
import { verseIdsInRange, parseRefs, BOOK_NAMES, splitId, formatRange } from "./books";
import { h, fmtDate, addDays } from "./ui";
import { shell, securityCard } from "./home";
import SEGMENTS from "./data/segments.json";
import { docEditor, noteCard, searchNotes, bookOptions, refsText } from "./notes";



export async function notesPage(root: HTMLElement, params: URLSearchParams) {
  const text = h("input", { type: "search", placeholder: "Words…", value: params.get("q") ?? "" });
  const ref = h("input", { placeholder: "Reference (e.g. Gen 1, John 1:1-5)", value: params.get("ref") ?? "" });
  const book = h("select", {}, h("option", { value: "" }, "Any book"), ...bookOptions());
  const tagSel = h("select", {}, h("option", { value: "" }, "Any tag"));
  const results = h("div", { class: "note-list" });
  const editorSlot = h("div", { class: "editor-slot" });
  const all = await allDocs("notes");
  const tags = [...new Set(all.flatMap((n) => n.tags))].sort();
  tagSel.append(...tags.map((t) => h("option", { value: t }, t)));
  if (params.get("tag")) tagSel.value = params.get("tag")!;

  const run = async () => {
    const notes = await allDocs("notes");
    const refs = ref.value.trim() ? parseRefs(ref.value) : null;
    const res = searchNotes(notes, { text: text.value, tag: tagSel.value || undefined, ref: refs, book: book.value ? +book.value : undefined });
    results.replaceChildren(h("div", { class: "muted small" }, `${res.length} note${res.length === 1 ? "" : "s"}`), ...res.map((n) => noteCard(n, open)));
  };
  const open = (d: DocRec) => editorSlot.replaceChildren(docEditor(d, { onChange: run, onClose: () => { editorSlot.replaceChildren(); run(); } }));
  [text, ref, book, tagSel].forEach((el) => el.addEventListener("input", run));
  shell(root, "Notes",
    h("div", { class: "filters" }, text, ref, book, tagSel,
      h("button", { class: "primary", onclick: () => open(newDoc("notes", { refs: parseRefs(ref.value) ?? [] })) }, "+ New note")),
    h("div", { class: "split" }, results, editorSlot));
  const id = params.get("id");
  if (id) { const d = all.find((n) => n.id === id); if (d) open(d); }
  run();
}

export async function sermonsPage(root: HTMLElement) {
  const list = h("div", { class: "note-list" });
  const editorSlot = h("div", { class: "editor-slot" });
  const render = async () => {
    const s = (await allDocs("sermons")).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    list.replaceChildren(...s.map((d) => noteCard(d, open)));
    if (!s.length) list.append(h("p", { class: "muted" }, "No sermon drafts yet."));
  };
  const open = async (d: DocRec) => {
    const notes = await allDocs("notes");
    const linked = h("div", { class: "linked" });
    const renderLinked = () => linked.replaceChildren(h("h4", {}, "Linked notes"),
      ...d.note_ids.map((id) => notes.find((n) => n.id === id)).filter(Boolean).map((n) =>
        h("div", { class: "linked-note" }, noteCard(n!, () => (location.hash = `#/notes?id=${n!.id}`)),
          h("button", { class: "ghost small", onclick: () => { d.note_ids = d.note_ids.filter((x) => x !== n!.id); saveDoc(d); renderLinked(); } }, "Unlink"))));
    const finder = h("input", { type: "search", placeholder: "Find a note to link…" });
    const found = h("div", { class: "note-list" });
    finder.addEventListener("input", () => {
      const res = finder.value.trim() ? searchNotes(notes, { text: finder.value }).slice(0, 8) : [];
      found.replaceChildren(...res.map((n) => noteCard(n, () => {
        if (!d.note_ids.includes(n.id)) d.note_ids.push(n.id);
        saveDoc(d); finder.value = ""; found.replaceChildren(); renderLinked();
      })));
    });
    renderLinked();
    editorSlot.replaceChildren(docEditor(d, { onChange: render, onClose: () => { editorSlot.replaceChildren(); render(); } }), linked, finder, found);
  };
  shell(root, "Sermons", h("button", { class: "primary", onclick: () => open(newDoc("sermons")) }, "+ New sermon"), h("div", { class: "split" }, list, editorSlot));
  render();
}

export function planPage(root: HTMLElement, plan: Plan | null) {
  if (!plan) { shell(root, "Plan", h("p", {}, "Plan not loaded.")); return; }
  const today = todayDay(plan);
  const segs: any[] = plan.meta?.segments ?? (SEGMENTS as any[]);
  const blocks: HTMLElement[] = [];
  let d = 1;
  for (const s of segs) {
    const ot = s.ot.map((b: number) => BOOK_NAMES[b - 1]), nt = s.nt.map((b: number) => BOOK_NAMES[b - 1]);
    const days = [];
    for (let k = d; k < d + s.days; k++) {
      days.push(h("li", { class: k === today ? "today" : "" }, h("a", { href: `#/day/${k}` },
        h("span", { class: "muted" }, `Day ${k} · ${fmtDate(addDays(plan.start_date, k - 1), { month: "short", day: "numeric" })}`), " ",
        plan.days[k - 1].map((p) => p.label).join("; "))));
    }
    blocks.push(h("details", { class: "card seg", open: today >= d && today < d + s.days },
      h("summary", {}, h("strong", {}, `${ot[0]}${ot.length > 1 ? "–" + ot[ot.length - 1] : ""}`), " with ", nt.join(", "),
        h("span", { class: "muted small" }, ` · Days ${d}–${d + s.days - 1}`)),
      h("p", { class: "small" }, s.rationale), h("ol", { class: "days" }, ...days)));
    d += s.days;
  }
  shell(root, plan.title, h("p", { class: "muted" }, `${fmtDate(plan.start_date)} to ${fmtDate(plan.end_date)}`), ...blocks);
}

// ---------- Backup ----------
async function fetchAll(table: string, cols: string, order: string) {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(cols).order(order).range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

function download(name: string, text: string, type: string) {
  const a = h("a", { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a); a.click(); a.remove();
}

export function settingsPage(root: HTMLElement) {
  const status = h("p", { class: "muted", role: "status" });
  const stamp = () => new Date().toISOString().slice(0, 10);

  async function gather() {
    await flush();
    const tx = await fetchAll("transcriptions", "verse_id,typed,status,revision,updated_at,completed_at", "verse_id");
    const localTx = await idb.getAll<TxRec>("tx");
    const map = new Map(tx.map((r) => [r.verse_id, r]));
    for (const l of localTx) { const r = map.get(l.verse_id); if (!r || (l.typed !== r.typed && l.revision >= (r.revision ?? 0))) map.set(l.verse_id, { ...r, ...l, local_only: true }); }
    const notes = await fetchAll("notes", "id,title,body,refs,tags,revision,created_at,updated_at,deleted_at", "created_at");
    const sermons = await fetchAll("sermons", "id,title,body,refs,note_ids,revision,created_at,updated_at,deleted_at", "created_at");
    const { data: progress } = await sb.from("user_progress").select("*").maybeSingle();
    return { app: "quiet-time", format: 1, exported_at: new Date().toISOString(),
      transcriptions: [...map.values()].sort((a, b) => a.verse_id - b.verse_id), notes, sermons, progress };
  }

  const exportJson = async () => {
    status.textContent = "Preparing…";
    try { const d = await gather(); download(`quiet-time-backup-${stamp()}.json`, JSON.stringify(d, null, 1), "application/json");
      status.textContent = `Exported ${d.transcriptions.length} verses, ${d.notes.length} notes, ${d.sermons.length} sermons.`; }
    catch (e: any) { status.textContent = "Export failed: " + e.message; }
  };
  const exportMd = async () => {
    status.textContent = "Preparing…";
    try {
      const d = await gather();
      const lines: string[] = ["# My transcription", ""];
      let lastB = 0, lastC = 0;
      for (const t of d.transcriptions) {
        if (!t.typed) continue;
        const { b, c, v } = splitId(t.verse_id);
        if (b !== lastB) { lines.push("", `## ${BOOK_NAMES[b - 1]}`); lastB = b; lastC = 0; }
        if (c !== lastC) { lines.push("", `### ${BOOK_NAMES[b - 1]} ${c}`, ""); lastC = c; }
        lines.push(`${v} ${t.typed.replace(/\s*\n\s*/g, " / ")}`);
      }
      lines.push("", "# Notes", "");
      for (const n of d.notes.filter((n: any) => !n.deleted_at)) {
        lines.push(`## ${n.title || "Untitled"}`, `*${refsText(n.refs)}${n.tags.length ? " · " + n.tags.map((t: string) => "#" + t).join(" ") : ""} · ${n.updated_at.slice(0, 10)}*`, "", n.body, "");
      }
      lines.push("# Sermons", "");
      for (const s of d.sermons.filter((s: any) => !s.deleted_at)) lines.push(`## ${s.title || "Untitled"}`, refsText(s.refs), "", s.body, "");
      download(`quiet-time-${stamp()}.md`, lines.join("\n"), "text/markdown");
      status.textContent = "Markdown exported.";
    } catch (e: any) { status.textContent = "Export failed: " + e.message; }
  };
  const file = h("input", { type: "file", accept: "application/json" });
  const restore = async () => {
    const f = file.files?.[0];
    if (!f) { status.textContent = "Choose a backup file first."; return; }
    try {
      const d = JSON.parse(await f.text());
      if (d.app !== "quiet-time") throw new Error("Not a Quiet Time backup");
      const ids: number[] = d.transcriptions.map((t: any) => t.verse_id).sort((a: number, b: number) => a - b);
      const existing = await fetchAll("transcriptions", "verse_id,typed", "verse_id");
      const have = new Map(existing.map((r) => [r.verse_id, r.typed]));
      let added = 0, skipped = 0;
      const local = await getTx(ids);
      for (const t of d.transcriptions) {
        if (have.get(t.verse_id) || local.get(t.verse_id)?.typed) { skipped++; continue; }
        await saveTx({ verse_id: t.verse_id, typed: t.typed, status: t.status, revision: 0 }); added++;
      }
      const docsHave = new Set((await idb.getAll<DocRec>("docs")).map((x) => x.id));
      let docs = 0;
      for (const [kind, arr] of [["notes", d.notes], ["sermons", d.sermons]] as const) {
        for (const n of arr as any[]) {
          if (docsHave.has(n.id) || n.deleted_at) continue;
          await saveDoc({ id: n.id, kind, title: n.title, body: n.body, refs: n.refs ?? [], tags: n.tags ?? [], note_ids: n.note_ids ?? [],
            revision: 0, deleted: false, created_at: n.created_at, updated_at: n.updated_at }); docs++;
        }
      }
      status.textContent = `Restored ${added} verses and ${docs} notes/sermons. Skipped ${skipped} verses that already have text (nothing was overwritten).`;
    } catch (e: any) { status.textContent = "Restore failed: " + e.message; }
  };

  shell(root, "Settings",
    h("section", { class: "card" }, h("h3", {}, "Export"),
      h("p", { class: "small" }, "Download everything you have written: your transcription in canonical order, notes and sermons. Keep a copy somewhere other than this app."),
      h("div", { class: "row" }, h("button", { class: "primary", onclick: exportJson }, "Full backup (JSON)"), h("button", { onclick: exportMd }, "Readable copy (Markdown)"))),
    h("section", { class: "card" }, h("h3", {}, "Restore"),
      h("p", { class: "small" }, "Adds verses, notes and sermons from a backup that are missing here. It never overwrites existing text."),
      h("div", { class: "row" }, file, h("button", { onclick: restore }, "Restore"))),
    status,
    h("section", { class: "card" }, h("h3", {}, "Keyboard"),
      h("ul", { class: "small" },
        h("li", {}, "Enter: next verse · Shift-Enter: line break (poetry)"),
        h("li", {}, "Backspace at the start of a verse: previous verse"),
        h("li", {}, "Option-E: jump to the first error · Option-N: new note · Option-T or Esc: back to typing"))),
    securityCard(),
    h("section", { class: "card" }, h("h3", {}, "Account"),
      h("button", { onclick: async () => { await flush(); await sb.auth.signOut(); location.hash = "#/"; location.reload(); } }, "Sign out")));
}

export { formatRange };
