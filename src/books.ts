import structure from "./data/structure.json";

export const BOOK_NAMES = [
  "Genesis","Exodus","Leviticus","Numbers","Deuteronomy","Joshua","Judges","Ruth","1 Samuel","2 Samuel",
  "1 Kings","2 Kings","1 Chronicles","2 Chronicles","Ezra","Nehemiah","Esther","Job","Psalms","Proverbs",
  "Ecclesiastes","Song of Songs","Isaiah","Jeremiah","Lamentations","Ezekiel","Daniel","Hosea","Joel","Amos",
  "Obadiah","Jonah","Micah","Nahum","Habakkuk","Zephaniah","Haggai","Zechariah","Malachi",
  "Matthew","Mark","Luke","John","Acts","Romans","1 Corinthians","2 Corinthians","Galatians","Ephesians",
  "Philippians","Colossians","1 Thessalonians","2 Thessalonians","1 Timothy","2 Timothy","Titus","Philemon",
  "Hebrews","James","1 Peter","2 Peter","1 John","2 John","3 John","Jude","Revelation",
];

const ALIASES: Record<string, number> = {};
BOOK_NAMES.forEach((n, i) => {
  const key = n.toLowerCase().replace(/\s+/g, "");
  ALIASES[key] = i + 1;
});
const extra: Record<string, string> = {
  gen:"genesis",ge:"genesis",gn:"genesis",ex:"exodus",exo:"exodus",exod:"exodus",lev:"leviticus",lv:"leviticus",
  num:"numbers",nu:"numbers",deut:"deuteronomy",dt:"deuteronomy",deu:"deuteronomy",josh:"joshua",jos:"joshua",
  judg:"judges",jdg:"judges",ru:"ruth",rut:"ruth","1sam":"1samuel","2sam":"2samuel","1sa":"1samuel","2sa":"2samuel",
  "1kgs":"1kings","2kgs":"2kings","1ki":"1kings","2ki":"2kings","1chr":"1chronicles","2chr":"2chronicles",
  "1ch":"1chronicles","2ch":"2chronicles",ezr:"ezra",neh:"nehemiah",est:"esther",esth:"esther",jb:"job",
  ps:"psalms",psa:"psalms",psalm:"psalms",pss:"psalms",prov:"proverbs",pr:"proverbs",pro:"proverbs",
  eccl:"ecclesiastes",ecc:"ecclesiastes",qoh:"ecclesiastes",song:"songofsongs",sos:"songofsongs",
  songofsolomon:"songofsongs",sng:"songofsongs",isa:"isaiah",is:"isaiah",jer:"jeremiah",lam:"lamentations",
  ezek:"ezekiel",eze:"ezekiel",ezk:"ezekiel",dan:"daniel",dn:"daniel",hos:"hosea",joe:"joel",jl:"joel",
  amo:"amos",am:"amos",obad:"obadiah",ob:"obadiah",jon:"jonah",jnh:"jonah",mic:"micah",nah:"nahum",
  hab:"habakkuk",zeph:"zephaniah",zep:"zephaniah",hag:"haggai",zech:"zechariah",zec:"zechariah",mal:"malachi",
  mt:"matthew",matt:"matthew",mat:"matthew",mk:"mark",mrk:"mark",mar:"mark",lk:"luke",luk:"luke",
  jn:"john",jhn:"john",joh:"john",act:"acts",ac:"acts",rom:"romans",ro:"romans",
  "1cor":"1corinthians","2cor":"2corinthians","1co":"1corinthians","2co":"2corinthians",gal:"galatians",
  eph:"ephesians",phil:"philippians",php:"philippians",col:"colossians","1thess":"1thessalonians",
  "2thess":"2thessalonians","1th":"1thessalonians","2th":"2thessalonians","1tim":"1timothy","2tim":"2timothy",
  "1ti":"1timothy","2ti":"2timothy",tit:"titus",phlm:"philemon",phm:"philemon",philem:"philemon",heb:"hebrews",
  jas:"james",jam:"james","1pet":"1peter","2pet":"2peter","1pe":"1peter","2pe":"2peter","1jn":"1john",
  "2jn":"2john","3jn":"3john","1jo":"1john","2jo":"2john","3jo":"3john",jud:"jude",jude:"jude",rev:"revelation",re:"revelation",
};
for (const [k, v] of Object.entries(extra)) ALIASES[k] = ALIASES[v];

