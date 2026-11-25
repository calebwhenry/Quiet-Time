/**
 * Local-first data layer. Every edit is written to IndexedDB immediately and marked
 * dirty in a durable queue; a debounced flush pushes it to Supabase with revision
 * checks. Nothing depends on unload events: the queue survives reloads and is
 * retried on the next flush, on reconnect and on visibility changes.
 */
import * as idb from "./idb";
import { sb } from "./supabase";

export type TxStatus = "draft" | "complete" | "unverified";
export interface TxRec {
  verse_id: number;
  typed: string;
  status: TxStatus;
  revision: number; // last server revision this local copy is based on (0 = never synced)
  conflict?: { typed: string; status: TxStatus; revision: number };
  updated_local?: number;
}
export interface DocRec {
  id: string;
  kind: "notes" | "sermons";
  title: string;
  body: string;
  refs: { s: number; e: number }[];
  tags: string[];
  note_ids: string[];
  revision: number;
  deleted: boolean;
  created_at: string;
  updated_at: string;
}
export interface Verse { id: number; text: string; formatting?: unknown }
export interface Passage { day: number; passage_order: number; start_id: number; end_id: number; label: string }
export interface Plan { id: string; title: string; start_date: string; end_date: string; days: Passage[][]; meta?: any }

export type SyncState = "synced" | "saving" | "pending" | "offline" | "error";
type Listener = (s: { state: SyncState; pending: number; message?: string }) => void;
const listeners = new Set<Listener>();
let state: SyncState = "synced";
let lastMessage = "";
const dirty = new Set<string>();

export function onSync(l: Listener) { listeners.add(l); l({ state, pending: dirty.size, message: lastMessage }); return () => listeners.delete(l); }
function emit(s: SyncState, message = "") {
  state = s; lastMessage = message;
  listeners.forEach((l) => l({ state, pending: dirty.size, message }));
}

export async function initStore() {
  for (const k of await idb.getAllKeys("dirty")) dirty.add(String(k));
  await healConflicts();
  if (dirty.size) emit("pending");
  window.addEventListener("online", () => flushSoon(200));
  window.addEventListener("offline", () => emit("offline"));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
  setInterval(() => { if (dirty.size) flush(); }, 20000);
  flushSoon(500);
}

async function markDirty(key: string) {
  dirty.add(key);
  await idb.put("dirty", Date.now(), key);
}
async function clearDirty(key: string) {
  dirty.delete(key);
  await idb.del("dirty", key);
}

// ---------- Transcriptions ----------
export async function getTx(ids: number[]): Promise<Map<number, TxRec>> {
  if (!ids.length) return new Map();
  const recs = await idb.getAll<TxRec>("tx", idb.range(ids[0], ids[ids.length - 1]));
  return new Map(recs.map((r) => [r.verse_id, r]));
}

