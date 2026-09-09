// content/drushim.js
// Drushim job detail view loads via client-side routing.
// We monitor for job ID changes, wait for the job content to render,
// analyze once, and hold the result.

const TITLE_SELECTORS = [
  ".job-name",
  ".jobName",
  ".positionName",
  ".job-title",
  "h1"
];

const DESC_SELECTORS = [
  ".job-description",
  ".jobDescription",
  "#jobDescription",
  ".main-job-description",
  ".job-full-description",
  ".description"
];

function pickText(selectors, minLength = 40) {
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.innerText && el.innerText.trim().length >= minLength) {
      return el.innerText.trim();
    }
  }
  return null;
}

// Primary safety net: grab the largest visible text block on the page,
// scoped to the main content area to reduce nav/footer noise.
function heuristicDescription() {
  const scope = document.querySelector("main") || document.body;
  const blocks = Array.from(scope.querySelectorAll("section, article, div"))
    .filter((el) => {
      if (el.offsetParent === null || el.children.length >= 40) return false;
      if (el.closest("#jobmatch-widget-root")) return false;
      if (el.closest("nav, header, footer, aside")) return false;
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
  return best && bestLen > 250 ? best.innerText.trim() : null;
}

function extractJob() {
  const title = pickText(TITLE_SELECTORS, 2) || document.title.trim();
  const description = pickText(DESC_SELECTORS, 40) || heuristicDescription();
  return { title, description };
}

function jobKeyFromUrl() {
  const url = location.href;
  // Look for specific job ID path or parameter patterns first
  let m = url.match(/\/job(?:s\/item)?\/(\d+)/i);
  if (m) return "drushim:" + m[1];
  m = url.match(/[?&#](?:jobId|job_id|id)=(\d+)/i);
  if (m) return "drushim:" + m[1];
  m = url.match(/\/(\d{6,})\/?(?:[?#]|$)/);
  if (m) return "drushim:" + m[1];
  return "drushim:" + url.split("?")[0];
}

function isSpecificJobPage() {
  // Drushim specific job pages have pathname starting with /job/ (e.g. /job/38066560/66ad8a73/)
  // Multi-job search/listing pages have /jobs/search/ or /jobs/...
  return /^\/job\//i.test(location.pathname);
}

let currentJobKey = null;
let analyzedJobKey = null;
let isAnalyzing = false;
let dismissedManualKey = null;
let scanMode = "auto";

chrome.storage?.local?.get("scanMode", (data) => {
  if (data?.scanMode) scanMode = data.scanMode;
});

function analyze(job, key) {
  isAnalyzing = true;
  window.JobMatchWidget.renderLoading();
  chrome.runtime.sendMessage(
    { type: "ANALYZE_JOB", payload: { url: key, title: job.title, description: job.description } },
    (result) => {
      isAnalyzing = false;
      if (chrome.runtime.lastError) {
        analyzedJobKey = key;
        window.JobMatchWidget.renderError("Extension disconnected. Please reload the page.");
        return;
      }
      if (currentJobKey !== key) return; // stale response

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
      window.JobMatchWidget.renderResult(result);
    }
  );
}

function tick() {
  // Never scan search/listing/catalog pages (e.g. /jobs/search/*)
  if (!isSpecificJobPage()) {
    window.JobMatchWidget?.hide?.();
    window.JobMatchWidget?.hideManualButton?.();
    return;
  }

  const job = extractJob();
  if (!job.description || job.description.length < 200) {
    return;
  }

  const key = jobKeyFromUrl();

  if (key !== currentJobKey) {
    currentJobKey = key;
    analyzedJobKey = null;
    dismissedManualKey = null;
  }

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
    // Display floating manual scan button on top-right
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

  // In auto mode, ensure manual trigger is hidden and proceed with automatic analysis
  window.JobMatchWidget?.hideManualButton?.();

  // Already analyzed and outputted: do not repeat
  if (analyzedJobKey === key) return;

  // Analysis is currently in progress: wait
  if (isAnalyzing) return;

  analyze(job, key);
}

chrome.storage?.onChanged?.addListener((changes, area) => {
  if (area === "local") {
    if (changes.resume) {
      analyzedJobKey = null;
      tick();
    }
    if (changes.scanMode) {
      scanMode = changes.scanMode.newValue || "auto";
      tick();
    }
  }
});

setInterval(tick, 1500);
tick();

