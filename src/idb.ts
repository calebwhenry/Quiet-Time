// Tiny promise wrapper around IndexedDB. Stores:
//  tx      keyPath verse_id   — the user's typed text (local copy, may be dirty)
//  docs    keyPath id         — notes and sermons
//  verses  keyPath id         — cached source text for offline use
//  dirty   key "tx:<id>"/"doc:<id>" — durable sync queue
//  kv      key string         — plan, progress, misc
const DB_NAME = "quiet-time";
let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      db.createObjectStore("tx", { keyPath: "verse_id" });
      db.createObjectStore("docs", { keyPath: "id" });
      db.createObjectStore("verses", { keyPath: "id" });
      db.createObjectStore("dirty");
      db.createObjectStore("kv");
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbp;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}

export async function get<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await open();
  return req(db.transaction(store).objectStore(store).get(key)) as Promise<T | undefined>;
}
export async function getAll<T>(store: string, range?: IDBKeyRange): Promise<T[]> {
  const db = await open();
  return req(db.transaction(store).objectStore(store).getAll(range)) as Promise<T[]>;
}
export async function getAllKeys(store: string): Promise<IDBValidKey[]> {
  const db = await open();
  return req(db.transaction(store).objectStore(store).getAllKeys());
}
export async function put(store: string, value: unknown, key?: IDBValidKey): Promise<void> {
  const db = await open();
  await req(db.transaction(store, "readwrite").objectStore(store).put(value, key));
}
export async function putMany(store: string, values: unknown[]): Promise<void> {
  if (!values.length) return;
  const db = await open();
  const t = db.transaction(store, "readwrite");
  const os = t.objectStore(store);
  for (const v of values) os.put(v);
  await new Promise<void>((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
}
export async function del(store: string, key: IDBValidKey): Promise<void> {
  const db = await open();
  await req(db.transaction(store, "readwrite").objectStore(store).delete(key));
}
export async function clearAll(): Promise<void> {
  const db = await open();
  const stores = ["tx", "docs", "verses", "dirty", "kv"];
  const t = db.transaction(stores, "readwrite");
  for (const s of stores) t.objectStore(s).clear();
  await new Promise<void>((res) => { t.oncomplete = () => res(); });
}
export const range = (lo: number, hi: number) => IDBKeyRange.bound(lo, hi);