/** Save typed text locally. Revision and conflict state are owned by the sync layer, never the editor. */
export async function saveTx(verse_id: number, typed: string, status: TxStatus) {
  await idb.update<TxRec>("tx", verse_id, (cur) => ({ ...(cur ?? { verse_id, revision: 0 }), verse_id, typed, status, updated_local: Date.now() }));
  await markDirty(`tx:${verse_id}`);
  emit("pending");
  flushSoon();
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim();
/** A "conflict" where the cloud copy is just an earlier draft of what this device has is not a real conflict. */
export const isStaleDraft = (cloud: string, local: string) => squash(local).startsWith(squash(cloud));

/** Auto-resolve conflicts left over from older versions of the app when the cloud copy is a stale draft. */
async function healConflicts() {
  for (const k of [...dirty].filter((k) => k.startsWith("tx:"))) {
    await idb.update<TxRec>("tx", Number(k.slice(3)), (cur) => {
      if (!cur?.conflict || !isStaleDraft(cur.conflict.typed, cur.typed)) return undefined;
      const { conflict, ...rest } = cur;
      return { ...rest, revision: Math.max(cur.revision, conflict.revision) };
    });
  }
}

/** Pull server rows for a verse range and merge without losing local edits. */
export async function pullTx(s: number, e: number): Promise<number[]> {
  const { data, error } = await sb.from("transcriptions").select("verse_id,typed,status,revision")
    .gte("verse_id", s).lte("verse_id", e);
  if (error) throw error;
  const changed: number[] = [];
  const local = await idb.getAll<TxRec>("tx", idb.range(s, e));
  const byId = new Map(local.map((r) => [r.verse_id, r]));
  const writes: TxRec[] = [];
  for (const row of data as TxRec[]) {
    const l = byId.get(row.verse_id);
    const isDirty = dirty.has(`tx:${row.verse_id}`);
    if (!l || (!isDirty && l.revision !== row.revision) || (!isDirty && l.typed !== row.typed)) {
      writes.push({ verse_id: row.verse_id, typed: row.typed, status: row.status, revision: row.revision });
      changed.push(row.verse_id);
    } else if (isDirty && row.revision > l.revision && row.typed !== l.typed) {
      if (isStaleDraft(row.typed, l.typed)) writes.push({ ...l, revision: row.revision });
      else { writes.push({ ...l, conflict: { typed: row.typed, status: row.status, revision: row.revision } }); changed.push(row.verse_id); }
    } else if (isDirty && row.revision > l.revision) {
      writes.push({ ...l, revision: row.revision });
    }
  }
  await idb.putMany("tx", writes);
  return changed;
}

export async function resolveConflict(verse_id: number, keep: "mine" | "cloud") {
  const r = await idb.update<TxRec>("tx", verse_id, (cur) => {
    if (!cur?.conflict) return undefined;
    const c = cur.conflict;
    return keep === "cloud" ? { verse_id, typed: c.typed, status: c.status, revision: c.revision }
      : (({ conflict, ...rest }) => ({ ...rest, revision: c.revision }))(cur);
  });
  if (!r) return;
  if (keep === "cloud") await clearDirty(`tx:${verse_id}`);
  else { await markDirty(`tx:${verse_id}`); flushSoon(100); }
}

// ---------- Notes & sermons ----------
export async function allDocs(kind: "notes" | "sermons"): Promise<DocRec[]> {
  return (await idb.getAll<DocRec>("docs")).filter((d) => d.kind === kind && !d.deleted);
}
export async function saveDoc(d: DocRec) {
  d.updated_at = new Date().toISOString();
  await idb.put("docs", d);
  await markDirty(`doc:${d.id}`);
  emit("pending");
  flushSoon();
}
export function newDoc(kind: "notes" | "sermons", init: Partial<DocRec> = {}): DocRec {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), kind, title: "", body: "", refs: [], tags: [], note_ids: [], revision: 0,
    deleted: false, created_at: now, updated_at: now, ...init };
}

function rowToDoc(kind: "notes" | "sermons", r: any): DocRec {
  return { id: r.id, kind, title: r.title, body: r.body, refs: r.refs ?? [], tags: r.tags ?? [], note_ids: r.note_ids ?? [],
    revision: r.revision, deleted: !!r.deleted_at, created_at: r.created_at, updated_at: r.updated_at };
}

export async function pullDocs(kind: "notes" | "sermons") {
  const sinceKey = `pulled:${kind}`;
  const since = (await idb.get<string>("kv", sinceKey)) ?? "1970-01-01T00:00:00Z";
  const cols = kind === "notes" ? "id,title,body,refs,tags,revision,created_at,updated_at,deleted_at"
    : "id,title,body,refs,note_ids,revision,created_at,updated_at,deleted_at";
  let maxTs = since;
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(kind).select(cols).gt("updated_at", since).order("updated_at").range(from, from + 999);
    if (error) throw error;
    for (const r of data as any[]) {
      const local = await idb.get<DocRec>("docs", r.id);
      const isDirty = dirty.has(`doc:${r.id}`);
      if (isDirty && local && r.revision > local.revision) {
        await keepConflictCopy(local);
        await clearDirty(`doc:${r.id}`);
      }
      if (!isDirty || (local && r.revision > local.revision)) await idb.put("docs", rowToDoc(kind, r));
      if (r.updated_at > maxTs) maxTs = r.updated_at;
    }
    if ((data as any[]).length < 1000) break;
  }
  await idb.put("kv", maxTs, sinceKey);
}

