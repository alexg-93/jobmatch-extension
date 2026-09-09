// content/alljobs.js
// AllJobs adapter for JobMatch.
// Supports single job view (e.g. /Search/UploadSingle.aspx?JobID=XXXXX and /jobs/XXXXX).
// Monitors for route/job changes, extracts title and description, and drives the widget.

const TITLE_SELECTORS = [
  "#lblJobTitle",
  ".job-title",
  ".job_title",
  ".open-job-title",
  "h1.title",
  "h1",
  ".position-title"
];

const DESC_SELECTORS = [
  "#lblJobDescription",
  ".job-description",
  ".job_description",
  ".open-job-description",
  ".job-info",
  ".job-content",
  ".job-body"
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
  const scope = document.querySelector("main") || document.querySelector("#form1") || document.body;
  const blocks = Array.from(scope.querySelectorAll("section, article, div"))
    .filter((el) => {
      if (el.offsetParent === null || el.children.length >= 40) return false;
      if (el.closest("#jobmatch-widget-root")) return false;
      if (el.closest("nav, header, footer, aside, .header, .footer")) return false;
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
  const title = pickText(TITLE_SELECTORS, 2) || document.title.replace(/\|.*$/, "").trim();
  const description = pickText(DESC_SELECTORS, 30) || heuristicDescription();
  return { title, description };
}

function jobKeyFromUrl(inputUrl) {
  const url = inputUrl || location.href;
  const mJobId = url.match(/[?&#]JobID=(\d+)/i) || url.match(/[?&#](?:job_id|jobid)=(\d+)/i);
  if (mJobId) return "alljobs:" + mJobId[1];
  const mPath = url.match(/\/jobs\/(\d+)/i);
  if (mPath) return "alljobs:" + mPath[1];
  return "alljobs:" + url.split("?")[0].toLowerCase();
}

function isSpecificJobPage(inputUrl) {
  const url = inputUrl || location.href;
  if (/[?&#]JobID=\d+/i.test(url)) return true;
  if (/[?&#](?:job_id|jobid)=\d+/i.test(url)) return true;
  if (/\/jobs\/\d+/i.test(url)) return true;
  if (/UploadSingle\.aspx/i.test(url)) return true;
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
