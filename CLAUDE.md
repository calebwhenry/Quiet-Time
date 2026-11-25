# Project brief — Scripture Transcription & Study

## 1. Purpose and guiding principles

Build a private, cross-device Bible transcription and study application. The immediate goal is to personally type the entire NIV 1984 Bible in one year, starting November 25, 2026, and finishing November 24, 2027 (365 days inclusive).

The motivation is spiritual, not competitive: slow down, focus on every word, meditate on Scripture, and deepen understanding. Deuteronomy 17:18–20, in which the king is commanded to copy and continually read the law, is the inspiration. The owner has already read the Bible four times canonically and twice chronologically. This project should provide a new way to see connections between the Testaments.

Design for meditation, accuracy, continuity and long-term usefulness. Do not turn the experience into a typing-speed game. The application should eventually serve as a personal Bible study, research and sermon preparation workspace, beyond this initial year.

## 2. Reading plan — confirmed requirements

- Translation: **NIV 1984**, not NIV 2011 or another translation.
- Coverage: all 66 books of the Protestant Bible, every verse assigned exactly once over 365 days.
- Old Testament: progress through all 39 books in canonical order.
- New Testament: arrange all 27 books in a noncanonical order that creates meaningful thematic, historical, prophetic or theological connections to the Old Testament passages being transcribed.
- Preserve whole-book continuity: once a book is started, continue it in order until finished. Do not scatter chapters of Romans, Hebrews, Revelation, etc. across unrelated parts of the year. A book may span many days and may be read alongside a book from the other Testament.
- Aim for a manageable daily workload, roughly three to four chapters on average (1,189 chapters / 365 days = 3.26). The user explicitly does **not** require an equal daily word count. Prefer coherent passage boundaries and meaningful connections over numerical uniformity.
- Roughly 2,100 words per day is a planning estimate, not a quota. Some days will naturally be longer or shorter.
- Possible pairings for exploration: Genesis / John or Romans; Exodus or Leviticus / Hebrews; Numbers / 1 Corinthians; Deuteronomy / Matthew; Isaiah / Luke; Daniel or Zechariah / Revelation. These are suggestions, not a fixed mapping. Assign each NT book only once and do not force a weak connection merely to create a pairing.
- Produce a machine-readable plan (JSON or CSV) and a human-readable overview. Explain why each NT book is placed where it is. Validate the complete plan programmatically against the actual source verse inventory: no omissions, duplicates, invalid ranges, broken book continuity or unintended OT reordering.
- Plan generation can be done independently of the application implementation. Build the application to import a plan rather than hard-code a schedule. Consider a catch-up or rescheduling feature later; preserve the original plan and actual completion history.

## 3. Architecture

Preferred architecture: GitHub Pages for free static frontend hosting, Supabase for authentication, PostgreSQL data storage and cross-device synchronization. The owner has prior experience with Supabase. No Java desktop app or paid application server is needed.

Suggested implementation (not a rigid framework requirement): TypeScript, Vite, and a lightweight UI framework if useful; Supabase JS client; IndexedDB for local drafts and a durable sync queue. Keep dependencies modest. Configure the correct GitHub Pages base path and routing (hash routing or another static-host-compatible approach). Deploy with GitHub Actions if appropriate.

The owner wants to begin on a MacBook and continue seamlessly on an iPad or another device. The website must work well in desktop and iPad Safari, including physical and on-screen keyboards. Offline editing after the necessary passage data is cached is desirable.

### Security and privacy

- Private single-user workspace initially. Implement authentication and restrict access to the owner's account. Disable open signups or use an explicit allowlist.
- Enable RLS on all private tables. User-owned rows must be scoped to auth.uid(); source Bible and plan access must also be restricted to the authorized user. Verify policies for SELECT, INSERT, UPDATE and DELETE as applicable.
- Only the Supabase public/publishable (or legacy anon) key may be included in the browser. Never expose a service role key, database password or other privileged credential in frontend code, GitHub commits or build artifacts.
- Do not commit the NIV 1984 text, personal transcriptions, notes, local dumps or secrets to a public repository. GitHub Pages itself is not a private data store. Fetch authorized content from Supabase after login.
- Provide a sample environment file containing placeholders only; ignore actual secret files and source data.
- Free tiers are preferred. Check current limits, inactivity policies and backup availability before relying on them. Do not assume free-tier cloud storage is a permanent backup.

