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

async function ensureProfilesMigrated() {
  const data = await chrome.storage.local.get(["profiles", "activeProfileId", "resume"]);
  let { profiles, activeProfileId, resume } = data;

  let changed = false;
  if (!Array.isArray(profiles) || profiles.length === 0) {
    if (resume && resume.text) {
      profiles = [{
        id: "profile_1",
        name: "Primary Profile",
        text: resume.text || "",
        skills: resume.skills || [],
        customSkills: resume.customSkills || [],
        savedAt: resume.savedAt || Date.now()
      }];
    } else {
      profiles = [{
        id: "profile_1",
        name: "Primary Profile",
        text: "",
        skills: [],
        customSkills: [],
        savedAt: Date.now()
      }];
    }
    activeProfileId = "profile_1";
    changed = true;
  }

  if (!activeProfileId || !profiles.some((p) => p.id === activeProfileId)) {
    activeProfileId = profiles[0].id;
    changed = true;
  }

  // Ensure legacy resume key stays synced with active profile
  const activeProf = profiles.find((p) => p.id === activeProfileId) || profiles[0];
  if (!resume || resume.text !== activeProf.text || resume.savedAt !== activeProf.savedAt) {
    resume = {
      text: activeProf.text,
      skills: activeProf.skills,
      customSkills: activeProf.customSkills,
      savedAt: activeProf.savedAt
    };
    changed = true;
  }

  if (changed) {
    await chrome.storage.local.set({ profiles, activeProfileId, resume });
  }

  return { profiles, activeProfileId, activeProfile: activeProf };
}

async function getProfilesState() {
  return await ensureProfilesMigrated();
}

async function saveProfile(profileData) {
  const { profiles, activeProfileId } = await ensureProfilesMigrated();
  let updatedProfiles = [...profiles];

  let targetId = profileData.id;
  if (!targetId) {
    if (updatedProfiles.length >= 3) {
      throw new Error("Maximum 3 profiles allowed. Delete an existing profile to add a new one.");
    }
    targetId = "profile_" + Date.now();
    profileData.id = targetId;
  }

  const existingIdx = updatedProfiles.findIndex((p) => p.id === targetId);
  const profileToSave = {
    id: targetId,
    name: (profileData.name || `Profile ${updatedProfiles.length + 1}`).trim().slice(0, 30),
    text: profileData.text || "",
    skills: profileData.skills || [],
    customSkills: profileData.customSkills || [],
    yearsOfExperience: (typeof profileData.yearsOfExperience === "number" && !isNaN(profileData.yearsOfExperience))
      ? profileData.yearsOfExperience
      : (profileData.yearsOfExperience ? parseFloat(profileData.yearsOfExperience) || null : null),
    savedAt: Date.now()
  };

  if (existingIdx >= 0) {
    updatedProfiles[existingIdx] = profileToSave;
  } else {
    if (updatedProfiles.length >= 3) {
      throw new Error("Maximum 3 profiles allowed.");
    }
    updatedProfiles.push(profileToSave);
  }

  let newActiveId = activeProfileId;
  if (profileData.makeActive || !updatedProfiles.some((p) => p.id === newActiveId)) {
    newActiveId = targetId;
  }

  const activeProf = updatedProfiles.find((p) => p.id === newActiveId) || updatedProfiles[0];
  const legacyResume = {
    text: activeProf.text,
    skills: activeProf.skills,
    customSkills: activeProf.customSkills,
    savedAt: activeProf.savedAt
  };

  // Invalidate cache for this profile
  const all = await chrome.storage.local.get(null);
  const prefix = `cache:v3:${targetId}:`;
  const cacheKeys = Object.keys(all).filter((k) => k.startsWith(prefix));
  if (cacheKeys.length) await chrome.storage.local.remove(cacheKeys);

  await chrome.storage.local.set({
    profiles: updatedProfiles,
    activeProfileId: newActiveId,
    resume: legacyResume
  });

  return { profiles: updatedProfiles, activeProfileId: newActiveId, savedProfile: profileToSave };
}

