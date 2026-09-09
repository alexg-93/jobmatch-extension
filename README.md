# JobMatch

Upload your resume once. See a match % and missing skills on LinkedIn and
Drushim job listings as you browse.

## Features

- **🔒 100% Private On-Device AI**: Powered by Chrome's built-in Gemini Nano model (Prompt API / `LanguageModel`). Runs completely locally on your device — zero API keys, no network calls, and your resume never leaves your computer.
- **⚡ Reliable Offline Fallback Matcher**: Seamless fallback engine with a built-in technical dictionary. If the AI model isn't active or downloaded yet on your Chrome browser, keyword matching provides instant scores and missing skill feedback.
- **🌐 Native Support for LinkedIn & Drushim**:
  - **LinkedIn**: Works across `/jobs/view/*`, search collections, and single-page app (SPA) navigations without re-scanning loops.
  - **Drushim (דרושים)**: Optimized for Israeli tech jobs. Smartly targets individual job listings (`/job/*`) while ignoring search/catalog index pages.
- **🔄 Auto & Manual Scanning Modes**:
  - **Auto Mode**: Automatically evaluates job postings in the background as you browse.
  - **Manual Mode**: Only analyzes when you want it to. Displays a discreet floating `✨ Scan Job` button on job pages.
- **🖱️ Draggable Floating Trigger**: In manual mode, drag the `✨ Scan Job` button anywhere on your screen using the `⋮⋮` handle, or dismiss it with `×`. Positions clamp smoothly within viewport boundaries.
- **🎯 Match Percentage & Missing Skills Badges**: Clean floating results card showing your overall match score, color-coded status, active engine badge (`on-device AI` or `keyword match`), and tag badges for required technologies missing from your resume.
- **💡 Actionable Resume Suggestions**: Provides bulleted, targeted recommendations on which experiences, frameworks, or tools to highlight to pass ATS screening.
- **🇮🇱 Hebrew & Unicode Support**: Built-in word boundary support for Hebrew characters and attached prefixes (`ב-`, `ה-`, `ו-`, `ל-`, `מ-`, `ש-`, `כ-`) common on Drushim (e.g. `ב-React`, `בניהול פרויקטים`).
- **🔤 Skill Synonyms & Canonicalization**: Smart normalization for common variations (e.g. `React` ↔ `ReactJS`, `NodeJS` ↔ `Node.js`, `Golang` ↔ `Go`, `k8s` ↔ `Kubernetes`, `Postgres` ↔ `PostgreSQL`).
- **📄 Easy Resume Upload & Local Cache**:
  - Upload PDF directly (parsed on-device via bundled `pdf.js`) or paste plain text.
  - Add custom skills to track in the popup.
  - Interactive save button with loading spinner and double-click prevention.
  - Smart per-job caching in `chrome.storage.local` with automatic invalidation when you update your resume.


## Install (unpacked, for development)

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select this folder
4. Click the JobMatch icon in the toolbar → upload/paste your resume → **Save resume**
5. Browse a job on `linkedin.com/jobs/...` or `drushim.co.il` — a panel appears bottom-right

## How matching works

Two engines, automatic fallback, no configuration needed:

1. **On-device AI (preferred)** — Chrome's built-in Gemini Nano model
   (the "Prompt API" / `LanguageModel`), run inside a hidden offscreen
   page. Free, no API key, nothing leaves the machine. This is a newer
   Chrome capability that's still rolling out — the popup shows whether
   it's active on your install.
2. **Offline keyword matcher (fallback)** — always available, no
   dependency on the AI API. Uses a built-in skills dictionary
   (`shared/matcher.js`) plus whatever you add in the popup's "Extra
   skills to track" field.

If on-device AI isn't available (or the model output isn't parseable),
the extension silently falls back to the keyword matcher — you'll always
get a result, just a less nuanced one.

## Architecture

