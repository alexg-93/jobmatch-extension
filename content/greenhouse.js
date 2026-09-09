// content/greenhouse.js
// Greenhouse adapter for JobMatch.
// Supports Greenhouse job boards (boards.greenhouse.io/*).
// Monitors for route/job changes, extracts title and description, and drives the widget.

const TITLE_SELECTORS = [
  "h1.app-title",
  ".job__title h1",
  "h1.job-title",
  ".job-title",
  "h1",
  ".app-title"
];

const DESC_SELECTORS = [
  "#content",
  "#job-description",
  ".job__description",
  "#app-body",
  ".content",
  "[data-qa='job-description']",
  ".job-description"
];

function pickText(selectors, minLength = 20) {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.innerText && el.innerText.trim().length >= minLength) {
      return el.innerText.trim();
    }
  }
  return null;
}

function heuristicDescription() {
  const scope = document.querySelector("main") || document.querySelector("#app-body") || document.body;
  const blocks = Array.from(scope.querySelectorAll("section, article, div"))
    .filter((el) => {
      if (el.offsetParent === null || el.children.length >= 40) return false;
      if (el.closest("#jobmatch-widget-root")) return false;
      if (el.closest("nav, header, footer, aside, .application-form, form")) return false;
      return true;
    });
  let best = null;
  let bestLen = 0;
  for (const el of blocks) {
    const len = (el.innerText || "").length;
    if (len > bestLen) {
      bestLen = len;
      best = el;
    }
  }
  return best && bestLen > 150 ? best.innerText.trim() : null;
}

function extractJob() {
  const title = pickText(TITLE_SELECTORS, 2) || document.title.replace(/\|.*$/, "").replace(/at .*$/i, "").trim();
  const description = pickText(DESC_SELECTORS, 30) || heuristicDescription();
  return { title, description };
}

function jobKeyFromUrl(inputUrl) {
  const url = inputUrl || location.href;
  try {
    const urlObj = new URL(url, "https://boards.greenhouse.io");
    const mToken = urlObj.searchParams.get("token") || urlObj.searchParams.get("gh_jid");
    const forCompany = urlObj.searchParams.get("for");

    const mJobPath = urlObj.pathname.match(/\/jobs\/(\d+)/i);
    const mSegments = urlObj.pathname.split("/").filter(Boolean);

    let company = forCompany || "";
    let jobId = mToken || "";

    if (mJobPath) {
      jobId = mJobPath[1];
    }
    const jobIdx = mSegments.indexOf("jobs");
    if (jobIdx > 0 && !company) {
      company = mSegments[jobIdx - 1];
    }

    if (company && jobId) return `greenhouse:${company}:${jobId}`;
    if (jobId) return `greenhouse:${jobId}`;
    return "greenhouse:" + urlObj.pathname.toLowerCase();
  } catch (e) {
    return "greenhouse:" + url.split("?")[0];
  }
}

function isSpecificJobPage(inputUrl) {
  const url = inputUrl || location.href;
  if (/\/jobs\/\d+/i.test(url)) return true;
  if (/[?&#](?:token|gh_jid)=\d+/i.test(url)) return true;
  if (/job_app/i.test(url)) return true;
  return false;
}

let currentJobKey = null;
let analyzedJobKey = null;
let isAnalyzing = false;
let dismissedManualKey = null;
let scanMode = "auto";
let tickInterval = null;

if (typeof chrome !== "undefined") {
  try {
    chrome.storage?.local?.get("scanMode", (data) => {
      if (data?.scanMode) scanMode = data.scanMode;
    });
  } catch (e) {
    // context invalidated
  }
}

function analyze(job, key, profileId = null) {
  if (!chrome.runtime?.id) {
    if (tickInterval) clearInterval(tickInterval);
    window.JobMatchWidget?.renderError?.("Extension updated. Please refresh the page.");
    return;
  }

  isAnalyzing = true;
  window.JobMatchWidget.renderLoading(job.title);

  try {
    chrome.runtime.sendMessage(
      { type: "ANALYZE_JOB", payload: { url: key, title: job.title, description: job.description, profileId } },
      (result) => {
        isAnalyzing = false;
        if (!chrome.runtime?.id || chrome.runtime.lastError) {
          analyzedJobKey = key;
          window.JobMatchWidget?.renderError?.("Extension updated. Please refresh the page.");
          if (tickInterval) clearInterval(tickInterval);
          return;
        }
        if (currentJobKey !== key) return;

        if (!result) {
          analyzedJobKey = key;
          window.JobMatchWidget.renderError("No response from extension — try reloading the page.");
          return;
        }
        if (result.error) {
          if (result.engine !== "none") {
            analyzedJobKey = key;
          }
          window.JobMatchWidget.renderError(result.error);
          return;
        }

        analyzedJobKey = key;
        window.JobMatchWidget.renderResult(result, (newProfileId) => {
          analyze(job, key, newProfileId);
        });
      }
    );
  } catch (err) {
    isAnalyzing = false;
    if (tickInterval) clearInterval(tickInterval);
    window.JobMatchWidget?.renderError?.("Extension updated. Please refresh the page.");
  }
}

function tick() {
  if (!chrome.runtime?.id) {
    if (tickInterval) clearInterval(tickInterval);
    return;
  }

  if (!isSpecificJobPage()) {
    window.JobMatchWidget?.hide?.();
    window.JobMatchWidget?.hideManualButton?.();
    return;
  }

  const key = jobKeyFromUrl();

  if (key !== currentJobKey) {
    currentJobKey = key;
    analyzedJobKey = null;
    dismissedManualKey = null;
  }

  const job = extractJob();
  if (!job.description || job.description.length < 50) return;

  if (scanMode === "manual") {
    if (analyzedJobKey === key) {
      window.JobMatchWidget?.hideManualButton?.();
      return;
    }
    if (isAnalyzing) {
      window.JobMatchWidget?.hideManualButton?.();
      return;
    }
    if (dismissedManualKey === key) {
      return;
    }
    window.JobMatchWidget?.showManualButton?.(
      () => {
        window.JobMatchWidget?.hideManualButton?.();
        analyze(job, key);
      },
      () => {
        dismissedManualKey = key;
      }
    );
    return;
  }

  window.JobMatchWidget?.hideManualButton?.();
  if (analyzedJobKey === key) return;
  if (isAnalyzing) return;

  analyze(job, key);
}

if (typeof chrome !== "undefined") {
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area === "local") {
      if (changes.resume || changes.activeProfileId || changes.profiles) {
        analyzedJobKey = null;
        tick();
      }
      if (changes.scanMode) {
        scanMode = changes.scanMode.newValue || "auto";
        tick();
      }
    }
  });

  tickInterval = setInterval(tick, 1500);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { jobKeyFromUrl, isSpecificJobPage };
}