async function deleteProfile(profileId) {
  const { profiles, activeProfileId } = await ensureProfilesMigrated();
  if (profiles.length <= 1) {
    throw new Error("Cannot delete the only remaining profile.");
  }

  const updatedProfiles = profiles.filter((p) => p.id !== profileId);
  let newActiveId = activeProfileId;
  if (newActiveId === profileId) {
    newActiveId = updatedProfiles[0].id;
  }

  const activeProf = updatedProfiles.find((p) => p.id === newActiveId) || updatedProfiles[0];
  const legacyResume = {
    text: activeProf.text,
    skills: activeProf.skills,
    customSkills: activeProf.customSkills,
    savedAt: activeProf.savedAt
  };

  // Invalidate cache for deleted profile
  const all = await chrome.storage.local.get(null);
  const prefix = `cache:v3:${profileId}:`;
  const cacheKeys = Object.keys(all).filter((k) => k.startsWith(prefix));
  if (cacheKeys.length) await chrome.storage.local.remove(cacheKeys);

  await chrome.storage.local.set({
    profiles: updatedProfiles,
    activeProfileId: newActiveId,
    resume: legacyResume
  });

  return { profiles: updatedProfiles, activeProfileId: newActiveId };
}

async function setActiveProfile(profileId) {
  const { profiles } = await ensureProfilesMigrated();
  const target = profiles.find((p) => p.id === profileId);
  if (!target) throw new Error("Profile not found: " + profileId);

  const legacyResume = {
    text: target.text,
    skills: target.skills,
    customSkills: target.customSkills,
    savedAt: target.savedAt
  };

  await chrome.storage.local.set({
    activeProfileId: profileId,
    resume: legacyResume
  });

  return { activeProfileId: profileId, activeProfile: target };
}

async function getResume() {
  const { activeProfile } = await ensureProfilesMigrated();
  return activeProfile || null;
}

chrome.runtime.onInstalled.addListener(async () => {
  try {
    await ensureProfilesMigrated();
    const all = await chrome.storage.local.get(null);
    const staleKeys = Object.keys(all).filter((k) => k.startsWith("cache:v1:") || k.startsWith("cache:v2:") || k.startsWith("cache:v3:"));
    if (staleKeys.length) await chrome.storage.local.remove(staleKeys);
  } catch (e) {
    // ignore
  }
});

function cacheKey(url, profileId) {
  return `cache:v5:${profileId || "default"}:${url}`;
}

async function getCachedResult(url, profileId) {
  const key = cacheKey(url, profileId);
  const { [key]: cached } = await chrome.storage.local.get(key);
  if (!cached) return null;

  // If entry was an ephemeral fallback (e.g. transient model-busy or timeout) and has expired,
  // treat as a cache miss to give on-device AI another chance to analyze the job!
  if (cached.expiresAt && Date.now() > cached.expiresAt) {
    chrome.storage.local.remove(key).catch(() => {});
    return null;
  }
  return cached;
}

async function setCachedResult(url, profileId, result) {
  const key = cacheKey(url, profileId);
  const isFallback = result.engine === "keyword";
  // Persistent 7-day TTL for successful AI matches, 60-second ephemeral TTL for transient keyword fallbacks
  const ttlMs = isFallback ? 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  await chrome.storage.local.set({
    [key]: {
      ...result,
      cachedAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
      isFallback
    }
  });
}