## 4. Core transcription workspace

Create a clean, visually refined, distraction-free interface with three side-by-side panels on large screens:

| Panel | Suggested width | Function |
| --- | --- | --- |
| Left: Scripture | 30% | Read-only NIV 1984 reference text; current verse highlighted; automatically scroll to match the typing position. |
| Center: Transcription | 40% | The user's actual typed Bible; real-time accuracy validation; clear current position. |
| Right: Notes | 30% | Editable reflections, observations, questions and cross-references linked to the current passage. |

The percentages are initial defaults, not fixed requirements. Panels should be resizable and collapsible. On smaller screens, use a usable two-panel or tabbed layout rather than squeezing three unreadable columns. Preserve panel preferences and drafts. Consider light/dark themes, comfortable typography and keyboard shortcuts to switch between writing and notes.

### Typing behavior

- Borrow live accuracy feedback from typing-test websites. Compare the typed text with the source as the user types. Mark mismatches clearly (e.g. red text with an accessible secondary cue) and guide the user to the first unresolved error. The user should correct errors rather than unknowingly carry them forward.
- Never automatically insert, correct or complete Scripture. Disable autocorrect, spellcheck, autocomplete, predictive suggestions and automatic capitalization where the browser permits. Do not claim OS-level keyboard features can always be disabled. Consider disallowing paste into the transcription area, but keep paste available in notes.
- Handle insertions, deletions and replacements without making every following character appear incorrect. Preserve normal caret movement, selection, undo/redo, backspace, IME/composition and editing of earlier text. Avoid resetting the cursor or losing text during rerenders.
- Define a consistent comparison policy for typography and whitespace (straight/curly quotes, line endings, poetry, paragraph breaks, hyphens and nonbreaking spaces). Do not silently accept changed words or punctuation. Keep original source text intact. Make any equivalence rules explicit and test them.
- Verse numbers and editorial headings should be display metadata rather than required typing by default; confirm this convention with the owner. Preserve meaningful verse and poetry formatting where available.
- Automatically scroll the reference text smoothly as the caret progresses, not every time the user pauses or manually inspects a previous verse. Allow manual reference browsing and a return-to-current-position control.
- Permit whole-chapter context; avoid making the experience a sequence of isolated typing-test cards. A verse-aware editor can still store and validate individual verses.
- Save incomplete verses and exact resume position. Upon return on another device, open the current passage and restore progress.
- Mark a verse complete only after successful validation, not merely after typing its expected number of characters. Recompute progress if an earlier completed verse is edited.
- Show understated progress for today's assignment and the entire project; book/chapter completion is useful. No leaderboards, competitive streak pressure or prominent WPM. An optional private active-time metric may pause when journaling or idle, but is not essential to the MVP.

## 5. Personal study, notes and sermons

Notes should grow into an interconnected personal Bible commentary, not just a daily scratchpad.

- Notes can be linked to one or multiple Scripture references, including ranges in different books. Default the new note's reference to the current verse or selection, and let the user change it.
- Support user-defined topical tags (e.g. faith, surrender, covenant, discipleship), title/body text, timestamps and editing.
- Search notes by full text, topic/tag, Scripture reference, or book. Example: search for all reflections on faith across the entire Bible, or pull up a note on Genesis 1 while typing John 1.
- Show relevant previous notes when a passage or related topic is opened. Start with explicit reference/tag relationships; advanced AI or semantic search is optional, not required.
- Provide a separate homepage/dashboard with resume action, current assignment, progress, note search and access to study tools.
- Add a separate sermon-writing workspace with saved drafts, titles, Scripture links and reusable references to existing notes. Sermon drafts should not be conflated with notes tied to an active verse.
- Later, consider a reference Bible reader/search page independent of the transcription plan, and the ability to navigate the network of linked passages and notes.
- Keep note and sermon content private, editable and exportable. Do not require AI usage to search or organize basic notes.

## 6. Suggested Supabase data model

