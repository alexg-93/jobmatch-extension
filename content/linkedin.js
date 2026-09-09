// content/linkedin.js
// LinkedIn is a single-page app: clicking a job in a list updates the page
// without a full navigation. We monitor for job ID changes, wait for the
// job content to render, analyze once, and hold the result.

const TITLE_SELECTORS = [
  "h1.job-details-jobs-unified-top-card__job-title",
  ".job-details-jobs-unified-top-card__job-title",
  ".jobs-unified-top-card__job-title",
  ".job-details-jobs-unified-top-card__job-title-link",
  "h1.t-24",
  "h1"
];

const DESC_SELECTORS = [
  "#job-details",
  ".jobs-description__content",
  ".jobs-box__html-content",
  ".jobs-description-content__text",
  ".jobs-description",
  "article.jobs-description__container",
  ".description__text"
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

// Fallback used only if none of DESC_SELECTORS matched: grab the largest
// visible text block on the page, avoiding navigation, widget, and sidebars.
function heuristicDescription() {
  const scope = document.querySelector("main") || document.body;
  const blocks = Array.from(scope.querySelectorAll("section, article, div"))
    .filter((el) => {
      if (el.offsetParent === null || el.children.length >= 40) return false;
      if (el.closest("#jobmatch-widget-root")) return false;
      if (el.closest("nav, header, footer, aside, .global-nav")) return false;
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
  return best && bestLen > 200 ? best.innerText.trim() : null;
}

function extractJob() {
  const title = pickText(TITLE_SELECTORS, 2) || document.title.replace(/\s*\|\s*LinkedIn.*$/i, "").trim();
  const description = pickText(DESC_SELECTORS, 40) || heuristicDescription();
  return { title, description };
}

function jobKeyFromUrl() {
  const url = location.href;
  let m = url.match(/\/jobs\/view\/(?:[^\/?#]+-)?(\d+)/i);
  if (m) return "linkedin:" + m[1];
  m = url.match(/currentJobId=(\d+)/i);
  if (m) return "linkedin:" + m[1];
  return "linkedin:" + url.split("?")[0];
}

function isSpecificJobPage() {
  // Only analyze specific standalone job postings (e.g. https://www.linkedin.com/jobs/view/*)
  // Multi-job search panels (e.g. /jobs/search-results/*, /jobs/search/*, /jobs/collections/*)
  // show lists of multiple suggestions and should not be analyzed as a single job.
  return /^\/jobs\/view\//i.test(location.pathname);
}

let currentJobKey = null;
let analyzedJobKey = null;
let isAnalyzing = false;
let dismissedManualKey = null;
let scanMode = "auto";
let tickInterval = null;

try {
  chrome.storage?.local?.get("scanMode", (data) => {
    if (data?.scanMode) scanMode = data.scanMode;
  });
} catch (e) {
  // context invalidated
}

function analyze(job, key) {
  if (!chrome.runtime?.id) {
    if (tickInterval) clearInterval(tickInterval);
    window.JobMatchWidget?.renderError?.("Extension updated. Please refresh the page.");
    return;
  }

  isAnalyzing = true;
  window.JobMatchWidget.renderLoading(job.title);

  try {
    chrome.runtime.sendMessage(
      { type: "ANALYZE_JOB", payload: { url: key, title: job.title, description: job.description } },
      (result) => {
        isAnalyzing = false;
        if (!chrome.runtime?.id || chrome.runtime.lastError) {
          analyzedJobKey = key;
          window.JobMatchWidget?.renderError?.("Extension updated. Please refresh the page.");
          if (tickInterval) clearInterval(tickInterval);
          return;
        }
        // Stale response from an earlier job switch
        if (currentJobKey !== key) return;

        if (!result) {
          analyzedJobKey = key;
          window.JobMatchWidget.renderError("No response from extension — try reloading the page.");
          return;
        }
        if (result.error) {
          // Allow re-try if no resume uploaded yet
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

  // If switched to a new job, reset analysis state for the new job
  if (key !== currentJobKey) {
    currentJobKey = key;
    analyzedJobKey = null;
    dismissedManualKey = null;
  }

  const job = extractJob();
  if (!job.description || job.description.length < 100) return; // not loaded yet

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
      // User closed the manual button on this job: keep it hidden!
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

  // Already analyzed and outputted: stop immediately, do not loop
  if (analyzedJobKey === key) return;

  // Analysis is currently in progress: wait for it to complete
  if (isAnalyzing) return;

  analyze(job, key);
}

// When the user updates their resume or scan mode in the popup, update active tab
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

tickInterval = setInterval(tick, 1500);
tick();


