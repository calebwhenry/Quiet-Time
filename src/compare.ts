/**
 * Live accuracy comparison between typed text and the source verse.
 *
 * Comparison policy (explicit and tested in compare.test.ts):
 *  - Compared token by token: words (letters/digits, with internal apostrophes) and
 *    individual punctuation marks. Case and punctuation matter.
 *  - Whitespace is not graded beyond separating words: extra spaces, line breaks
 *    (poetry) and non-breaking spaces are all equivalent.
 *  - Typographic equivalences: curly single quotes/apostrophes = ', curly double
 *    quotes = ", em dash — may be typed as "--", en dash – may be typed as "-",
 *    ellipsis … may be typed as "...".
 *  - Nothing else is equated: a changed word or punctuation mark is an error.
 *  - The source text itself is never modified; normalization only affects comparison.
 */

export interface Token {
  raw: string;
  norm: string;
  start: number;
  end: number;
}

export interface CompareResult {
  complete: boolean;
  /** Character ranges in the typed text that are wrong. */
  errors: Array<[number, number]>;
  /** Offsets in the typed text where source words are missing. */
  missing: number[];
  /** Offset of the first problem in the typed text, or -1. */
  firstError: number;
  /** Human-readable description of the first problem. */
  hint: string;
  /** Number of source tokens correctly typed (for progress). */
  matched: number;
  total: number;
}

const TOKEN_RE = /--|\.\.\.|\s+|[\p{L}\p{N}\p{M}]+(?:['‘’ʼ][\p{L}\p{N}\p{M}]+)*|[^\s]/gsu;

export function normalizeToken(t: string): string {
  return t
    .replace(/[‘’‚‛ʼ′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/^--$/, "—")
    .replace(/^\.\.\.$/, "…")
    .replace(/–/g, "-");
}

export function tokenize(s: string): Token[] {
  const out: Token[] = [];
  for (const m of s.matchAll(TOKEN_RE)) {
    const raw = m[0];
    if (/^\s+$/.test(raw)) continue;
    const start = m.index!;
    out.push({ raw, norm: normalizeToken(raw), start, end: start + raw.length });
  }
  return out;
}

type Op = { k: "eq"; t: number; s: number } | { k: "add"; t: number } | { k: "del"; s: number };

function align(a: Token[], b: Token[]): Op[] {
  const n = a.length, m = b.length;
  // LCS table (verses are short; n*m is small).
  const w = m + 1;
  const L = new Uint16Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      L[i * w + j] = a[i].norm === b[j].norm ? L[(i + 1) * w + j + 1] + 1 : Math.max(L[(i + 1) * w + j], L[i * w + j + 1]);
  const ops: Op[] = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i].norm === b[j].norm) { ops.push({ k: "eq", t: i++, s: j++ }); }
    else if (j < m && (i >= n || L[i * w + j + 1] >= L[(i + 1) * w + j])) { ops.push({ k: "del", s: j++ }); }
    else { ops.push({ k: "add", t: i++ }); }
  }
  return ops;
}

function stripTail(ops: Op[]): Op[] {
  let end = ops.length;
  while (end > 0 && ops[end - 1].k === "del") end--;
  return ops.slice(0, end);
}

export function compare(typed: string, source: string): CompareResult {
  const t = tokenize(typed);
  const s = tokenize(source);
  const res: CompareResult = { complete: false, errors: [], missing: [], firstError: -1, hint: "", matched: 0, total: s.length };
  if (t.length === 0) return res;

  // A trailing word with no whitespace after it may still be in progress: if it is a
  // prefix of the next expected source word, it isn't graded yet.
  const last = t[t.length - 1];
  const inProgress = typed.length === last.end && /[\p{L}\p{N}]/u.test(last.raw);
  let body = stripTail(align(t, s));
  if (inProgress) {
    const pre = stripTail(align(t.slice(0, -1), s));
    const consumed = pre.filter((o) => o.k !== "add").length;
    const next = s[consumed];
    if (next && next.norm !== last.norm && next.norm.startsWith(last.norm)) body = pre;
  }

  let firstErr = -1;
  const note = (pos: number, hint: string) => {
    if (firstErr < 0 || pos < firstErr) { firstErr = pos; res.hint = hint; }
  };
  for (let k = 0; k < body.length; k++) {
    const op = body[k];
    if (op.k === "eq") { res.matched++; continue; }
    if (op.k === "add") {
      const tok = t[op.t];
      res.errors.push([tok.start, tok.end]);
      const exp = nearestSource(body, k, s);
      note(tok.start, exp ? `\u201C${tok.raw}\u201D should be \u201C${exp.raw}\u201D` : `Extra \u201C${tok.raw}\u201D`);
    } else {
      const run: string[] = [];
      let q = k;
      for (; q < body.length && body[q].k === "del"; q++) run.push(s[(body[q] as { s: number }).s].raw);
      const nb = body[q] as { k: string; t: number } | undefined;
      const pos = nb && nb.k !== "del" ? t[nb.t].start : typed.length;
      if (nb && nb.k === "add") {
        // A replacement: the add branch will flag the wrong word; hint with the expected text.
        note(t[nb.t].start, `\u201C${t[nb.t].raw}\u201D should be \u201C${joinTokens(run)}\u201D`);
      } else {
        res.missing.push(pos);
        note(pos, `Missing \u201C${joinTokens(run)}\u201D`);
      }
      k = q - 1;
    }
  }
  res.firstError = firstErr;
  res.complete = t.length === s.length && t.every((x, i) => x.norm === s[i].norm);
  return res;
}

function nearestSource(body: Op[], k: number, s: Token[]): Token | undefined {
  for (let q = k + 1; q < body.length; q++) {
    const o = body[q];
    if (o.k === "del") return s[o.s];
    if (o.k === "eq") break;
  }
  for (let q = k - 1; q >= 0; q--) {
    const o = body[q];
    if (o.k === "del") return s[o.s];
    if (o.k === "eq") return s[o.s + 1];
  }
  return s[0];
}

/** Join source tokens for display without spaces before closing punctuation. */
function joinTokens(run: string[]): string {
  return run.join(" ").replace(/ ([,.;:!?\u2019\u201D)\]])/g, "$1").replace(/([(\[\u2018\u201C]) /g, "$1");
}