This is a proposed normalized starting point, not a mandate to create every table on day one. Use migrations, foreign keys, unique constraints and indexes. Stable verse IDs or a unique book/chapter/verse tuple are essential.

- `bible_books`: canonical book ID, name, testament, display order.
- `bible_verses`: verse ID, book ID, chapter, verse number, exact source text, optional formatting metadata. Unique(book_id, chapter, verse_number); immutable to normal app users. Track translation/source version and checksum in metadata.
- `reading_plans`: ID, owner ID, title, start/end dates, version.
- `plan_assignments`: plan ID, day number, passage order, start/end verse IDs (inclusive); a day can contain multiple passages. Date can be derived from start date and day number.
- `transcriptions`: owner ID, verse ID, actual typed text, completion status, revision/version, updated timestamp, completed timestamp. Unique(owner_id, verse_id) for the initial single project; include project ID if multiple transcription runs are supported.
- `user_progress`: owner/project ID, active plan day, active passage and verse, caret/resume metadata, preferences. Derive aggregate completion from transcriptions rather than storing contradictory totals.
- `notes`: ID, owner ID, title, body, created/updated timestamps.
- `note_references`: note ID, start/end verse IDs; support several references per note.
- `tags` and `note_tags`: owner-specific topics and many-to-many associations.
- `sermons`: ID, owner ID, title, body, created/updated timestamps; optional reference and note join tables when implemented.

RLS must also protect join tables through ownership of their parent rows. Index common lookups, references, tags and full-text note search. Avoid loading the full Bible into memory or downloading it on every page load; query only the required ranges.

### Saving, syncing and backup

Data durability is a top priority because this project represents hundreds of hours of work.

1. Persist actual typed text, notes and pending edits locally promptly (IndexedDB is preferred over relying only on localStorage).
2. Debounce cloud writes (e.g. a few seconds), flush when navigating when feasible, and retry failed writes. Do not depend on unload events to save the only copy.
3. Use stable record IDs and idempotent upserts or revision-aware updates. Distinguish local saving, cloud synced, offline and error states visibly.
4. On a second device, load the latest confirmed cloud state. Detect stale revisions or concurrent edits; do not silently overwrite a newer draft. Preserve both versions or offer a clear conflict resolution path.
5. Reconnect and retry pending edits after temporary network loss. Local cache is not a substitute for a confirmed cloud save or external backup.
6. Provide exports of the user's transcriptions in canonical Bible order, plus notes and sermons. Prefer plain text/Markdown and JSON for portable backups; DOCX export can follow. Include a restore/import workflow and test round trips. Restrict exports of the copyrighted source to the owner's permission scope.

## 7. NIV 1984 import — minimize Claude tokens

The owner reports having explicit permission to reproduce the NIV 1984 for this application and owns physical copies. Respect the scope of that permission; do not assume it allows public redistribution. No verified digital source file has yet been obtained.

Preferred route: request an authorized machine-readable copy from the permission grantor or publisher. Potential leads mentioned during brainstorming (not independently verified in that discussion): Bible Portal's NIV 1984 edition, an Olive Tree digital edition listing, and the GitHub repository `sajeevavahini/bibles` which was reported to list an NIV 1984 XML file. Treat these only as leads; independently verify availability, exact edition, provenance and permitted use before importing. Do not assume a publicly accessible file is authorized or accurate. Avoid scraping thousands of pages if a structured source is available.

### Critical token-efficiency instructions for Claude

