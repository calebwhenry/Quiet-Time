"""Import an authorized NIV 1984 file into Supabase. Standard library only.

Never prints verse text (except the handful you request with --show for spot checks).

Supported inputs (auto-detected):
  * CSV/TSV with columns book,chapter,verse,text (book = code, name or 1-66)
  * JSON: [{"book":..,"chapter":..,"verse":..,"text":..}] or thiagobodruk-style
    [{"name":..,"chapters":[[verse,...],...]}]
  * Zefania XML (<BIBLEBOOK bnumber><CHAPTER cnumber><VERS vnumber>)
  * OSIS XML (<verse osisID="Gen.1.1">...</verse> or milestone sID/eID)

Dry run (default) validates and writes a summary; nothing is uploaded:
  python3 -I tools/import_bible.py ~/bible-data/niv1984.xml --translation "NIV 1984"

Upload (run on your own computer; the service-role key stays in your shell only):
  export SUPABASE_URL=https://<ref>.supabase.co
  export SUPABASE_SERVICE_ROLE_KEY=...   # Dashboard > Project Settings > API. Never commit it.
  python3 -I tools/import_bible.py ~/bible-data/niv1984.xml --translation "NIV 1984" \
      --edition "..." --provenance "where the file came from / permission" --commit
"""
import argparse, csv, hashlib, json, os, re, sys, unicodedata, urllib.request, xml.etree.ElementTree as ET
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from books import BOOKS, CODE_TO_ID, NAME, verse_id

HERE = os.path.dirname(os.path.abspath(__file__))
NAME_TO_ID = {n.lower().replace(" ", ""): i + 1 for i, (_, n, _) in enumerate(BOOKS)}
NAME_TO_ID.update({"songofsolomon": 22, "canticles": 22, "psalm": 19, "revelations": 66})
OSIS = ["Gen","Exod","Lev","Num","Deut","Josh","Judg","Ruth","1Sam","2Sam","1Kgs","2Kgs","1Chr","2Chr","Ezra","Neh","Esth",
        "Job","Ps","Prov","Eccl","Song","Isa","Jer","Lam","Ezek","Dan","Hos","Joel","Amos","Obad","Jonah","Mic","Nah","Hab",
        "Zeph","Hag","Zech","Mal","Matt","Mark","Luke","John","Acts","Rom","1Cor","2Cor","Gal","Eph","Phil","Col","1Thess",
        "2Thess","1Tim","2Tim","Titus","Phlm","Heb","Jas","1Pet","2Pet","1John","2John","3John","Jude","Rev"]
OSIS_TO_ID = {c: i + 1 for i, c in enumerate(OSIS)}

# Short phrases that distinguish the 1984 NIV from the 2011 revision.
EDITION_MARKERS = [
    (45012001, "spiritual act of worship", "true and proper worship"),
    (50004013, "I can do everything through him", "I can do all this through him"),
    (19001001, "Blessed is the man", "Blessed is the one"),
    (1001026, "Let us make man in our image", "Let us make mankind in our image"),
    (54002012, "to have authority over a man", "to assume authority over a man"),
]


def book_id(v):
    s = str(v).strip()
    if s.isdigit():
        return int(s)
    k = s.upper()
    if k in CODE_TO_ID:
        return CODE_TO_ID[k]
    if s in OSIS_TO_ID:
        return OSIS_TO_ID[s]
    return NAME_TO_ID.get(s.lower().replace(" ", "").replace(".", ""))


