// content/greenhouse.js
// Greenhouse adapter for JobMatch.
// Supports Greenhouse job boards (boards.greenhouse.io/*, job-boards.greenhouse.io/*, *.greenhouse.io/*).
// window.JobMatchAdapter (base-adapter.js) handles polling, scan-mode, and
// the analyze round-trip; this file only defines Greenhouse-specific
// extraction and job identity.

const TITLE_SELECTORS = [
  "h1.section-header",
  ".job__title h1",
  ".job__header h1",
  ".job__title",
  "h1.app-title",
  "h1.job-title",
  ".job-title",
  "[data-qa='job-title']",
  "h1",
  ".app-title"
];

const DESC_SELECTORS = [
  ".job__description.body",
  ".job__description",
  ".job-post-container .job__description",
  "#job-description",
  "[data-qa='job-description']",
  ".job-description",
  "#content",
  "#app-body",
  ".content"
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

    let company = (forCompany || "").toLowerCase();
    let jobId = mToken || "";

    if (mJobPath) {
      jobId = mJobPath[1];
    }
    const jobIdx = mSegments.indexOf("jobs");
    if (jobIdx > 0 && !company) {
      company = mSegments[jobIdx - 1].toLowerCase();
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
  if (/job_post/i.test(url)) return true;
  return false;
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