- **Do not read, paste, summarize, transcribe or regenerate the full Bible in the model context.** Do not put the full text in CLAUDE.md, prompts or normal source files. Do not print the full source to the terminal.
- The Bible is only several megabytes as plain text but a very large AI token workload. Ordinary code should perform all bulk processing; AI should only write/debug that code.
- Obtain the file directly on disk (XML, JSON, USFM/USX, CSV or SQLite are suitable). Keep it in a gitignored data directory outside public build assets. Exclude it from routine agent searches and context ingestion. Inspect only structure, metadata and a few small sample records needed for parser development.
- Write a small Python or Node import utility that parses the actual source format, maps book names to canonical IDs, preserves Unicode and verse text, and outputs structured CSV or inserts via an authenticated administrative import process. No LLM calls per verse or chapter.
- Validate in dry-run mode before writing. Report counts by book/chapter, missing or duplicate references, empty verses, invalid ranges, unexpected verse suffixes and source version information. Account for translation-specific versification and intentionally omitted verses; do not fabricate missing text or force an expected total.
- Verify the edition against the owner's physical NIV 1984 using representative passages that differ from 2011 (e.g. Romans 12:1, Philippians 4:13, and additional discriminating passages). A handful of spot checks is not definitive proof of full accuracy; prefer reliable provenance and a known checksum where available.
- Import the validated CSV using the Supabase dashboard, PostgreSQL COPY, or a batched privileged script executed locally. Keep privileged credentials out of the frontend and repository. Use transactions/staging and safe reruns; avoid destroying existing user data.
- Store a source checksum, translation edition, provenance, import date and validation summary. Run plan validation against the resulting verse inventory. Log only compact diagnostics, not full verse text.
- If no authorized structured file can be obtained tonight, build and test with synthetic sample text or a properly licensed test corpus. The owner can begin the first day's transcription from a physical NIV 1984 in a private local document and import that work later. Never silently substitute NIV 2011 for the production source.

## 8. Development roadmap

### Phase 1 — usable first morning (November 25, 2026)

- Establish repository, frontend scaffold, deployment and Supabase configuration/migrations.
- Resolve source file availability and import path; do not let the full import block UI development.
- Import the 365-day plan if ready, or support loading the first assignment independently.
- Build the core three-panel workspace with responsive layout, synchronized Scripture scrolling, live typing validation, passage-linked notes, and a simple resume/progress view.
- Implement private authentication, local draft saving and verified cloud synchronization. Test on desktop and iPad before trusting real work to it.
- Ensure a basic backup/export exists before beginning long-term use.

### Phase 2 — study application

- Homepage/dashboard, full note search, topical tags, multiple references, related-note browsing, sermon editor, improved responsive UI and keyboard shortcuts.
- Robust conflict resolution, offline caching, backup/restore, plan adjustment and polished progress views.

### Phase 3 — optional enhancements

- Personal cross-reference network, richer study navigation, verse/reference linking in sermon drafts, additional export formats and deeper analytics if genuinely helpful. Avoid adding paid AI dependencies unless the owner explicitly wants them.

## 9. Acceptance checks

- Confirm the correct NIV 1984 source and permissions before production ingestion.
- The plan covers every source verse exactly once, all 365 dates, OT canonical order and continuous reading of each NT book.
- Typing a wrong character, inserting/deleting a word, editing earlier text and correcting a mistake behave predictably; no automatic completion occurs.
- Source scrolling follows the active typing position without fighting manual browsing.
- Notes stay associated with the selected passage even when focus or active verse changes; later search retrieves notes by tag, text and reference.
- Refreshing or closing/reopening restores incomplete text. Offline edits survive reload and sync after reconnect. Switching devices restores confirmed progress. Concurrent edits do not silently disappear.
- Unauthenticated or unauthorized accounts cannot retrieve private rows or source text. No privileged credentials or Bible files appear in public assets.
- Export and restore work with sample data. Test mobile/iPad layout and keyboard behavior.
- Development logs and AI context remain small; no bulk source text is sent to an AI model.

## 10. Instructions for starting work

Treat this file as the project brief. The user intends to use Claude to construct the reading plan and application. First inspect any existing repository and current Supabase setup; do not assume either exists. Identify the smallest working architecture, then scaffold or adapt it and implement the MVP. Prefer concrete, tested code over lengthy brainstorming. Use ordinary scripts for bulk data handling and validation. Do not ask the user to manually copy thousands of verses.

Ask only for genuinely blocking decisions or credentials/configuration that cannot safely be inferred. Never ask the user to paste privileged keys into committed files. Do not create paid resources, publish copyrighted material or expose private data. Provide concise setup instructions, migration/import commands, tests and deployment steps. State what was actually implemented versus what remains. The design and schema suggestions above are defaults; the user's confirmed spiritual goal, translation, reading-plan constraints, three-panel workflow, live correction, cross-device storage and long-term note/sermon vision take precedence.
