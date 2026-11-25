# Quiet Time

A private, cross-device app for transcribing the NIV 1984 Bible in a year (Nov 25, 2026 – Nov 24, 2027),
with live accuracy checking, passage-linked notes and a sermon workspace.

- **App:** https://calebwhenry.github.io/Quiet-Time/ (static, GitHub Pages)
- **Data:** Supabase project `Quiet Time` (`mlnahaiheauylfbgqpky`), owner-only RLS, signups limited to an allowlist.
- **No Scripture text or personal writing is ever committed here.** The NIV text lives only in Supabase and in each device's IndexedDB cache.

## How it works
| Part | Where |
| --- | --- |
| Reading plan generator / validator | `tools/generate_plan.py`, `tools/validate_plan.py` → `plan/plan.json`, `plan/plan.csv`, `plan/PLAN.md` |
| Live comparison (typing policy) | `src/compare.ts` (+ `compare.test.ts`) |
| Local-first saving & sync | `src/store.ts` (IndexedDB queue → `save_transcriptions` / `save_doc` RPCs with revision checks) |
| Workspace (Scripture / Transcribe / Notes) | `src/workspace.ts` |
| Schema + RLS | `supabase/migrations/0001_init.sql`, seed in `supabase/seed/` |
| NIV import | `tools/import_bible.py` |

### Comparison policy
Words and punctuation are compared token by token; case and punctuation matter. Spacing and line breaks are not graded
(beyond separating words). Equivalences: curly quotes = straight quotes, `--` = em dash, `-` = en dash, `...` = ellipsis.
Verse numbers and headings are display-only and not typed. Paste, drag-drop and browser autocorrect replacements are blocked in
the transcription area (iPad's on-screen QuickType bar can't be fully disabled from a web page: turn off
Settings → General → Keyboard → Auto-Correction / Predictive if it interferes).

### Keyboard
Enter → next verse · Shift-Enter → line break · Backspace at start → previous verse · Option-E → first error ·
Option-N → new note · Option-T / Esc → back to typing.

## Develop
```sh
npm install
cp .env.example .env.local   # or rely on .env.production
npm run dev      # http://localhost:5173
npm test
python3 -I tools/validate_plan.py plan/plan.json plan/inventory.json
```

## Importing the NIV 1984 text (run on your own computer)
1. Put the authorized file outside the repo (e.g. `~/bible-data/niv1984.xml`). Supported: CSV/TSV, JSON, Zefania XML, OSIS XML.
2. Dry run (prints counts, gaps, duplicates, edition markers and a checksum, never verse text):
   `python3 -I tools/import_bible.py ~/bible-data/niv1984.xml --translation "NIV 1984" --show 45012001 50004013`
   Compare the two `--show` verses (Rom 12:1, Phil 4:13) with your printed Bible.
3. Upload with the service-role key in your shell only (Dashboard → Project Settings → API keys):
   ```sh
   export SUPABASE_URL=https://mlnahaiheauylfbgqpky.supabase.co
   export SUPABASE_SERVICE_ROLE_KEY=...   # never commit, never paste into the app
   python3 -I tools/import_bible.py ~/bible-data/niv1984.xml --translation "NIV 1984" --edition "..." --provenance "..." --commit
   ```
4. Re-validate the plan against the real inventory: export `select id from bible_verses order by id` to CSV and run
   `python3 -I tools/validate_plan.py plan/plan.json ids.csv`.

Anything you typed before the import is kept and re-checked automatically the next time each day is opened.

## Backups
Backup page → **Full backup (JSON)** and **Readable copy (Markdown)**. Restore adds missing items and never overwrites.
The Supabase free tier pauses projects after ~1 week of inactivity and has no downloadable backups, so export regularly.
