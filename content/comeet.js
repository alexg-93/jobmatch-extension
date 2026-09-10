// content/comeet.js
// Comeet adapter for JobMatch.
// Supports Comeet ATS career portals (comeet.com/jobs/*).
// window.JobMatchAdapter (base-adapter.js) handles polling, scan-mode, and
// the analyze round-trip; this file only defines Comeet-specific extraction
// and job identity.

const TITLE_SELECTORS = [
  "h1.position-name",
  "h1.job-title",
  ".position-header h1",
  "[data-test='position-name']",
  ".position-name",
  "h1",
  ".job-title"
];

const DESC_SELECTORS = [
  ".position-details",
  ".job-details",
  ".position-description",
  "[data-test='position-description']",
  ".position-body",
  ".job-description",
  "#position-description"
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
  const scope = document.querySelector("main") || document.querySelector("#content") || document.body;
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
  const title = pickText(TITLE_SELECTORS, 2) || document.title.replace(/\|.*$/, "").replace(/at .*$/i, "").trim();
  const description = pickText(DESC_SELECTORS, 30) || heuristicDescription();
  return { title, description };
}

function jobKeyFromUrl(inputUrl) {
  const url = inputUrl || location.href;
  const urlObj = new URL(url, "https://www.comeet.com");
  const path = urlObj.pathname.replace(/\/$/, "");
  const segments = path.split("/").filter(Boolean);
  // Segments format: ['jobs', 'company', ...optional, 'positionId']
  const jobsIdx = segments.indexOf("jobs");
  if (jobsIdx >= 0 && segments.length >= jobsIdx + 3) {
    const company = segments[jobsIdx + 1];
    const lastSeg = segments[segments.length - 1];
    return `comeet:${company}:${lastSeg}`;
  }
  if (jobsIdx >= 0 && segments.length === jobsIdx + 2) {
    return `comeet:${segments[jobsIdx + 1]}`;
  }
  return "comeet:" + path.toLowerCase();
}

function isSpecificJobPage(inputUrl) {
  const url = inputUrl || location.href;
  try {
    const urlObj = new URL(url, "https://www.comeet.com");
    const segments = urlObj.pathname.split("/").filter(Boolean);
    const jobsIdx = segments.indexOf("jobs");
    // Specific job has company + at least 1 position segment (total >= 3: ['jobs', 'company', 'position'])
    return jobsIdx >= 0 && segments.length >= jobsIdx + 3;
  } catch (e) {
    return false;
  }
}

if (typeof window !== "undefined" && window.JobMatchAdapter) {
  window.JobMatchAdapter.start({
    extractJob,
    jobKeyFromUrl,
    isSpecificJobPage,
    minDescriptionLength: 50
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { jobKeyFromUrl, isSpecificJobPage, extractJob };
}