```
content/linkedin.js, drushim.js   → scrape job title + description, poll for
                                     SPA navigation changes, render the widget
content/widget.js, widget.css     → the floating results panel
background.js                     → message hub, resume storage, per-job
                                     result cache, AI/fallback decision
offscreen/offscreen.js            → the only place that touches the
                                     on-device LanguageModel API
shared/matcher.js                 → skills dictionary, keyword fallback,
                                     AI prompt templates, JSON parsing
popup/                            → resume upload (PDF via pdf.js, or paste)
```

Job results are cached per job ID in `chrome.storage.local` so revisiting
a listing doesn't re-run the analysis. Saving a new resume clears the
cache so everything gets re-scored.

## Known limitations (read before relying on this)

- **DOCX isn't supported.** Only PDF and plain text. Export your resume
  to PDF or paste the text in.
- **Drushim selectors are best-effort guesses**, not verified against a
  live page — I built this without being able to inspect an authenticated
  Drushim job page's real DOM. The extension falls back to a heuristic
  ("grab the largest text block on the page") when the named selectors
  don't match, which works reasonably but isn't precise. **To fix
  properly:** open a real job listing, DevTools → Elements, find the
  actual container for the job title and full description, and update
  `TITLE_SELECTORS` / `DESC_SELECTORS` in `content/drushim.js`.
- **LinkedIn selectors will drift over time** — LinkedIn changes its
  class names periodically. The same fix applies: inspect, update
  `content/linkedin.js`.
- **On-device AI availability varies by machine** (Chrome version,
  hardware, whether the model has been downloaded yet) — this is why the
  keyword fallback exists at all, not an edge case to ignore.
- The keyword matcher's accuracy depends on its skill dictionary. Add
  field-specific terms via the popup's "Extra skills to track" box.

## Extending later

- **AllJobs support**: copy `content/drushim.js` as a template, add a
  `content_scripts` entry in `manifest.json` for the AllJobs domain, and
  set real selectors once you've inspected the DOM.
- **Swap in a cloud LLM** instead of/alongside on-device AI: add the API
  call in `background.js`'s `analyzeJob()`, gated behind an API key
  stored via the popup — the message-passing structure doesn't need to
  change, only where `analyzeJob` sources its `result` from.