def parse(path):
    """Yield (book, chapter, verse_label, text)."""
    raw = open(path, "rb").read()
    head = raw[:4000].decode("utf-8-sig", "ignore").lstrip()
    if head.startswith("<"):
        root = ET.fromstring(raw)
        tag = lambda e: e.tag.split("}")[-1]
        if tag(root).upper() == "XMLBIBLE" or root.find(".//BIBLEBOOK") is not None:
            for b in root.iter("BIBLEBOOK"):
                bid = int(b.get("bnumber"))
                for c in b.iter("CHAPTER"):
                    for v in c.iter("VERS"):
                        yield bid, int(c.get("cnumber")), v.get("vnumber"), "".join(v.itertext())
            return
        # OSIS: container verses, or milestones (text between sID and eID).
        cur, buf = None, []
        for ev, el in ET.iterparse(path, events=("start", "end")):
            t = tag(el)
            if t == "verse" and ev == "start":
                if el.get("osisID") and not el.get("sID"):
                    continue
                if el.get("sID"):
                    cur, buf = el.get("osisID") or el.get("sID"), []
                elif el.get("eID") and cur:
                    yield _osis(cur, " ".join(buf))
                    cur = None
            elif t == "verse" and ev == "end" and el.get("osisID") and not el.get("sID") and not el.get("eID"):
                yield _osis(el.get("osisID"), "".join(el.itertext()))
            elif cur and ev == "end":
                if el.text: buf.append(el.text)
                if el.tail: buf.append(el.tail)
        return
    if head.startswith("[") or head.startswith("{"):
        data = json.loads(raw.decode("utf-8-sig"))
        if isinstance(data, dict):
            data = data.get("verses") or data.get("books") or data
        if data and "chapters" in data[0]:
            for bi, b in enumerate(data, start=1):
                for ci, ch in enumerate(b["chapters"], start=1):
                    for vi, t in enumerate(ch, start=1):
                        yield bi, ci, str(vi), t
        else:
            for r in data:
                yield book_id(r["book"]), int(r["chapter"]), str(r["verse"]), r["text"]
        return
    dialect = "excel-tab" if "\t" in head.splitlines()[0] else "excel"
    rows = csv.DictReader(raw.decode("utf-8-sig").splitlines(), dialect=dialect)
    for r in rows:
        r = {k.lower().strip(): v for k, v in r.items()}
        yield book_id(r["book"]), int(r["chapter"]), str(r["verse"]), r["text"]


def _osis(oid, text):
    b, c, v = oid.split(" ")[0].split(".")[:3]
    return OSIS_TO_ID.get(b), int(c), v, text


