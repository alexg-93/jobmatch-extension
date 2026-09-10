// content/alljobs.js
// AllJobs adapter for JobMatch.
// Supports single job view (e.g. /Search/UploadSingle.aspx?JobID=XXXXX and /jobs/XXXXX).
// window.JobMatchAdapter (base-adapter.js) handles polling, scan-mode, and
// the analyze round-trip; this file only defines AllJobs-specific
// extraction (with container scoping to avoid SEO sidebar bleed) and job identity.

const TITLE_SELECTORS = [
  ".job-content-top-title h2",
  ".job-content-top-title h1",
  ".job-content-top-title a.N",
  ".job-content-top-title a",
  ".job-content-top-title",
  "#lblJobTitle",
  ".open-job-title",
  ".job-title",
  ".job_title",
  "h1.title",
  ".position-title"
];

const DESC_SELECTORS = [
  ".job-content-top-desc.AR",
  "[id^='job-content-top-acord']",
  ".job-content-top-desc",
  "[id^='job-body-content']",
  "#lblJobDescription",
  ".open-job-description",
  ".job-description",
  ".job_description",
  ".job-info",
  ".job-content",
  ".job-body"
];

function cleanTitle(raw) {
  if (!raw) return "";
  return raw
    .replace(/^דרושים\s+/i, "")
    .replace(/\s*\|.*$/, "")
    .replace(/\s*-\s*AllJobs.*$/i, "")
    .replace(/\s*באשדוד.*$/i, "")
    .replace(/\s*בתל אביב.*$/i, "")
    .replace(/\s*במרכז.*$/i, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getJobScope() {
  const url = (typeof location !== "undefined" && location.href) ? location.href : "";
  const m = url.match(/[?&#]JobID=(\d+)/i) || url.match(/[?&#](?:job_id|jobid)=(\d+)/i);
  if (m && typeof document !== "undefined") {
    const jobId = m[1];
    const specific = document.getElementById("job-box-container" + jobId) ||
                     document.getElementById("job-box" + jobId) ||
                     document.getElementById("job-body-content" + jobId) ||
                     document.querySelector(`[id*="${jobId}"] .job-box`) ||
                     document.querySelector(`.job-box[id*="${jobId}"]`);
    if (specific) return specific;
  }

  if (typeof document !== "undefined") {
    return document.querySelector("#JobResult") ||
           document.querySelector(".open-board") ||
           document.querySelector(".job-box") ||
           document.querySelector("#divResults .openboard-container-jobs > div:first-child") ||
           document.querySelector("main") ||
           document.body;
  }
  return null;
}

function pickText(selectors, minLength = 2, scope = null) {
  const root = scope || (typeof document !== "undefined" ? document : null);
  if (!root) return null;
  for (const sel of selectors) {
    const el = root.querySelector(sel);
    if (el && el.innerText && el.innerText.trim().length >= minLength) {
      return el.innerText.trim();
    }
  }
  return null;
}

function heuristicDescription(scope = null) {
  const root = scope || getJobScope();
  if (!root) return null;
  const blocks = Array.from(root.querySelectorAll("section, article, div"))
    .filter((el) => {
      if (el.offsetParent === null || el.children.length >= 40) return false;
      if (el.closest("#jobmatch-widget-root")) return false;
      // Filter out navigation, header, footer, SEO sidebar with other job links, similar job carousels, and action buttons
      if (el.closest("nav, header, footer, aside, .header, .footer, .sidebar, #sidebar")) return false;
      if (el.closest("[id*='SeoBox'], [class*='seo'], [id*='similar'], [class*='similar']")) return false;
      if (el.closest(".job-button-send, .job-link-more, .job-icon-link, .job-setting")) return false;
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
  return best && bestLen > 80 ? best.innerText.trim() : null;
}

function extractDescription(scope) {
  const root = scope || getJobScope();
  if (!root) return "";

  // Check specific high-fidelity AllJobs selectors first
  for (const sel of DESC_SELECTORS) {
    const el = root.querySelector(sel);
    if (el && el.innerText) {
      const text = el.innerText.trim();
      if (text.length >= 40 && !text.startsWith("לעוד משרות")) {
        return text;
      }
    }
  }

  // Check all matching description blocks and take the longest valid one
  const allDescBlocks = Array.from(root.querySelectorAll(".job-content-top-desc, [id*='acord'], [id*='body-content']"));
  let best = "";
  for (const el of allDescBlocks) {
    const txt = (el.innerText || "").trim();
    if (txt.length > best.length && !txt.startsWith("לעוד משרות")) {
      best = txt;
    }
  }
  if (best.length >= 40) return best;

  return heuristicDescription(root);
}

function extractJob() {
  const scope = getJobScope();
  const rawTitle = pickText(TITLE_SELECTORS, 2, scope) || (typeof document !== "undefined" ? document.title : "");
  const title = cleanTitle(rawTitle);
  const description = extractDescription(scope);
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

if (typeof window !== "undefined" && window.JobMatchAdapter) {
  window.JobMatchAdapter.start({
    extractJob,
    jobKeyFromUrl,
    isSpecificJobPage,
    minDescriptionLength: 50
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { jobKeyFromUrl, isSpecificJobPage, cleanTitle, getJobScope, extractJob, extractDescription };
}