async function keepConflictCopy(local: DocRec) {
  const copy = { ...local, id: crypto.randomUUID(), revision: 0, title: `${local.title || "Untitled"} (conflict copy)` };
  await idb.put("docs", copy);
  await markDirty(`doc:${copy.id}`);
}

// ---------- Flush ----------
let timer: number | undefined;
let flushing = false;
export function flushSoon(ms = 2500) {
  clearTimeout(timer);
  timer = window.setTimeout(flush, ms);
}

export async function flush(): Promise<void> {
  if (flushing || !dirty.size) { if (!dirty.size && state !== "offline") emit("synced"); return; }
  if (!navigator.onLine) { emit("offline"); return; }
  flushing = true;
  emit("saving");
  try {
    const keys = [...dirty];
    const txKeys = keys.filter((k) => k.startsWith("tx:")).slice(0, 300);
    if (txKeys.length) {
      const recs: TxRec[] = [];
      for (const k of txKeys) {
        const r = await idb.get<TxRec>("tx", Number(k.slice(3)));
        if (!r) { await clearDirty(k); continue; }
        if (r.conflict) continue; // waits for the user's decision
        recs.push(r);
      }
      if (recs.length) {
        const items = recs.map((r) => ({ verse_id: r.verse_id, typed: r.typed, status: r.status, base_revision: r.revision }));
        const { data, error } = await sb.rpc("save_transcriptions", { p_items: items });
        if (error) throw error;
        let retry = false;
        for (const res of data as any[]) {
          const sent = recs.find((r) => r.verse_id === res.verse_id)!;
          if (res.ok) {
            const cur = await idb.update<TxRec>("tx", res.verse_id, (cur) => cur && { ...cur, revision: res.revision });
            // Only clear if nothing changed locally while the request was in flight.
            if (cur && cur.typed === sent.typed && cur.status === sent.status) await clearDirty(`tx:${res.verse_id}`);
          } else {
            let stale = false;
            await idb.update<TxRec>("tx", res.verse_id, (cur) => {
              if (!cur) return undefined;
              if (isStaleDraft(res.conflict.typed, cur.typed)) { stale = retry = true; return { ...cur, revision: res.conflict.revision }; }
              return { ...cur, conflict: res.conflict };
            });
            if (!stale) window.dispatchEvent(new CustomEvent("qt-conflict", { detail: res.verse_id }));
          }
        }
        if (retry) flushSoon(200);
      }
    }
    for (const k of keys.filter((k) => k.startsWith("doc:")).slice(0, 50)) {
      const d = await idb.get<DocRec>("docs", k.slice(4));
      if (!d) { await clearDirty(k); continue; }
      const payload: any = { id: d.id, title: d.title, body: d.body, refs: d.refs, deleted: d.deleted, base_revision: d.revision };
      if (d.kind === "notes") payload.tags = d.tags; else payload.note_ids = d.note_ids;
      const { data, error } = await sb.rpc("save_doc", { p_table: d.kind, p: payload });
      if (error) throw error;
      const cur = (await idb.get<DocRec>("docs", d.id))!;
      if ((data as any).ok) {
        cur.revision = (data as any).revision;
        await idb.put("docs", cur);
        if (cur.updated_at === d.updated_at) await clearDirty(k);
      } else {
        // Someone (another device) saved a newer revision: keep ours as a copy, take theirs.
        await keepConflictCopy(cur);
        await clearDirty(k);
        await idb.put("kv", "1970-01-01T00:00:00Z", `pulled:${d.kind}`);
        await pullDocs(d.kind);
        window.dispatchEvent(new CustomEvent("qt-docs-changed"));
      }
    }
    const blocked = [...dirty].every((k) => k.startsWith("tx:"))
      && (await Promise.all([...dirty].map((k) => idb.get<TxRec>("tx", Number(k.slice(3)))))).every((r) => r?.conflict);
    emit(dirty.size === 0 ? "synced" : blocked ? "error" : "pending", blocked ? "Resolve conflicts to finish syncing" : "");
    if (dirty.size && !blocked) flushSoon(1000);
  } catch (e: any) {
    emit(navigator.onLine ? "error" : "offline", e?.message ?? String(e));
    flushSoon(10000);
  } finally {
    flushing = false;
  }
}

