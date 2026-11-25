/**
 * Private active-time tracking. Time counts only while the page is visible and you've
 * typed in the last 45 seconds, so reading, pausing and walking away aren't counted.
 * Each device stores absolute per-day totals and upserts them, so retries never double count.
 */
import * as idb from "./idb";
import { sb } from "./supabase";

type Kind = "typing" | "notes";
interface DayRec { day: string; typing_seconds: number; notes_seconds: number; synced?: boolean }

const TICK = 5, IDLE_MS = 45_000;
let lastInput = 0;
let kind: Kind = "typing";
let started = false;

export const localDay = (d = new Date()) => d.toLocaleDateString("en-CA"); // YYYY-MM-DD in local time

function deviceId() {
  let id = localStorage.getItem("qt-device");
  if (!id) { id = crypto.randomUUID(); localStorage.setItem("qt-device", id); }
  return id;
}

/** Call on every keystroke in the transcription (typing) or notes/sermons (notes). */
export function ping(k: Kind) { lastInput = Date.now(); kind = k; }

export function startActivity() {
  if (started) return;
  started = true;
  setInterval(async () => {
    if (document.visibilityState !== "visible" || Date.now() - lastInput > IDLE_MS) return;
    const day = localDay();
    await idb.update<DayRec>("kv", `act:${day}`, (cur) => {
      const r = cur ?? { day, typing_seconds: 0, notes_seconds: 0 };
      if (kind === "typing") r.typing_seconds += TICK; else r.notes_seconds += TICK;
      r.synced = false;
      return r;
    });
  }, TICK * 1000);
  setInterval(syncActivity, 60_000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") syncActivity(); });
}

export async function syncActivity() {
  if (!navigator.onLine) return;
  const { data: s } = await sb.auth.getSession();
  if (!s.session) return;
  const keys = (await idb.getAllKeys("kv")).map(String).filter((k) => k.startsWith("act:"));
  const pending: DayRec[] = [];
  for (const k of keys) { const r = await idb.get<DayRec>("kv", k); if (r && !r.synced) pending.push(r); }
  if (!pending.length) return;
  const device_id = deviceId();
  const { error } = await sb.from("daily_activity").upsert(pending.map((r) => ({
    owner_id: s.session!.user.id, device_id, day: r.day, typing_seconds: r.typing_seconds, notes_seconds: r.notes_seconds,
    updated_at: new Date().toISOString(),
  })), { onConflict: "owner_id,device_id,day" });
  if (error) return;
  for (const r of pending) await idb.update<DayRec>("kv", `act:${r.day}`, (cur) => cur && { ...cur, synced: cur.typing_seconds === r.typing_seconds && cur.notes_seconds === r.notes_seconds });
}

export interface DayStat { day: string; typing_seconds: number; notes_seconds: number; verses: number; words: number; notes: number; note_words: number }

/** Daily stats from the server (cached for offline), with this device's unsynced time folded in. */
export async function loadStats(from: string): Promise<DayStat[] | null> {
  await syncActivity().catch(() => {});
  let rows: DayStat[] | null = null;
  try {
    const { data, error } = await sb.rpc("daily_stats", { p_tz: Intl.DateTimeFormat().resolvedOptions().timeZone, p_from: from });
    if (!error && data) { rows = data as DayStat[]; await idb.put("kv", rows, "stats-cache"); }
  } catch { /* offline */ }
  rows ??= (await idb.get<DayStat[]>("kv", "stats-cache")) ?? null;
  if (!rows) return null;
  // Unsynced local seconds (e.g. offline) so today's number never goes backwards.
  for (const r of rows) {
    const loc = await idb.get<DayRec>("kv", `act:${r.day}`);
    if (loc && !loc.synced) {
      r.typing_seconds = Math.max(r.typing_seconds, loc.typing_seconds);
      r.notes_seconds = Math.max(r.notes_seconds, loc.notes_seconds);
    }
  }
  return rows;
}

/** A day counts toward the streak with at least one verse finished or one active minute. */
export const counts = (d: DayStat) => d.verses > 0 || d.typing_seconds + d.notes_seconds >= 60;

export function streaks(rows: DayStat[]) {
  let current = 0, longest = 0, run = 0;
  for (const r of rows) { run = counts(r) ? run + 1 : 0; longest = Math.max(longest, run); }
  // Current: consecutive days ending today, or ending yesterday if today hasn't started yet.
  let i = rows.length - 1;
  const todayDone = i >= 0 && counts(rows[i]);
  if (!todayDone) i--;
  while (i >= 0 && counts(rows[i])) { current++; i--; }
  return { current, longest, todayDone };
}
