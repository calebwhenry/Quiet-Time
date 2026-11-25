"""Canonical Protestant book list (id 1-66), shared by plan + import tools."""
BOOKS = [
 ("GEN","Genesis","OT"),("EXO","Exodus","OT"),("LEV","Leviticus","OT"),("NUM","Numbers","OT"),
 ("DEU","Deuteronomy","OT"),("JOS","Joshua","OT"),("JDG","Judges","OT"),("RUT","Ruth","OT"),
 ("1SA","1 Samuel","OT"),("2SA","2 Samuel","OT"),("1KI","1 Kings","OT"),("2KI","2 Kings","OT"),
 ("1CH","1 Chronicles","OT"),("2CH","2 Chronicles","OT"),("EZR","Ezra","OT"),("NEH","Nehemiah","OT"),
 ("EST","Esther","OT"),("JOB","Job","OT"),("PSA","Psalms","OT"),("PRO","Proverbs","OT"),
 ("ECC","Ecclesiastes","OT"),("SNG","Song of Songs","OT"),("ISA","Isaiah","OT"),("JER","Jeremiah","OT"),
 ("LAM","Lamentations","OT"),("EZK","Ezekiel","OT"),("DAN","Daniel","OT"),("HOS","Hosea","OT"),
 ("JOL","Joel","OT"),("AMO","Amos","OT"),("OBA","Obadiah","OT"),("JON","Jonah","OT"),
 ("MIC","Micah","OT"),("NAM","Nahum","OT"),("HAB","Habakkuk","OT"),("ZEP","Zephaniah","OT"),
 ("HAG","Haggai","OT"),("ZEC","Zechariah","OT"),("MAL","Malachi","OT"),
 ("MAT","Matthew","NT"),("MRK","Mark","NT"),("LUK","Luke","NT"),("JHN","John","NT"),
 ("ACT","Acts","NT"),("ROM","Romans","NT"),("1CO","1 Corinthians","NT"),("2CO","2 Corinthians","NT"),
 ("GAL","Galatians","NT"),("EPH","Ephesians","NT"),("PHP","Philippians","NT"),("COL","Colossians","NT"),
 ("1TH","1 Thessalonians","NT"),("2TH","2 Thessalonians","NT"),("1TI","1 Timothy","NT"),("2TI","2 Timothy","NT"),
 ("TIT","Titus","NT"),("PHM","Philemon","NT"),("HEB","Hebrews","NT"),("JAS","James","NT"),
 ("1PE","1 Peter","NT"),("2PE","2 Peter","NT"),("1JN","1 John","NT"),("2JN","2 John","NT"),
 ("3JN","3 John","NT"),("JUD","Jude","NT"),("REV","Revelation","NT"),
]
CODE_TO_ID = {c: i+1 for i, (c, _, _) in enumerate(BOOKS)}
NAME = {i+1: n for i, (_, n, _) in enumerate(BOOKS)}
CODE = {i+1: c for i, (c, _, _) in enumerate(BOOKS)}
TESTAMENT = {i+1: t for i, (_, _, t) in enumerate(BOOKS)}

def verse_id(book, chapter, verse):
    """Stable integer id BBCCCVVV (e.g. Gen 1:1 = 1001001)."""
    return book * 1_000_000 + chapter * 1_000 + verse

# Verses whose numbers are absent from the NIV (1984) text body (footnoted only).
NIV_OMITTED = [("MAT",17,21),("MAT",18,11),("MAT",23,14),("MRK",7,16),("MRK",9,44),("MRK",9,46),
  ("MRK",11,26),("MRK",15,28),("LUK",17,36),("LUK",23,17),("JHN",5,4),("ACT",8,37),("ACT",15,34),
  ("ACT",24,7),("ACT",28,29),("ROM",16,24)]