// ---------- Source text & plan ----------
export async function getVerses(s: number, e: number, expected: number): Promise<Map<number, Verse>> {
  let cached = await idb.getAll<Verse>("verses", idb.range(s, e));
  if (cached.length < expected && navigator.onLine) {
    try {
      const { data, error } = await sb.from("bible_verses").select("id,text,formatting").gte("id", s).lte("id", e).order("id");
      if (!error && data) { await idb.putMany("verses", data); cached = data as Verse[]; }
    } catch { /* offline: use cache */ }
  }
  return new Map(cached.map((v) => [v.id, v]));
}

export async function loadPlan(refresh = false): Promise<Plan | null> {
  const cached = await idb.get<Plan>("kv", "plan");
  if (cached && !refresh) { loadPlan(true).catch(() => {}); return cached; }
  try {
    const { data: plans, error } = await sb.from("reading_plans").select("*").order("created_at", { ascending: false }).limit(1);
    if (error || !plans?.length) return cached ?? null;
    const p = plans[0];
    const { data: rows, error: e2 } = await sb.from("plan_assignments").select("day,passage_order,start_id,end_id,label")
      .eq("plan_id", p.id).order("day").order("passage_order").limit(5000);
    if (e2 || !rows) return cached ?? null;
    const days: Passage[][] = [];
    for (const r of rows as Passage[]) (days[r.day - 1] ??= []).push(r);
    const plan: Plan = { id: p.id, title: p.title, start_date: p.start_date, end_date: p.end_date, days, meta: p.meta };
    await idb.put("kv", plan, "plan");
    return plan;
  } catch { return cached ?? null; }
}

export function todayDay(plan: Plan): number {
  const start = new Date(plan.start_date + "T00:00:00");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((today.getTime() - start.getTime()) / 86400000) + 1;
}

// ---------- Progress ----------
export interface Progress { plan_id?: string; current_day?: number; verse_id?: number; caret?: number; prefs?: any }
let progTimer: number | undefined;
export async function getProgress(): Promise<Progress> {
  const local = (await idb.get<Progress & { t?: number }>("kv", "progress")) ?? {};
  try {
    const { data } = await sb.from("user_progress").select("*").maybeSingle();
    if (data && (!local.t || new Date(data.updated_at).getTime() > local.t)) return data;
  } catch { /* offline */ }
  return local;
}
export async function setProgress(p: Progress) {
  const rec = { ...((await idb.get<Progress>("kv", "progress")) ?? {}), ...p, t: Date.now() };
  await idb.put("kv", rec, "progress");
  clearTimeout(progTimer);
  progTimer = window.setTimeout(async () => {
    const { data: u } = await sb.auth.getUser();
    if (!u.user) return;
    await sb.from("user_progress").upsert({ owner_id: u.user.id, plan_id: rec.plan_id, current_day: rec.current_day,
      verse_id: rec.verse_id, caret: rec.caret, prefs: rec.prefs ?? {}, updated_at: new Date().toISOString() });
  }, 3000);
}

export async function countComplete(): Promise<number | null> {
  try {
    const { count } = await sb.from("transcriptions").select("verse_id", { count: "exact", head: true }).eq("status", "complete");
    return count ?? null;
  } catch { return null; }
}
export async function sourceInfo(): Promise<any | null> {
  try {
    const { data } = await sb.from("bible_sources").select("translation,edition,verse_count,imported_at").eq("is_active", true).maybeSingle();
    return data;
  } catch { return null; }
}