def clean(t):
    t = unicodedata.normalize("NFC", t or "")
    return re.sub(r"[ \t\r\n]+", " ", t).strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("file")
    ap.add_argument("--translation", default="NIV 1984")
    ap.add_argument("--edition", default="")
    ap.add_argument("--provenance", default="")
    ap.add_argument("--commit", action="store_true", help="upload to Supabase (needs env vars)")
    ap.add_argument("--show", nargs="*", default=[], help="print specific verse ids for spot checks, e.g. 45012001")
    ap.add_argument("--allow-mismatch", action="store_true", help="upload even if structure differs from expectations")
    a = ap.parse_args()

    checksum = hashlib.sha256(open(a.file, "rb").read()).hexdigest()
    verses, problems = {}, {"unknown_book": 0, "duplicates": [], "empty": [], "suffixed": []}
    for b, c, vlabel, text in parse(a.file):
        if not b or not (1 <= b <= 66):
            problems["unknown_book"] += 1
            continue
        m = re.match(r"^(\d+)([a-z]*)", str(vlabel).strip())
        if not m:
            problems["suffixed"].append(f"{b}:{c}:{vlabel}")
            continue
        v = int(m.group(1))
        if m.group(2):
            problems["suffixed"].append(f"{NAME[b]} {c}:{vlabel}")
        vid = verse_id(b, c, v)
        t = clean(text)
        if vid in verses:
            problems["duplicates"].append(f"{NAME[b]} {c}:{v}")
            verses[vid] = (verses[vid] + " " + t).strip()  # merged; reported
            continue
        if not t:
            problems["empty"].append(f"{NAME[b]} {c}:{v}")
        verses[vid] = t

    expected = json.load(open(os.path.join(HERE, "..", "plan", "inventory.json")))["chapters"]
    exp_ids = {verse_id(ch["book"], ch["chapter"], v) for ch in expected for v in ch["verses"]}
    got = set(verses)
    missing, extra = sorted(exp_ids - got), sorted(got - exp_ids)
    fmt = lambda ids: [f"{NAME[i // 1000000]} {i // 1000 % 1000}:{i % 1000}" for i in ids[:25]]
    per_book = {}
    for vid in verses:
        per_book[NAME[vid // 1000000]] = per_book.get(NAME[vid // 1000000], 0) + 1
    markers = []
    for vid, e84, e11 in EDITION_MARKERS:
        t = verses.get(vid, "")
        markers.append({"ref": fmt([vid])[0], "1984": e84 in t, "2011": e11 in t})
    summary = {
        "file_sha256": checksum, "translation": a.translation, "edition": a.edition, "provenance": a.provenance,
        "verse_count": len(verses), "books": len(per_book), "chapters": len({v // 1000 for v in verses}),
        "missing_vs_expected": len(missing), "missing_sample": fmt(missing),
        "extra_vs_expected": len(extra), "extra_sample": fmt(extra),
        "unknown_book_rows": problems["unknown_book"], "duplicates": problems["duplicates"][:25],
        "empty": problems["empty"][:25], "suffixed_labels": problems["suffixed"][:25],
        "edition_markers": markers, "per_book": per_book,
    }
    print(json.dumps({k: v for k, v in summary.items() if k != "per_book"}, indent=1))
    for s in a.show:
        print(f"{fmt([int(s)])[0]}: {verses.get(int(s), '<missing>')}")
    looks_1984 = sum(m["1984"] for m in markers) >= 3 and not any(m["2011"] for m in markers)
    print("Edition check:", "consistent with NIV 1984" if looks_1984 else "NOT clearly NIV 1984 - verify before importing")
    ok = looks_1984 and not missing and not problems["duplicates"] and not problems["empty"] and not problems["unknown_book"]
    if not a.commit:
        print("Dry run only. Re-run with --commit to upload.")
        return
    if not ok and not a.allow_mismatch:
        sys.exit("Refusing to upload: validation problems above (use --allow-mismatch after reviewing them).")
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        sys.exit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your shell (never in a file in the repo).")

    def call(method, path, body=None, prefer="return=representation"):
        req = urllib.request.Request(url.rstrip("/") + "/rest/v1/" + path, method=method,
            data=json.dumps(body).encode() if body is not None else None,
            headers={"apikey": key, "Authorization": "Bearer " + key, "Content-Type": "application/json", "Prefer": prefer})
        with urllib.request.urlopen(req) as r:
            txt = r.read()
            return json.loads(txt) if txt else None

    src = call("POST", "bible_sources", {"translation": a.translation, "edition": a.edition, "provenance": a.provenance,
        "checksum_sha256": checksum, "verse_count": len(verses), "validation": {k: v for k, v in summary.items() if k != "per_book"}})[0]
    rows = [{"id": vid, "source_id": src["id"], "book_id": vid // 1000000, "chapter": vid // 1000 % 1000, "verse": vid % 1000, "text": t}
            for vid, t in sorted(verses.items())]
    for i in range(0, len(rows), 1000):
        call("POST", "bible_verses?on_conflict=id", rows[i:i + 1000], prefer="resolution=merge-duplicates,return=minimal")
        print(f"uploaded {min(i + 1000, len(rows))}/{len(rows)}", end="\r")
    call("PATCH", "bible_sources?is_active=eq.true", {"is_active": False}, prefer="return=minimal")
    call("PATCH", f"bible_sources?id=eq.{src['id']}", {"is_active": True}, prefer="return=minimal")
    print(f"\nDone. Source #{src['id']} active with {len(rows)} verses. Existing transcriptions are untouched and will be re-checked in the app.")


if __name__ == "__main__":
    main()
