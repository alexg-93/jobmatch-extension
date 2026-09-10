# JobMatch — AI Resume Matcher

Upload your resume once. See your match %, key strengths, gaps, experience deficit, and missing skills on **LinkedIn, Drushim, AllJobs, Comeet, and Greenhouse** job listings as you browse.

Powered by **Google Gemini Cloud**, on-device **Chrome Gemini Nano**, or local offline LLMs (**LM Studio & Ollama**).

## Features

- **🤖 Flexible AI Engine Selection**:
  - **☁️ Google Gemini Cloud API**: Zero local hardware requirement. Powered by official Gemini models with native JSON formatting and model selection (`gemini-3.7-flash` default, `gemini-3.8-flash`, `gemini-3.5-flash-lite`, `gemini-2.5-flash`). Includes in-popup connection testing and direct link to Google AI Studio.
  - **🔒 Chrome Built-in AI (Gemini Nano)**: 100% private, on-device inference via Chrome's Prompt API. Zero-setup, free, runs entirely offline.
  - **🦙 Ollama (Local REST API)**: Direct connection to local LLMs (`http://localhost:11434`) such as `llama3.2`, `qwen2.5`, or `mistral` with automatic model discovery.
  - **💻 LM Studio & OpenAI-Compatible**: Connect to LM Studio (`http://localhost:1234/v1`), LocalAI, or vLLM with model auto-discovery (`/v1/models`) and datalist autocompletion.
- **🛡️ Multi-Tier Fallback Pipeline**:
  - **Tier 1 (Primary)**: Runs your chosen AI engine (LM Studio / Ollama / Gemini Cloud).
  - **Tier 2 (Fallback 1)**: If your local model or cloud provider times out or fails, JobMatch automatically falls back to **Chrome Built-in Gemini Nano** to preserve on-device AI matching.
  - **Tier 3 (Fallback 2)**: If Gemini Nano is also disabled or unavailable, JobMatch falls back gracefully to **Deterministic Keyword Match**.
  - **User Transparency**: Displays an informative banner in the widget if an engine fallback occurred (`fallbackNote`).
- **🧠 Full Reasoning Models Support (Phi-4, DeepSeek-R1)**:
  - **180-Second (3-minute) Timeout**: Gives local reasoning models plenty of time to deliberate on CPU/GPU without client disconnections.
  - **Thinking Parser**: Automatically parses `message.content` and falls back to `message.reasoning_content` if content is empty. Strips `<think>...</think>` tags before JSON decoding.
  - **Concise Directives**: Prompt instructs reasoning models to avoid unnecessary preamble and output structured JSON directly.
- **⚡ Hybrid Matching & Zero Hallucinations**:
  - Merges AI reasoning with a deterministic ground-truth dictionary.
  - Strict job-posting validation (`isSkillGroundedInJob`): any skill hallucinated by an AI that does not appear in the listing is automatically discarded.
  - Critical technical gaps (like `SQL`, `PostgreSQL`, `MongoDB`, `.NET`, `RabbitMQ`) are guaranteed never to be missed.
