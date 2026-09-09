// background.js (MV3 service worker)
// Central hub: holds no UI, just routes messages between content scripts,
// the popup, and the offscreen document; owns the resume in storage; owns
// the per-job result cache; and decides AI-vs-fallback per request.

importScripts("shared/matcher.js");

const OFFSCREEN_PATH = "offscreen/offscreen.html";
let creatingOffscreen = null;

async function ensureOffscreenDocument() {
  const existing = await chrome.offscreen.hasDocument?.();
  if (existing) return;
  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }
  try {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: OFFSCREEN_PATH,
      reasons: ["DOM_PARSER"], // closest available justification; we only use it for on-device inference
      justification: "Run Chrome's on-device Gemini Nano model for resume/job matching"
    });
    await creatingOffscreen;
  } catch (err) {
    if (!String(err).includes("Only a single offscreen document")) {
      throw err;
    }
  } finally {
    creatingOffscreen = null;
  }
}

async function askOffscreen(message) {
  await ensureOffscreenDocument();
  try {
    return await chrome.runtime.sendMessage({ ...message, target: "offscreen" });
  } catch (e) {
    // Covers the brief race right after the offscreen document is created,
    // before its message listener has registered.
    await new Promise((r) => setTimeout(r, 200));
    return chrome.runtime.sendMessage({ ...message, target: "offscreen" });
  }
}

async function getResume() {
  const { resume } = await chrome.storage.local.get("resume");
  return resume || null;
}

function cacheKey(url) {
  return "cache:v2:" + url;
}

async function getCachedResult(url) {
  const { [cacheKey(url)]: cached } = await chrome.storage.local.get(cacheKey(url));
  return cached || null;
}

async function setCachedResult(url, result) {
  await chrome.storage.local.set({ [cacheKey(url)]: { ...result, cachedAt: Date.now() } });
}

async function analyzeJob({ url, title, description }) {
  const cached = await getCachedResult(url);
  if (cached) return cached;

  const resume = await getResume();
  if (!resume || !resume.text) {
    return { engine: "none", error: "No resume uploaded yet. Click the extension icon to upload one." };
  }

  // Always compute deterministic keyword match as ground-truth baseline
  const fullJobText = `${title}\n${description}`;
  const detMatch = self.JobMatch.keywordMatch(resume.text, fullJobText, resume.customSkills);

  // Try on-device AI first (free, private, no key)
  let result = null;
  try {
    const aiResponse = await askOffscreen({
      type: "AI_MATCH_JOB",
      resumeText: resume.text,
      jobTitle: title,
      jobText: description,
      detectedJobSkills: detMatch.detectedJobSkills || []
    });
    if (aiResponse?.ok && aiResponse.result) {
      // Hybrid merge: merge AI qualitative missing skills with deterministic missing skills
      const mergedMissing = self.JobMatch.mergeMissingSkills(
        aiResponse.result.missingSkills || [],
        detMatch.missingSkills || []
      );

      result = {
        engine: "ai",
        matchPercent: typeof aiResponse.result.matchPercent === "number" ? aiResponse.result.matchPercent : (detMatch.matchPercent ?? null),
        missingSkills: mergedMissing,
        suggestions: (Array.isArray(aiResponse.result.suggestions) && aiResponse.result.suggestions.length)
          ? aiResponse.result.suggestions
          : detMatch.suggestions,
        matchedSkills: detMatch.matchedSkills || []
      };
    }
  } catch (e) {
    // swallow — fall through to keyword matcher
  }

  if (!result) {
    result = detMatch;
  }

  await setCachedResult(url, result);
  return result;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.target === "offscreen") return false; // not for us

  (async () => {
    switch (msg.type) {
      case "ANALYZE_JOB": {
        const result = await analyzeJob(msg.payload);
        sendResponse(result);
        return;
      }
      case "GET_AI_AVAILABILITY": {
        try {
          const resp = await askOffscreen({ type: "AI_AVAILABILITY" });
          sendResponse(resp);
        } catch (e) {
          sendResponse({ ok: false, availability: "unavailable" });
        }
        return;
      }
      case "SAVE_RESUME": {
        await chrome.storage.local.set({ resume: msg.payload });
        // A new resume invalidates every cached job match.
        const all = await chrome.storage.local.get(null);
        const cacheKeys = Object.keys(all).filter((k) => k.startsWith("cache:"));
        if (cacheKeys.length) await chrome.storage.local.remove(cacheKeys);
        sendResponse({ ok: true });
        return;
      }
      case "GET_RESUME": {
        const resume = await getResume();
        sendResponse({ resume });
        return;
      }
      case "EXTRACT_SKILLS": {
        try {
          const resp = await askOffscreen({ type: "AI_EXTRACT_SKILLS", resumeText: msg.payload.resumeText });
          if (resp?.ok) {
            sendResponse({ ok: true, skills: resp.skills });
            return;
          }
        } catch (e) {
          // fall through
        }
        const skills = self.JobMatch.naiveSkillExtraction(msg.payload.resumeText, msg.payload.customSkills);
        sendResponse({ ok: true, skills, engine: "keyword" });
        return;
      }
      default:
        sendResponse({ ok: false, error: "Unknown message type" });
    }
  })();

  return true;
});
