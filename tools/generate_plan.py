"""Generate the Quiet Time 365-day transcription plan.

OT books run in canonical order all year. NT books are read whole and in order,
each attached to the OT segment it illuminates. Days are allocated to segments in
proportion to their combined word counts, then chapters are split into days with a
small dynamic program that keeps the combined daily load near the average.

Usage: python3 -I tools/generate_plan.py plan/inventory.json plan/
"""
import csv, json, os, sys
from datetime import date, timedelta
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from books import CODE_TO_ID, NAME, CODE, verse_id

START = date(2026, 11, 25)
DAYS = 365

# (OT book codes, NT book codes in reading order, rationale)
SEGMENTS = [
 (["GEN"], ["JHN", "GAL"],
  "John opens with 'In the beginning' and presents Jesus as the Word through whom all things were made, the Lamb God provides, "
  "Jacob's ladder (Jn 1:51) and the one who existed before Abraham (Jn 8:58). Galatians follows as the patriarchal narratives "
  "unfold: the promise to Abraham and his Seed (Gal 3), justification by faith (Gen 15:6), and Hagar and Sarah (Gal 4)."),
 (["EXO"], ["MRK"],
  "Mark is a gospel of the new exodus: it opens by quoting Exod 23:20 with Isaiah 40, and moves through wilderness, sea crossings, "
  "bread in the wilderness, a transfiguration on a mountain, and Passover with 'my blood of the covenant' (Mk 14:24; Exod 24:8)."),
 (["LEV"], ["HEB"],
  "Hebrews is the New Testament's commentary on Leviticus: priesthood, sacrifices, the tabernacle, and the Day of Atonement "
  "(Lev 16; Heb 9-10) fulfilled in Christ the great high priest."),
 (["NUM"], ["1CO", "2PE", "JUD"],
  "1 Corinthians 10 reads the wilderness events of Numbers (manna, the rock, grumbling, serpents, plague) as warnings 'written down "
  "for us'. 2 Peter and Jude then arrive as Numbers reaches Korah and Balaam (Num 16; 22-24; 2 Pet 2:15-16; Jude 11)."),
 (["DEU"], ["MAT"],
  "Jesus answers each temptation from Deuteronomy (Deut 6-8; Mt 4). Matthew presents him as the prophet like Moses (Deut 18:15) "
  "who teaches on the mountain and gathers his teaching into five great discourses."),
 (["JOS"], ["EPH"],
  "Joshua's conquest and inheritance of the land pairs with Ephesians' inheritance in Christ (Eph 1:11-18) and the spiritual "
  "warfare of the armor of God (Eph 6)."),
 (["JDG", "RUT", "1SA", "2SA"], ["LUK"],
  "Luke's birth narratives deliberately echo 1 Samuel: Mary's song echoes Hannah's (1 Sam 2; Lk 1:46-55) and Jesus 'grew in favor "
  "with God and men' like Samuel (1 Sam 2:26; Lk 2:52). Bethlehem (Ruth) and the throne of David (2 Sam 7; Lk 1:32-33) run through it."),
 (["1KI", "2KI"], ["ACT"],
  "Acts mirrors the Elijah-Elisha cycle: the master is taken up into heaven and his Spirit rests on his successors (2 Kgs 2; Acts 1-2), "
  "who then raise the dead and heal as he did. Kings tells of a kingdom divided and exiled; Acts of the kingdom going out to the nations."),
 (["1CH", "2CH"], ["1TI", "TIT", "2TI"],
  "Chronicles orders worship, priests and Levites in God's house; the Pastoral Epistles order elders, deacons and worship in 'God's "
  "household' (1 Tim 3:15). 2 Timothy, Paul's farewell, arrives as Chronicles ends in exile with hope of return."),
 (["EZR", "NEH", "EST"], ["1PE", "PHM"],
  "1 Peter addresses 'God's elect, strangers in the world' being built into a spiritual house (1 Pet 1:1; 2:5) while Ezra and Nehemiah "
  "rebuild the temple and walls among returned exiles. Philemon's intercession for Onesimus accompanies Esther's intercession for her people."),
 (["JOB"], ["JAS"],
  "James explicitly points to 'Job's perseverance' (Jas 5:11) and addresses trials, testing and the wisdom that comes from God."),
 (["PSA"], ["PHP"],
  "Philippians is Paul's letter of rejoicing, written in chains, and carries a hymn of Christ's humiliation and exaltation (Phil 2) "
  "that reads naturally beside the lament and praise of the Psalms."),
 (["PRO", "ECC"], ["COL"],
  "Colossians presents Christ as the wisdom of God: 'all the treasures of wisdom and knowledge' (Col 2:3; Prov 2:4) and the one in whom "
  "all things were created (Col 1:15-17; Prov 8:22-31), against empty human philosophy."),
 (["SNG"], ["1JN", "2JN", "3JN"],
  "John's letters on love ('God is love', 1 Jn 4) accompany the Song's celebration of love; 2 John is addressed to 'the chosen lady'."),
 (["ISA"], ["1TH", "2TH", "ROM"],
  "Thessalonians draws its Day-of-the-Lord language from early Isaiah (2 Thess 1:9 / Isa 2:10-21; 2 Thess 2:8 / Isa 11:4). Romans "
  "follows for Isaiah's later chapters: it quotes Isaiah more than any other book (the remnant, 'how beautiful are the feet', the Servant, "
  "the Gentiles' hope; Rom 9-11, 15)."),
 (["JER", "LAM"], ["2CO"],
  "2 Corinthians is Paul's defense of the new covenant written on hearts (2 Cor 3; Jer 31:31-34); he quotes 'let him who boasts boast "
  "in the Lord' (2 Cor 10:17; Jer 9:24) and, like Jeremiah, ministers through suffering and rejection."),
 (["EZK", "DAN", "HOS", "JOL", "AMO", "OBA", "JON", "MIC", "NAM", "HAB", "ZEP", "HAG", "ZEC", "MAL"], ["REV"],
  "Revelation draws on Ezekiel (throne vision, eating the scroll, Gog and Magog, the measured temple and river of life), Daniel (the beasts "
  "and the Son of Man) and Zechariah (horsemen, lampstands and olive trees, the one who was pierced). It closes the year with new creation "
  "as the OT closes with Malachi."),
]