async function analyzeJob({ url, title, description, profileId }) {
  const { profiles, activeProfileId } = await ensureProfilesMigrated();
  const targetProfileId = profileId || activeProfileId;
  const targetProfile = profiles.find((p) => p.id === targetProfileId) || profiles[0];

  const profilesSummary = profiles.map((p) => ({
    id: p.id,
    name: p.name,
    hasResume: Boolean(p.text && p.text.trim())
  }));

  const cached = await getCachedResult(url, targetProfileId);
  if (cached) {
    return {
      ...cached,
      profiles: profilesSummary,
      activeProfileId: targetProfileId,
      profileName: targetProfile?.name || "Profile"
    };
  }

  if (!targetProfile || !targetProfile.text) {
    return {
      engine: "none",
      error: `No resume uploaded yet for profile "${targetProfile?.name || "Profile"}". Click the extension icon to upload one.`,
      profiles: profilesSummary,
      activeProfileId: targetProfileId,
      profileName: targetProfile?.name || "Profile"
    };
  }

  // Always compute deterministic keyword match as ground-truth baseline
  const fullJobText = `${title}\n${description}`;
  const detMatch = self.JobMatch.keywordMatch(
    targetProfile.text,
    fullJobText,
    targetProfile.customSkills,
    targetProfile.yearsOfExperience
  );

  // Try on-device AI first (free, private, no key)
  let result = null;
  try {
    const aiResponse = await askOffscreen({
      type: "AI_MATCH_JOB",
      resumeText: targetProfile.text,
      jobTitle: title,
      jobText: description,
      detectedJobSkills: detMatch.detectedJobSkills || [],
      yearsOfExperience: targetProfile.yearsOfExperience
    });
    if (aiResponse?.ok && aiResponse.result) {
      // Hybrid merge with strict job-posting grounding validation:
      // AI missing skills that do not appear in the job posting are dropped as hallucinations.
      const mergedMissing = self.JobMatch.mergeMissingSkills(
        aiResponse.result.missingSkills || [],
        detMatch.missingSkills || [],
        fullJobText,
        detMatch.detectedJobSkills || []
      );

      // Ground AI suggestions against the actual job posting
      const groundedSuggestions = self.JobMatch.filterGroundedSuggestions(
        aiResponse.result.suggestions,
        fullJobText,
        mergedMissing.discardedAiSkills || [],
        detMatch.suggestions
      );

      // Ground AI strengths against job posting & resume
      const groundedStrengths = self.JobMatch.filterGroundedItems(
        aiResponse.result.strengths,
        fullJobText,
        mergedMissing.discardedAiSkills || [],
        detMatch.strengths
      );

      // Ground AI gaps against job posting
      const groundedGaps = self.JobMatch.filterGroundedItems(
        aiResponse.result.gaps,
        fullJobText,
        mergedMissing.discardedAiSkills || [],
        detMatch.gaps
      );

      // If deterministic experience gap exists and AI didn't explicitly include it, ensure it is present
      if (detMatch.experienceAnalysis?.status === "deficit" && !groundedGaps.some((g) => g.toLowerCase().includes("experience"))) {
        groundedGaps.unshift(detMatch.experienceAnalysis.gapMessage);
      }

      result = {
        engine: "ai",
        matchPercent: typeof aiResponse.result.matchPercent === "number" ? aiResponse.result.matchPercent : (detMatch.matchPercent ?? null),
        missingSkills: mergedMissing,
        strengths: groundedStrengths,
        gaps: groundedGaps,
        suggestions: groundedSuggestions,
        matchedSkills: detMatch.matchedSkills || [],
        experienceAnalysis: detMatch.experienceAnalysis || null
      };
    } else {
      console.warn("[JobMatch Background] On-device AI unavailable or returned error:", aiResponse?.error || "Empty result");
    }
  } catch (e) {
    console.warn("[JobMatch Background] On-device AI threw exception, falling back to keyword match:", e);
  }

  if (!result) {
    result = detMatch;
  }

  if (result) {
    result.jobTitle = title || "";
    result.profileId = targetProfileId;
    result.profileName = targetProfile.name;
    result.profiles = profilesSummary;
    result.activeProfileId = targetProfileId;
  }

  await setCachedResult(url, targetProfileId, result);
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
      case "GET_PROFILES": {
        const state = await getProfilesState();
        sendResponse({ ok: true, profiles: state.profiles, activeProfileId: state.activeProfileId });
        return;
      }
      case "SAVE_PROFILE": {
        try {
          const res = await saveProfile(msg.payload);
          sendResponse({ ok: true, ...res });
        } catch (err) {
          sendResponse({ ok: false, error: err?.message || String(err) });
        }
        return;
      }
      case "DELETE_PROFILE": {
        try {
          const res = await deleteProfile(msg.payload.profileId);
          sendResponse({ ok: true, ...res });
        } catch (err) {
          sendResponse({ ok: false, error: err?.message || String(err) });
        }
        return;
      }
      case "SET_ACTIVE_PROFILE": {
        try {
          const res = await setActiveProfile(msg.payload.profileId);
          sendResponse({ ok: true, ...res });
        } catch (err) {
          sendResponse({ ok: false, error: err?.message || String(err) });
        }
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
        // Legacy fallback: save to active profile
        const { activeProfileId } = await ensureProfilesMigrated();
        await saveProfile({ id: activeProfileId, ...msg.payload });
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
