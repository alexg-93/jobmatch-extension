// content/linkedin.js
// LinkedIn is a single-page app: clicking a job in a list updates the page
// without a full navigation. window.JobMatchAdapter (base-adapter.js) handles
// polling, scan-mode, and the analyze round-trip; this file only defines
// LinkedIn-specific extraction and job identity.

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

function cleanJobDescription(raw) {
  if (!raw) return "";
  return raw
    .replace(/\bShow (?:more|less)\b/gi, "")
    .replace(/\b(?:See|Rate this) translation\b/gi, "")
    .replace(/\bReport this job\b/gi, "")
    .trim();
}

function extractJob() {
  const title = pickText(TITLE_SELECTORS, 2) || document.title.replace(/\s*\|\s*LinkedIn.*$/i, "").trim();
  const rawDesc = pickText(DESC_SELECTORS, 40) || heuristicDescription();
  const description = cleanJobDescription(rawDesc);
  return { title, description };
}

function jobKeyFromUrl() {
  const url = location.href;
  let m = url.match(/\/jobs\/view\/(?:[^/?#]+-)?(\d+)/i);
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

if (typeof window !== "undefined" && window.JobMatchAdapter) {
  window.JobMatchAdapter.start({
    extractJob,
    jobKeyFromUrl,
    isSpecificJobPage,
    minDescriptionLength: 100
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { jobKeyFromUrl, isSpecificJobPage, extractJob };
}