export const CHAPTERS: number[][] = (structure as { chapters: number[][] }).chapters;
export const OMITTED = new Set<number>((structure as { omitted: number[] }).omitted);

export const vid = (b: number, c: number, v: number) => b * 1_000_000 + c * 1000 + v;
export const splitId = (id: number) => ({ b: Math.floor(id / 1_000_000), c: Math.floor(id / 1000) % 1000, v: id % 1000 });
export const isOT = (b: number) => b <= 39;

export function lastVerse(b: number, c: number) { return CHAPTERS[b - 1]?.[c - 1] ?? 0; }

/** All verse ids in an inclusive range, from the bundled structure (numbers only). */
export function verseIdsInRange(s: number, e: number): number[] {
  const out: number[] = [];
  const a = splitId(s), z = splitId(e);
  for (let b = a.b; b <= z.b; b++) {
    const chs = CHAPTERS[b - 1];
    const c0 = b === a.b ? a.c : 1, c1 = b === z.b ? z.c : chs.length;
    for (let c = c0; c <= c1; c++) {
      const v0 = b === a.b && c === a.c ? a.v : 1, v1 = b === z.b && c === z.c ? z.v : chs[c - 1];
      for (let v = v0; v <= v1; v++) { const id = vid(b, c, v); if (!OMITTED.has(id)) out.push(id); }
    }
  }
  return out;
}

export function formatId(id: number) { const { b, c, v } = splitId(id); return `${BOOK_NAMES[b - 1]} ${c}:${v}`; }

export function formatRange(s: number, e: number): string {
  const a = splitId(s), z = splitId(e);
  const name = BOOK_NAMES[a.b - 1];
  if (s === e) return `${name} ${a.c}:${a.v}`;
  if (a.b !== z.b) return `${formatId(s)} – ${formatId(e)}`;
  const wholeChapters = a.v === 1 && z.v === lastVerse(z.b, z.c);
  if (wholeChapters) return a.c === z.c ? `${name} ${a.c}` : `${name} ${a.c}–${z.c}`;
  if (a.c === z.c) return `${name} ${a.c}:${a.v}–${z.v}`;
  return `${name} ${a.c}:${a.v}–${z.c}:${z.v}`;
}

export interface Ref { s: number; e: number }

/** Parse "Gen 1:1-3; John 1; 1 Cor 13:4-7, 13; Ps 23–24". Returns null for invalid input. */
export function parseRefs(input: string): Ref[] | null {
  const out: Ref[] = [];
  let book = 0, chap = 0;
  for (const partRaw of input.split(/[;,]/)) {
    const part = partRaw.trim().replace(/[–—]/g, "-");
    if (!part) continue;
    const m = part.match(/^((?:[1-3]\s*)?[A-Za-z][A-Za-z\s.]*?)?\s*(\d+)?(?::(\d+))?(?:\s*-\s*(\d+)(?::(\d+))?)?$/);
    if (!m) return null;
    const [, bk, n1, v1, n2, v2] = m;
    if (bk) {
      const key = bk.toLowerCase().replace(/[\s.]/g, "");
      book = ALIASES[key] ?? 0;
      if (!book) return null;
      chap = 0;
    }
    if (!book) return null;
    const chs = CHAPTERS[book - 1];
    let s: number, e: number;
    if (!n1) { s = vid(book, 1, 1); e = vid(book, chs.length, chs[chs.length - 1]); }
    else if (bk || v1 || !chap) {
      // n1 is a chapter
      const c1 = +n1;
      if (v1) {
        chap = c1;
        s = vid(book, c1, +v1);
        if (n2 && v2) { e = vid(book, +n2, +v2); chap = +n2; }
        else if (n2) e = vid(book, c1, +n2);
        else e = s;
      } else {
        const c2 = n2 ? +n2 : c1;
        s = vid(book, c1, 1); e = vid(book, c2, lastVerse(book, c2));
        chap = 0;
      }
    } else {
      // bare verse number(s) after "Gen 1:3, 5-7"
      s = vid(book, chap, +n1); e = n2 ? vid(book, chap, +n2) : s;
    }
    const sp = splitId(s), ep = splitId(e);
    if (e < s || sp.c < 1 || sp.c > chs.length || ep.c > chs.length || sp.v < 1 || sp.v > lastVerse(book, sp.c) || ep.v > lastVerse(book, ep.c)) return null;
    out.push({ s, e });
  }
  return out.length ? out : null;
}

export const overlaps = (a: Ref, b: Ref) => a.s <= b.e && b.s <= a.e;
