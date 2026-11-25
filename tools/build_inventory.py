"""Build a numbers-only chapter inventory (verse numbers + word counts) from a
public-domain KJV JSON (thiagobodruk/bible format). Emits no verse text.
Usage: python3 -I tools/build_inventory.py <en_kjv.json> plan/inventory.json"""
import json, re, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from books import BOOKS, CODE_TO_ID, NIV_OMITTED

src, out = sys.argv[1], sys.argv[2]
data = json.load(open(src, encoding="utf-8-sig"))
assert len(data) == 66
omit = {(CODE_TO_ID[b], c, v) for b, c, v in NIV_OMITTED}
chapters = []
for bi, book in enumerate(data, start=1):
    for ci, verses in enumerate(book["chapters"], start=1):
        nums, words = [], 0
        for vi, text in enumerate(verses, start=1):
            if (bi, ci, vi) in omit:
                continue
            nums.append(vi)
            words += len(re.findall(r"[A-Za-z0-9']+", re.sub(r"\{[^}]*\}", lambda m: m.group(0)[1:-1], text)))
        chapters.append({"book": bi, "chapter": ci, "verses": nums, "words": words})
json.dump({"source": "KJV-derived structure with NIV-1984 omitted verse numbers removed (provisional until NIV import)",
           "chapters": chapters}, open(out, "w"), separators=(",", ":"))
print("chapters", len(chapters), "verses", sum(len(c["verses"]) for c in chapters),
      "words", sum(c["words"] for c in chapters))
