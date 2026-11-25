"""Validate a plan against a verse inventory.

Inventory: either plan/inventory.json (chapters with verse lists) or a CSV of
verse ids (one integer per line, e.g. exported from bible_verses after the NIV import).
Checks: 365 consecutive dates, every inventory verse covered exactly once, no range
outside the inventory, OT books in canonical order, each NT book read contiguously,
every book present, valid ranges.
Usage: python3 -I tools/validate_plan.py plan/plan.json plan/inventory.json|ids.csv
"""
import json, os, sys
from datetime import date, timedelta
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from books import TESTAMENT, NAME


def load_inventory(path):
    if path.endswith(".json"):
        inv = json.load(open(path))["chapters"]
        return sorted(c["book"] * 1_000_000 + c["chapter"] * 1000 + v for c in inv for v in c["verses"])
    return sorted(int(l.strip().split(",")[0]) for l in open(path) if l.strip() and l.strip()[0].isdigit())


def main(plan_path, inv_path):
    plan = json.load(open(plan_path))
    ids = load_inventory(inv_path)
    idset = set(ids)
    errors = []
    days = plan["days"]
    if len(days) != 365:
        errors.append(f"expected 365 days, got {len(days)}")
    start = date.fromisoformat(plan["start_date"])
    for k, d in enumerate(days):
        if d["day"] != k + 1 or d["date"] != (start + timedelta(days=k)).isoformat():
            errors.append(f"day/date mismatch at index {k}")
        if not d["passages"]:
            errors.append(f"day {d['day']} empty")
    import bisect
    coverage = {}
    ot_seq, nt_seq = [], []
    for d in days:
        for p in d["passages"]:
            s, e = p["start_id"], p["end_id"]
            if s > e or s // 1_000_000 != e // 1_000_000:
                errors.append(f"invalid range {p['label']} on day {d['day']}")
                continue
            if s not in idset or e not in idset:
                errors.append(f"range endpoint not in inventory: {p['label']} day {d['day']}")
            lo, hi = bisect.bisect_left(ids, s), bisect.bisect_right(ids, e)
            for v in ids[lo:hi]:
                coverage[v] = coverage.get(v, 0) + 1
            b = s // 1_000_000
            (ot_seq if TESTAMENT[b] == "OT" else nt_seq).append((b, s, e))
    missing = [v for v in ids if v not in coverage]
    dups = [v for v, n in coverage.items() if n > 1]
    if missing:
        errors.append(f"{len(missing)} verses not assigned, first: {missing[:5]}")
    if dups:
        errors.append(f"{len(dups)} verses assigned more than once, first: {dups[:5]}")
    # OT strictly canonical, verse order monotonic.
    for (b1, _, e1), (b2, s2, _) in zip(ot_seq, ot_seq[1:]):
        if not s2 > e1:
            errors.append(f"OT order broken at {NAME[b2]}")
    # NT: each book contiguous in the NT stream, and internally ordered.
    seen, prev = set(), None
    for b, s, e in nt_seq:
        if b != prev:
            if b in seen:
                errors.append(f"NT book {NAME[b]} is split / resumed later")
            seen.add(b)
        prev = b
    for (b1, _, e1), (b2, s2, _) in zip(nt_seq, nt_seq[1:]):
        if b1 == b2 and not s2 > e1:
            errors.append(f"NT order broken inside {NAME[b1]}")
    books = {v // 1_000_000 for v in ids}
    planned = {b for b, _, _ in ot_seq + nt_seq}
    if books != planned:
        errors.append(f"books mismatch: missing {sorted(books - planned)} extra {sorted(planned - books)}")
    print(f"inventory verses: {len(ids)}; covered: {len(coverage)}; days: {len(days)}; "
          f"NT order: {', '.join(NAME[b] for b in dict.fromkeys(b for b, _, _ in nt_seq))}")
    if errors:
        print("FAIL"); [print(" -", e) for e in errors]; sys.exit(1)
    print("PASS")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
