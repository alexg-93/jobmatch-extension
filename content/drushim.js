// content/drushim.js
// Drushim job detail view loads via client-side routing.
// window.JobMatchAdapter (base-adapter.js) handles polling, scan-mode, and
// the analyze round-trip; this file only defines Drushim-specific
// extraction and job identity.

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

if (typeof window !== "undefined" && window.JobMatchAdapter) {
  window.JobMatchAdapter.start({
    extractJob,
    jobKeyFromUrl,
    isSpecificJobPage,
    minDescriptionLength: 200
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { jobKeyFromUrl, isSpecificJobPage, extractJob };
}