def main(inv_path, out_dir):
    inv = json.load(open(inv_path))["chapters"]
    by_book = {}
    for ch in inv:
        by_book.setdefault(ch["book"], []).append(ch)

    seg_chapters = []
    for ot, nt, _ in SEGMENTS:
        otc = [c for b in ot for c in by_book[CODE_TO_ID[b]]]
        ntc = [c for b in nt for c in by_book[CODE_TO_ID[b]]]
        seg_chapters.append((otc, ntc))

    # Allocate days to segments proportional to words (largest remainder).
    seg_words = [sum(c["words"] for c in o + n) for o, n in seg_chapters]
    total = sum(seg_words)
    raw = [w * DAYS / total for w in seg_words]
    alloc = [int(r) for r in raw]
    for i in sorted(range(len(raw)), key=lambda i: raw[i] - alloc[i], reverse=True)[: DAYS - sum(alloc)]:
        alloc[i] += 1
    avg = total / DAYS

    days = []
    for (otc, ntc), D in zip(seg_chapters, alloc):
        assert len(otc) >= D, "each day needs at least one OT chapter"
        # NT chapters spread by word midpoint across the segment's days.
        nt_days = [[] for _ in range(D)]
        ntw = sum(c["words"] for c in ntc) or 1
        cum = 0
        for c in ntc:
            mid = cum + c["words"] / 2
            nt_days[min(D - 1, int(mid / ntw * D))].append(c)
            cum += c["words"]
        nt_load = [sum(c["words"] for c in d) for d in nt_days]
        # DP: split OT chapters into D contiguous non-empty groups minimizing
        # sum((ot_words + nt_words - avg)^2).
        n = len(otc)
        pre = [0]
        for c in otc:
            pre.append(pre[-1] + c["words"])
        INF = float("inf")
        f = [[INF] * (n + 1) for _ in range(D + 1)]
        back = [[0] * (n + 1) for _ in range(D + 1)]
        f[0][0] = 0
        for d in range(1, D + 1):
            for i in range(d, n - (D - d) + 1):
                best, arg = INF, 0
                for j in range(d - 1, i):
                    if f[d - 1][j] == INF:
                        continue
                    v = f[d - 1][j] + (pre[i] - pre[j] + nt_load[d - 1] - avg) ** 2
                    if v < best:
                        best, arg = v, j
                f[d][i], back[d][i] = best, arg
        cuts, i = [], n
        for d in range(D, 0, -1):
            j = back[d][i]
            cuts.append((j, i))
            i = j
        cuts.reverse()
        for d, (j, i) in enumerate(cuts):
            days.append((otc[j:i], nt_days[d]))

    assert len(days) == DAYS

    def passages(chs):
        """Merge consecutive chapters of the same book into one passage."""
        out = []
        for c in chs:
            if out and out[-1]["book"] == c["book"] and out[-1]["end_chapter"] == c["chapter"] - 1:
                out[-1]["end_chapter"] = c["chapter"]
                out[-1]["end_verse"] = c["verses"][-1]
            else:
                out.append({"book": c["book"], "start_chapter": c["chapter"], "start_verse": c["verses"][0],
                            "end_chapter": c["chapter"], "end_verse": c["verses"][-1]})
        for p in out:
            p["book_code"] = CODE[p["book"]]
            p["start_id"] = verse_id(p["book"], p["start_chapter"], p["start_verse"])
            p["end_id"] = verse_id(p["book"], p["end_chapter"], p["end_verse"])
            sc, ec = p["start_chapter"], p["end_chapter"]
            p["label"] = f"{NAME[p['book']]} {sc}" + (f"-{ec}" if ec != sc else "")
        return out

    plan_days = []
    for k, (otc, ntc) in enumerate(days, start=1):
        ps = passages(otc) + passages(ntc)
        for o, p in enumerate(ps, start=1):
            p["order"] = o
        plan_days.append({"day": k, "date": (START + timedelta(days=k - 1)).isoformat(),
                          "chapters": len(otc) + len(ntc),
                          "est_words": sum(c["words"] for c in otc + ntc), "passages": ps})

    plan = {"id": "quiet-time-niv84-2026", "title": "Quiet Time: NIV 1984 in a Year", "version": 1,
            "start_date": START.isoformat(), "end_date": (START + timedelta(days=DAYS - 1)).isoformat(),
            "word_estimate_basis": "KJV word counts (NIV runs ~8% shorter)",
            "segments": [{"ot": [CODE_TO_ID[b] for b in ot], "nt": [CODE_TO_ID[b] for b in nt], "rationale": r,
                          "days": a} for (ot, nt, r), a in zip(SEGMENTS, alloc)],
            "days": plan_days}
    os.makedirs(out_dir, exist_ok=True)
    json.dump(plan, open(os.path.join(out_dir, "plan.json"), "w"), indent=1)

    with open(os.path.join(out_dir, "plan.csv"), "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["day", "date", "order", "book", "start_chapter", "start_verse", "end_chapter", "end_verse",
                    "start_id", "end_id", "label"])
        for d in plan_days:
            for p in d["passages"]:
                w.writerow([d["day"], d["date"], p["order"], p["book_code"], p["start_chapter"], p["start_verse"],
                            p["end_chapter"], p["end_verse"], p["start_id"], p["end_id"], p["label"]])

    # Human-readable overview.
    lines = ["# Quiet Time reading plan: NIV 1984 in a year", "",
             f"{START:%B %-d, %Y} to {START + timedelta(days=DAYS-1):%B %-d, %Y}: 365 days, 1,189 chapters "
             f"(about 3.3 a day). The Old Testament runs in canonical order all year; each New Testament book is read whole, "
             "alongside the Old Testament section it illuminates.", "",
             "Daily loads are estimated from KJV word counts; the NIV runs a little shorter. Splits fall on chapter boundaries.", "",
             "## Why each New Testament book is placed where it is", ""]
    day_cursor = 1
    for (ot, nt, r), a in zip(SEGMENTS, alloc):
        rng = f"Days {day_cursor}-{day_cursor + a - 1}"
        dates = f"{START + timedelta(days=day_cursor-1):%b %-d} to {START + timedelta(days=day_cursor+a-2):%b %-d}"
        ot_s = NAME[CODE_TO_ID[ot[0]]] + ("" if len(ot) == 1 else f" to {NAME[CODE_TO_ID[ot[-1]]]}")
        lines += [f"### {ot_s} with {', '.join(NAME[CODE_TO_ID[b]] for b in nt)}", f"*{rng} ({dates})*", "", r, ""]
        day_cursor += a
    words = [d["est_words"] for d in plan_days]
    chs = [d["chapters"] for d in plan_days]
    lines += ["## Workload", "",
              f"- Chapters per day: min {min(chs)}, max {max(chs)}, mean {sum(chs)/len(chs):.2f}",
              f"- Estimated words per day (KJV basis): min {min(words):,}, max {max(words):,}, mean {sum(words)//len(words):,}", "",
              "## Day by day", "", "| Day | Date | Passages | Est. words |", "| --- | --- | --- | --- |"]
    for d in plan_days:
        lines.append(f"| {d['day']} | {d['date']} | {'; '.join(p['label'] for p in d['passages'])} | {d['est_words']:,} |")
    open(os.path.join(out_dir, "PLAN.md"), "w").write("\n".join(lines) + "\n")
    print("segments/days:", alloc)
    print(f"chapters/day {min(chs)}-{max(chs)}; words/day {min(words)}-{max(words)} mean {sum(words)//len(words)}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
