<div align="center">

<img src="icons/icon128.png" alt="JobMatch logo" width="72" height="72" />

# JobMatch

### AI-powered resume matcher for your browser

Upload your resume once. See your match score, strengths, gaps, and missing skills on every job listing you browse — powered by Gemini, on-device Chrome AI, or fully offline local models.

[![Release](https://img.shields.io/github/v/release/alexg-93/jobmatch-extension?style=flat-square&color=6366f1&label=release)](https://github.com/alexg-93/jobmatch-extension/releases)
[![Last Commit](https://img.shields.io/github/last-commit/alexg-93/jobmatch-extension?style=flat-square&color=8b5cf6)](https://github.com/alexg-93/jobmatch-extension/commits/main)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-a855f7?style=flat-square)](manifest.json)
[![Tests](https://img.shields.io/badge/tests-61%20passing-22c55e?style=flat-square)](test/matcher.test.js)
[![Vanilla JS](https://img.shields.io/badge/JavaScript-Vanilla-f59e0b?style=flat-square)](package.json)
[![Stars](https://img.shields.io/github/stars/alexg-93/jobmatch-extension?style=flat-square&color=eab308)](https://github.com/alexg-93/jobmatch-extension/stargazers)

[Features](#-features) •
[Supported Platforms](#-supported-platforms) •
[AI Providers](#-ai-providers) •
[Install](#-install-unpacked-for-development) •
[Architecture](#-architecture) •
[Changelog](#-changelog)

</div>

---

## Table of Contents

- [Overview](#overview)
- [Features](#-features)
- [Supported Platforms](#-supported-platforms)
- [AI Providers](#-ai-providers)
- [Install (unpacked, for development)](#-install-unpacked-for-development)
- [Usage](#-usage)
- [Development](#-development)
- [Architecture](#-architecture)
- [Changelog](#-changelog)

## Overview

JobMatch is a Chrome extension that reads the job posting you're currently looking at, compares it against your resume, and shows a floating panel with a match score, key strengths, gaps, and concrete suggestions for bridging them — all without leaving the page.

It runs on **Google Gemini Cloud**, Chrome's **on-device Gemini Nano**, or fully local/offline models via **Ollama** or **LM Studio** — your choice, switchable anytime from the popup. Every AI result is grounded against the job posting itself and cross-checked against a deterministic keyword-matching engine, so it never invents a requirement that isn't actually there.

## ✨ Features

<table>
<tr>
<td width="50%" valign="top">

### 🤖 Flexible AI Engine
- **☁️ Google Gemini Cloud** — bring your own API key, model selection, in-popup connection test
- **🔒 Chrome Built-in (Gemini Nano)** — 100% private, on-device, zero setup
- **🦙 Ollama** — local REST API with automatic model discovery
- **💻 LM Studio / OpenAI-compatible** — local or self-hosted, with model auto-discovery

### 🛡️ Multi-Tier Fallback
Primary provider fails or times out → falls back to Chrome's on-device Gemini Nano → falls back to a deterministic keyword matcher. Every fallback is shown transparently in the widget.

### ⚡ Hybrid Matching, Zero Hallucinations
AI output is grounded against the actual job posting text — any skill the model invents that isn't in the listing is automatically discarded. A deterministic keyword pass runs in parallel as a ground-truth baseline.

### 🧠 Reasoning Model Support
180-second timeout, `<think>` tag stripping, and prompt directives tuned for local reasoning models like DeepSeek-R1 and Phi-4.

</td>
<td width="50%" valign="top">

### 📊 360° Feedback
Key strengths, gaps & weaknesses, experience-gap analysis (e.g. "role asks for 5+ years, you have 4"), missing-skill tags, and actionable coaching suggestions.

### 👥 Multiple Resume Profiles
Up to 3 resume profiles (e.g. *Frontend*, *Full Stack*, *Team Lead*), with an instant switcher right inside the results widget to see which one scores higher on any listing.

### 🔄 Auto & Manual Scanning
Automatic background scanning, or a floating draggable **Scan Job** button for on-demand analysis.

### 🇮🇱 Hebrew & Unicode Aware
Word-boundary matching handles attached Hebrew prepositions (`ב-`, `ה-`, `ו-`...) common on Israeli job boards, alongside skill synonym canonicalization (`ReactJS` ↔ `React`, `k8s` ↔ `Kubernetes`, etc.).

</td>
</tr>
</table>

## 🌐 Supported Platforms

| Platform | Coverage |
| :--- | :--- |
| **LinkedIn** | Standalone job pages only — automatically skips multi-job search panels |
| **Drushim** (דרושים) | Israeli tech job postings |
| **AllJobs** (אולג'ובס) | Scoped extraction avoids SEO-sidebar and similar-jobs bleed |
| **Comeet** | Company career portals and job boards |
| **Greenhouse** | Legacy and modern (`job-boards.greenhouse.io`) ATS boards, including regional subdomains |

## 🧩 AI Providers

| Provider | Type | Privacy | Requirements |
| :--- | :--- | :--- | :--- |
| **Google Gemini Cloud** | Cloud REST API | Google API Terms | API key from Google AI Studio |
| **Chrome Built-in (Nano)** | On-device | 100% private, offline | Chrome 128+ with Prompt API enabled |
| **Ollama** | Local REST API | 100% private, offline | Ollama running locally |
| **LM Studio / Custom** | Local OpenAI-compatible | 100% private, offline | Any OpenAI-compatible local server |
| **Keyword Matcher** | Deterministic regex | 100% private, offline | None — always-available fallback |

## 📦 Install (unpacked, for development)

```bash
git clone https://github.com/alexg-93/jobmatch-extension.git
```

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select the cloned folder
4. Click the JobMatch icon in the toolbar

## 🚀 Usage

1. Open the JobMatch popup and pick an AI engine (**Nano** works out of the box, no setup)
2. Upload a resume (PDF or paste text) and save it as a profile
3. Browse a job on any [supported platform](#-supported-platforms) — a panel appears top-right with your match score, strengths, gaps, and suggestions
4. Multiple profiles? Switch between them right from the widget's dropdown to see which one scores higher

## 🛠 Development

No build step — this is vanilla JS loaded directly by Chrome. `npm install` only pulls in dev tooling (tests + lint), never shipped with the extension.

```bash
npm install       # dev tooling only
npm test          # run the shared/matcher.js unit test suite (61 tests)
npm run lint      # ESLint across the whole project
npm run lint:fix  # ESLint with autofix
```

## 🏗 Architecture

<details>
<summary>Click to expand the file layout</summary>

```
manifest.json                     MV3 extension manifest with site permissions & Gemini API access
content/
  widget.js, widget.css           Floating results card, manual scan trigger, refresh button & profile switcher
  base-adapter.js                 Shared driver for every site adapter: polling/MutationObserver scheduling,
                                   scan-mode handling, analyze() round-trip to the background worker
  linkedin.js                     LinkedIn selectors, extraction & job-key parsing
  drushim.js                      Drushim selectors, extraction & job-key parsing
  alljobs.js                      AllJobs DOM adapter with container scoping & title cleaning
  comeet.js                       Comeet career portal & company board adapter
  greenhouse.js                   Greenhouse ATS board adapter
background.js                     Service worker: AI routing hub (Gemini, Ollama, LM Studio, Nano),
                                   multi-tier fallback, resume storage & indexed profile-scoped cache
offscreen/
  offscreen.html, offscreen.js    Isolated sandbox executing Chrome's window.ai LanguageModel API
shared/
  matcher.js                      Hybrid grounding engine, skills dictionary, experience gap analyzer,
                                   tiered prompt builder, AI-output normalization, JSON parser
popup/
  popup.html, popup.js, popup.css Extension settings UI: AI engine selector, model discovery,
                                   API key manager, resume profile tabs & scanning mode toggle
test/
  matcher.test.js                 Unit tests for shared/matcher.js (node --test)
eslint.config.js, package.json    Lint/test tooling (npm test / npm run lint)
```

</details>

## 📝 Changelog

<details open>
<summary><strong>v0.12.0</strong> — Sleek Modern UI/UX Redesign</summary>

- Full visual redesign of both the results widget and config popup — vibrant violet gradient accent (`#6366f1` → `#8b5cf6` → `#a855f7`), brainstormed and approved via mockups before implementation.
- **Results widget**: gradient header band, circular conic-gradient score ring (still color-coded green/amber/red by match quality), icon-chip strength/gap bullets, restyled loading pill and error state, repositioned to the top-right corner.
- **Config popup**: reorganized from one long flat form into grouped gradient-accented cards, pill-style segmented toggles, widened from 320px to 400px.
- **Resume upload dropzone**: replaced the raw unstyled `<input type="file">` with a proper styled dropzone with real drag-and-drop support.
- Tightened spacing throughout to reduce scrolling; removed the manual "Total Years of Experience" override field (auto-detection from resume text still covers experience-gap analysis).

</details>

<details>
<summary><strong>v0.11.3</strong> — Test Suite, Architecture Cleanup & Prompt Hardening</summary>

- **Test Suite & Tooling**: Added a 61-test unit suite for `shared/matcher.js` (`npm test`), plus an ESLint flat config (`npm run lint`).
- **Content-Script Consolidation**: Extracted `content/base-adapter.js` as a shared driver for all 5 site adapters, removing ~460 lines of duplicated logic.
- **Cache Indexing**: Replaced full-storage scans on every profile save/delete with a per-profile `cacheIndex`. Also fixed a latent bug where cache invalidation was silently a no-op due to a stale key-prefix check (cache bumped to `v6`).
- **MutationObserver Scheduling**: Replaced the unconditional 1.5s DOM poll with a debounced `MutationObserver`.
- **AI-Output Validation & Prompt Hardening**: Provider responses are now clamped/type-validated before use; prompts delimit scraped job/resume text with explicit "treat as data, not instructions" framing, backed by a runtime sanity check on the AI's match score against the deterministic baseline.
- **Tiered Prompting**: Gemini Cloud gets a richer prompt (scoring rubric, worked example) than local/on-device providers.
- **Manual Refresh Button**: Force a fresh, non-cached analysis from the results panel.
- **Keyword-Matching Fixes**: `HTML5`, `CSS3`, `TailwindCSS` now correctly match their bare form (`HTML`, `CSS`, `Tailwind CSS`).

</details>

<details>
<summary><strong>v0.11.2</strong> and earlier</summary>

- **v0.11.2** — Greenhouse modern job boards support (`job-boards.greenhouse.io` and regional subdomains).
- **v0.11.1** — Extended local LLM timeout to 180s, reasoning-model support (`<think>` tag stripping), multi-tier fallback pipeline, LM Studio model auto-discovery.
- **v0.11.0** — Google Gemini Cloud integration with model selection and in-popup connection testing.
- **v0.10.0** — Ollama & LM Studio local AI support; AllJobs DOM scoping fixes.
- **v0.9.0** — Support for AllJobs, Comeet & Greenhouse.
- **v0.8.0** — Key strengths, gaps & weaknesses, and experience-gap analysis.
- **v0.7.0** — On-device Gemini AI reliability engine (prompt budgeting, smart trimming).
- **v0.6.0** — Multiple resume profiles, floating widget profile switcher, profile-scoped caching.
- **v0.5.0** — Anti-hallucination grounding engine; disambiguated keyword matching (Go, C, R, Excel vs. common English words).
- **v0.4.1** — Fixed extension context invalidation handling on reload/update.
- **v0.4.0** — Restricted LinkedIn scanning to standalone job postings; scanned job title shown in header.
- **v0.3.1** — Fixed Chrome Prompt API output-language warning.
- **v0.3.0** — Hybrid matching engine (AI + deterministic baseline merged); expanded technical dictionary; priority-based skill sorting.
- **v0.2.0** — Auto/manual scan toggle; draggable floating scan widget; fixed infinite scanning loop on LinkedIn; Hebrew prefix support; skill synonym canonicalization.

</details>

---

<div align="center">

Your resume stays on this device — nothing is uploaded anywhere except to the AI provider you explicitly choose and configure.

[⬆ Back to top](#jobmatch)

</div>