- **Element picker in the popup** ("click the job description on the
  page to teach the extension where it is") would make the scrapers far
  more robust to site redesigns than hardcoded selectors — worth doing
  before this goes beyond personal use.

## Changelog

### v0.3.1
- **Fixed Chrome Prompt API LanguageModel Warning**: Added explicit `expectedInputs` and `expectedOutputs` configuration specifying `languages: ["en"]` to `LanguageModel.availability()` and `LanguageModel.create()`, resolving Chrome's *"No output language was specified in a LanguageModel API request"* error in `chrome://extensions`.

### v0.3.0 (Major Release)

#### Missing Keywords & Hybrid Engine Improvements
- **Hybrid Matching Engine**: Replaced the previous binary "either AI or Keyword" architecture with a hybrid approach. Even when Chrome's on-device Gemini Nano model runs, deterministic keyword extraction runs in parallel as a ground-truth baseline, merging AI's qualitative findings with deterministic missing skills so critical gaps (like `SQL`, `PostgreSQL`, `MongoDB`) are never missed.
- **AI Prompt Seeding**: Automatically extracts and feeds detected job technologies directly into the on-device AI prompt, prompting Gemini Nano to audit all key technical domains (Databases, Languages, Cloud, Queues).
- **Expanded Technical Dictionary**: Added comprehensive coverage for databases (`SQL`, `SQL Server`, `T-SQL`, `NoSQL`, `PostgreSQL`, `MongoDB`, `Redis`, `Elasticsearch`, `SQLite`, `Oracle`, `DynamoDB`), messaging queues (`RabbitMQ`, `Kafka`, `SQS`, `SNS`), frameworks (`.NET`, `.NET Core`, `ASP.NET`, `Entity Framework`, `LINQ`), dev tools (`Storybook`, `GitHub Copilot`, `Cursor AI`), and architecture (`Microservices`, `REST API`, `OOP`, `SOLID`).
- **Standardized Display Names**: Added clean acronym and capitalization mapping (e.g. `SQL`, `PostgreSQL`, `MongoDB`, `RabbitMQ`, `C#`, `.NET`, `REST API`).
- **Priority-Based Skill Sorting**: Missing skills are sorted by technical domain hierarchy so critical requirements (Databases, Languages, Frameworks) appear first.
- **Fixed Boundary Overlap for 'C'**: Fixed a regex boundary issue where the letter `'C'` would falsely match inside `'C#'` or `'C++'`.
- **Cache v2 Invalidation**: Updated cache keying to `cache:v2:` so legacy cached results without SQL are automatically invalidated.

### v0.2.0

#### New Features
- **Auto vs. Manual Scan Toggle**: Added a scanning mode switcher in the extension popup. Choose **Auto** for automatic background analysis upon opening a job listing, or **Manual** to analyze on demand.
- **Draggable Floating Scan Widget**: When in Manual mode, a floating `✨ Scan Job` button appears on job listings in the top-right corner. Features smooth dragging (`⋮⋮` handle) to reposition anywhere across the viewport with boundary clamping, and a dismiss (`×`) button.
- **Save Button Loading Spinner & Double-Click Guard**: Added an animated spinner inside the popup's "Save resume" button, disabled inputs and buttons during processing, and prevented duplicate submission requests while extracting skills.

#### Bug Fixes & Stability
- **Fixed Infinite Scanning Loop on LinkedIn**: Eliminated the loop where live applicant counters and relative timestamps changed text length between polling ticks, causing results to be wiped and re-scanned repeatedly. Replaced fragile length checking with discrete job completion state tracking (`analyzedJobKey`).
- **Restricted Drushim to Single-Job Listings**: Enforced strict `/job/*` pathname gating. Multi-job search listings (`https://www.drushim.co.il/jobs/search/*`) and catalog routes are no longer erroneously scanned.
- **Fixed Job Title Extraction**: Removed a hardcoded `> 40` character requirement in `pickText()` that caused almost all real job titles (e.g. "Software Engineer") to fail and fall back to `document.title`. Added a `minLength = 2` threshold for titles.
- **Fixed Saved Resume Disappearing in Popup**: Populated `$("resumeText").value` on popup open so saved resumes remain visible, allowing users to review or edit custom skills without having to re-paste their resume text.
- **Fixed Chrome Prompt API / Gemini Nano Detection**: Updated `offscreen.js` to recognize `ai.languageModel` / `window.ai.languageModel` (in addition to `LanguageModel`) and supported Chrome's `"readily"` and `"after-download"` status responses.
- **Added Skill Synonym Mapping & Canonicalization**: Normalized common skill variants so resume and job posts match seamlessly (e.g. `React` ↔ `ReactJS`, `NodeJS` ↔ `Node.js`, `Golang` ↔ `Go`, `k8s` ↔ `Kubernetes`, `Postgres` ↔ `PostgreSQL`).
- **Added Hebrew Prefix Support**: Enhanced word boundary matching with unicode regex (`[\p{L}\p{N}]`) and support for attached Hebrew prepositions (e.g. `ב-React`, `בניהול פרויקטים`) to prevent false negatives and false positives on Israeli job listings.
- **Fixed Manual Button Dismiss Flickering**: Fixed an issue where clicking "×" on the floating manual scan button caused it to immediately re-appear on the next 1.5s polling tick. Added job-scoped dismissal tracking (`dismissedManualKey`).
- **Widget State Restoration**: Fixed dismissed widgets remaining hidden permanently on subsequent job navigations by resetting `display = "block"` across all render states.