- **🌐 5 Major Job Platforms Supported**:
  - **LinkedIn**: Standalone job pages (`https://www.linkedin.com/jobs/view/*`). Automatically ignores multi-job search panels.
  - **Drushim (דרושים)**: Israeli tech job postings (`https://www.drushim.co.il/job/*`).
  - **AllJobs (אולג'ובס)**: Dedicated job pages (`https://www.alljobs.co.il/Search/UploadSingle.aspx?JobID=*` and `/jobs/*`). Scoped container isolation prevents SEO sidebar and similar-jobs bleed.
  - **Comeet**: Tech career portals and company job boards (`https://comeet.com/jobs/*` and `https://*.comeet.com/jobs/*`).
  - **Greenhouse**: Top-tier ATS company boards (`https://boards.greenhouse.io/*`, `https://job-boards.greenhouse.io/*`, and `https://*.greenhouse.io/*`).
- **📊 360-Degree Feedback & Experience Gap Analysis**:
  - 🟢 **Key Strengths**: Highlights where your skills and accomplishments match or exceed the job qualifications.
  - ⚠️ **Gaps & Weaknesses**: Clear deficit identification including **Experience Gap Analysis** (e.g. role asks for 5+ years vs 4 years detected, or notes an experience advantage when you exceed requirements).
  - 🔴 **Missing Technologies**: Explicit tag badges for required tools not detected in your resume, prioritized by technical domain.
  - 💡 **How to Bridge the Gaps**: Actionable coaching sentences advising how to position your experience to overcome deficits.
- **👥 Multiple Resume Profiles**:
  - Save and manage up to 3 distinct resume profiles (e.g. *Full Stack Developer*, *Frontend Specialist*, *Team Lead*) in the popup.
  - On-the-fly profile switcher dropdown directly inside the floating job widget to compare which resume scores higher on any listing.
  - Profile-scoped caching (`cache:v6:<profileId>:<url>`, indexed per profile) with zero-latency switching.
- **🔄 Auto & Manual Scanning Modes**:
  - **Auto Mode**: Automatically evaluates job postings in the background as you browse.
  - **Manual Mode**: Displays a floating draggable `✨ Scan Job` button (`⋮⋮` drag handle) with boundary clamping and dismiss button.
- **🔃 Manual Refresh**: A ⟳ button next to close on the results panel forces a fresh, non-cached re-analysis of the current job.
- **🏷️ Scanned Job Title in Header**: Displays the exact job title analyzed in the widget header and during loading.
- **🇮🇱 Hebrew & Unicode Support**: Built-in word boundary matching with unicode regex and support for attached Hebrew prepositions (`ב-`, `ה-`, `ו-`, `ל-`, `מ-`, `ש-`, `כ-`) common on Drushim and AllJobs (e.g. `ב-React`, `שנה ניסיון`, `שנתיים ניסיון`).
- **🔤 Skill Synonyms & Canonicalization**: Smart normalization for common variants (e.g. `React` ↔ `ReactJS`, `NodeJS` ↔ `Node.js`, `Golang` ↔ `Go`, `k8s` ↔ `Kubernetes`, `Postgres` ↔ `PostgreSQL`, `Rabbit MQ` ↔ `RabbitMQ`).

## AI Providers Comparison

| Provider | Type | Privacy | Hardware Requirements | Setup |
| :--- | :--- | :--- | :--- | :--- |
| **Google Gemini Cloud** | Cloud REST API | Google API Terms | None (runs in Google Cloud) | Paste Gemini API Key from Google AI Studio |
| **Chrome Built-in (Nano)** | Local On-Device | 100% Private Offline | Chrome 128+ with Prompt API enabled | Built-in to Chrome |
| **Ollama** | Local REST API | 100% Private Offline | Local GPU / CPU (Ollama running) | Set endpoint `http://localhost:11434` |
| **LM Studio / Custom** | Local OpenAI-Compat | 100% Private Offline | Local GPU / Apple Silicon (LM Studio) | Set endpoint `http://localhost:1234/v1` |
| **Keyword Matcher** | Deterministic Regex | 100% Private Offline | Zero (instant regex execution) | Always available fallback |

## Install (unpacked, for development)

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select this folder
4. Click the JobMatch icon in the toolbar:
   - Select your preferred AI engine (**Nano**, **Gemini**, **Ollama**, or **Custom**)
   - Manage resume profiles, upload PDF or paste text → **Save resume**
5. Browse a job on LinkedIn, Drushim, AllJobs, Comeet, or Greenhouse — a panel appears bottom-right with an instant profile switcher dropdown

## Architecture

```
manifest.json                     → MV3 extension manifest with site permissions & Gemini API access
content/
  widget.js, widget.css           → Floating results card, manual scan trigger, refresh button & profile switcher
  base-adapter.js                 → Shared driver for every site adapter: polling/MutationObserver scheduling,
                                     scan-mode handling, analyze() round-trip to the background worker
  linkedin.js                     → LinkedIn selectors, extraction & job-key parsing (single-job view routing)
  drushim.js                      → Drushim selectors, extraction & job-key parsing
  alljobs.js                      → AllJobs DOM adapter with container scoping & title cleaning
  comeet.js                       → Comeet career portal & company board adapter
  greenhouse.js                   → Greenhouse ATS board adapter
background.js                     → Service worker: AI routing hub (Gemini, Ollama, LM Studio, Nano),
                                     multi-tier fallback, resume storage & indexed profile-scoped cache
offscreen/
  offscreen.html, offscreen.js    → Isolated sandbox executing Chrome's window.ai LanguageModel API
shared/
  matcher.js                      → Hybrid grounding engine, skills dictionary, experience gap analyzer,
                                     tiered prompt builder, AI-output normalization, think-tag stripping & JSON parser
popup/
  popup.html, popup.js, popup.css → Extension settings UI: AI engine selector, model discovery,
                                     API key manager, resume profile tabs & scanning mode toggle
test/
  matcher.test.js                 → Unit tests for shared/matcher.js (node --test)
eslint.config.js, package.json    → Lint/test tooling (npm test / npm run lint)
```

## Development

No build step — this is vanilla JS loaded directly by Chrome. `npm install` only pulls in dev tooling (tests + lint), never shipped with the extension.

```bash
npm install       # dev tooling only (eslint; node's built-in test runner needs nothing extra)
npm test          # run the shared/matcher.js unit test suite
npm run lint      # ESLint across the whole project
npm run lint:fix  # ESLint with autofix
```

## Changelog

### v0.11.3
- **Test Suite & Tooling**: Added a 61-test unit suite for `shared/matcher.js` (`npm test`, Node's built-in test runner) covering keyword matching, grounding, experience-gap parsing, and prompt building, plus an ESLint flat config (`npm run lint`).
- **Content-Script Consolidation**: Extracted `content/base-adapter.js` as a shared driver for all 5 site adapters, removing ~460 lines of duplicated polling/scan-mode/analyze logic that used to be copy-pasted across `linkedin.js`, `drushim.js`, `alljobs.js`, `comeet.js`, and `greenhouse.js`.
- **Cache Indexing**: Replaced full-storage (`chrome.storage.local.get(null)`) scans on every profile save/delete with a per-profile `cacheIndex`, capped at 300 entries per profile. Also fixed a latent bug where that invalidation was silently a no-op due to a stale `cache:v3:` prefix check against the actual `cache:v5:` keys (cache bumped to `v6`).
- **MutationObserver Scheduling**: Replaced the unconditional 1.5s DOM poll with a debounced `MutationObserver` (plus a 4s safety-net interval), reacting to actual page changes instead of polling on a fixed timer.
- **AI-Output Validation**: Provider JSON responses now pass through `normalizeAiMatchResult` — clamping `matchPercent` to 0-100 and coercing list fields to arrays — before reaching the UI or grounding logic.
- **Prompt Hardening**: `buildMatchPrompt`/`buildSkillExtractionPrompt` now delimit the scraped job posting and resume text with explicit "treat as data, not instructions" framing to resist prompt injection from job postings, backed by a runtime `matchPercent` sanity check (`reconcileMatchPercent`) that pulls an implausible AI score back toward the deterministic keyword-match baseline.
- **Tiered Prompting**: Gemini Cloud now gets a richer prompt (scoring rubric, required-vs-nice-to-have weighting, a worked few-shot example) than local/on-device providers, which stay lean to avoid burning Chrome Nano's small context window or local models' response time.
- **Manual Refresh Button**: Added a ⟳ button next to close on the results panel to force a fresh, non-cached analysis of the current job/profile.
- **Keyword-Matching Fixes**: Versioned or concatenated tech names now match their bare form — `HTML5` → HTML, `CSS3` → CSS, `TailwindCSS` → Tailwind CSS — previously reported as missing even when present in the resume, due to the word-boundary regex requiring a non-letter/digit character immediately after a match.

### v0.11.2
- **Greenhouse Modern Job Boards Support**: Added full support for `https://job-boards.greenhouse.io/<company>/jobs/<id>` and all `*.greenhouse.io` subdomains (e.g. `job-boards.eu.greenhouse.io`).
- **Updated Host Permissions & Content Script Matches**: Configured `manifest.json` with `job-boards.greenhouse.io/*` and `*.greenhouse.io/*`.
- **Targeted DOM Selectors**: Added priority title selectors (`h1.section-header`, `.job__title h1`) and description selectors (`.job__description.body`, `.job__description`, `.job-post-container .job__description`).
- **Normalized URL & Cache Key Handling**: Consistent `greenhouse:<company>:<id>` cache keys across both legacy `boards.greenhouse.io` and modern `job-boards.greenhouse.io` domains.

### v0.11.1
- **Extended Local LLM Timeout (180s / 3 minutes)**: Raised timeout in `callOpenAiCompat` and `callOllama` from 45s to 180s, preventing client disconnections while local reasoning models (like `Phi-4-reasoning-plus`, `DeepSeek-R1`, `Qwen`) generate thinking tokens.
- **Reasoning Models Support**:
  - Response parser extracts JSON from `message.content` and seamlessly falls back to `message.reasoning_content` if content is empty.
  - Automatically strips `<think>...</think>` blocks prior to JSON decoding.
  - Passes `max_tokens: 4096` to local completions.
- **Multi-Tier Fallback Pipeline**:
  - **Tier 1**: Chosen primary provider (LM Studio / Ollama / Gemini).
  - **Tier 2 (Fallback 1)**: If primary provider fails or times out, immediately attempts on-device **Chrome Built-in Gemini Nano**.
  - **Tier 3 (Fallback 2)**: If Gemini Nano is unavailable or disabled, safely falls back to **Offline Keyword Match**.
- **Transparent Fallback Banners**: Displays an informative banner in the widget (`fallbackNote`) explaining why a fallback occurred.
- **LM Studio Model Auto-Discovery**: Custom provider panel now discovers and auto-completes models directly from `/v1/models` with a `🔄` refresh button.

### v0.11.0
- **Google Gemini Cloud AI Integration**: Added official Gemini REST API support (`generativelanguage.googleapis.com`) using user-provided API keys with zero local hardware constraints.
- **Model Selection**: Choose between `gemini-3.7-flash` (**Default**), `gemini-3.8-flash`, `gemini-3.5-flash-lite`, and `gemini-2.5-flash`.
- **In-Popup Connection Test**: Instant ping validation for Gemini API keys and models with direct link to Google AI Studio.
- **Enforced JSON Mode**: Requests sent with `responseMimeType: "application/json"` and `temperature: 0.1`.
- **Strict Anti-Hallucination Grounding**: All Gemini outputs pass through JobMatch's hybrid anti-hallucination engine.
- **Widget Engine Badge**: Displays `Gemini (<model>)` when Gemini Cloud is active.

### v0.10.0
- **Local AI Provider Support**: Direct connection to **Ollama** (`http://localhost:11434`) and OpenAI-compatible servers like **LM Studio** (`http://localhost:1234/v1`).
- **AllJobs DOM & Scoping Fixes**:
  - Scoped extraction to `#job-box-container<jobId>` to eliminate right-hand SEO sidebar and similar-jobs bleed.
  - Cleaned titles removing breadcrumbs and leading "דרושים" strings.
  - Added Hebrew experience parsing for "שנה ניסיון" (1 yr) and "שנתיים ניסיון" (2 yrs).
  - Added Vue ecosystem skills (`Vue 3`, `Vuex`, `Pinia`, `Vue Router`, `SCSS`).

### v0.9.0
- **Support for AllJobs, Comeet & Greenhouse**: Added DOM adapters, URL gating, and scoped description extractors for `alljobs.co.il`, `comeet.com/jobs`, and `boards.greenhouse.io`.

### v0.8.0
- **360-Degree Feedback & Experience Gap Analysis**: Added Key Strengths, Gaps & Weaknesses, and automated Experience Gap Analysis (e.g. comparing 5+ years required vs 4 years detected).

### v0.7.0
- **On-Device Gemini AI Reliability Engine**: Added smart prompt budgeting, full 3,500-character resume preservation, and intelligent job trimming.

### v0.6.0 (Major Release)
- **👥 Multiple Resume Profiles**:
  - Save and manage up to 3 distinct resume profiles (e.g. *Full Stack Developer*, *Frontend Specialist*, *Team Lead*) directly in the popup.
  - Quick profile tabs, inline profile renaming, active default star indicator, and deletion safety guards.
- **⚡ Floating Widget Profile Switcher**: Added an on-the-fly profile selector dropdown inside the floating job widget on LinkedIn and Drushim. Switch between CV profiles instantly to see which version scores higher for any specific job posting.
- **🔒 Profile-Scoped Caching**: Analysis results are cached per profile and URL (`cache:v3:<profileId>:<url>`), allowing instant switching between profiles on the same job with zero latency.
- **🔄 Seamless Backward Compatibility**: Automatically migrates existing single-resume storage into a "Primary Profile" on first run, while keeping legacy storage keys in sync for uninterrupted third-party script support.

### v0.5.0 (Major Release)
- **Anti-Hallucination Grounding Engine**: Added strict job-posting grounding validation (`isSkillGroundedInJob`) for AI-detected missing skills and suggestions. Missing skills returned by the on-device model that do not appear anywhere in the job posting are automatically identified as hallucinations and discarded.
- **Grounded AI Suggestions**: Added `filterGroundedSuggestions` to prevent the AI from recommending technologies (e.g., Go, Kubernetes, AWS) that the job post never asked for. If an AI suggestion references an ungrounded or hallucinated technology, it is filtered out in favor of grounded, actionable feedback.
- **Disambiguated Tech Keyword Matching**:
  - Protected the programming language **Go** against common English verbs ("go to", "go live", "let us go"). Only matches `golang` or Go in explicit programming context.
  - Protected single-letter tech terms (`C`, `R`) and tools (`Excel`) against standard English prose collisions ("strive to excel", "we excel").
  - Removed irrelevant natural language entries (`Russian`, `Hebrew`) from the default engineering dictionary to eliminate false positives from page footers and recruiter metadata.
- **Prompt Anti-Hallucination Guardrails**: Updated `buildMatchPrompt` with explicit negative constraints instructing Chrome's Gemini Nano model to only extract skills that are explicitly written in the job description.
- **Scraped Text Cleansing**: Added automated removal of LinkedIn UI artifacts ("Show more", "Show less", "Translate to...", "Report this job") during job description extraction.
- **Cache v3 Invalidation**: Bumped cache key to `cache:v3:` and added automatic cleanup on installation/update so stale cached results with hallucinations are immediately invalidated.

### v0.4.1
- **Fixed Extension Context Invalidation Handling**: Wrapped `chrome.runtime.sendMessage` and background checks in `content/drushim.js` and `content/linkedin.js` with `try...catch` and `!chrome.runtime?.id` guards. Automatically clears polling intervals and prevents uncaught errors when the extension is reloaded or updated in `chrome://extensions` while job tabs are open.

### v0.4.0 (Major Release)
- **Restricted LinkedIn Scanning to Standalone Job Postings**: Gated LinkedIn analysis strictly to individual job pages (`https://www.linkedin.com/jobs/view/*`). Multi-job search panels (`/jobs/search-results/*`, `/jobs/search/*`, `/jobs/collections/*`) are now automatically excluded to prevent scanning entire search result lists.
- **Scanned Job Title Displayed in Header**: Added the scanned job title directly below the "JobMatch" title in the results panel header (and during loading), giving clear visibility into which specific job was analyzed.
- **Scoped LinkedIn Scraping**: Hardened description scraping to exclude search result lists and secondary suggestion feeds.

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

