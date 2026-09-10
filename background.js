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

const DEFAULT_AI_SETTINGS = {
  aiProvider: "chrome", // "chrome" | "gemini" | "ollama" | "openai_compat"
  geminiApiKey: "",
  geminiModel: "gemini-3.7-flash",
  ollamaEndpoint: "http://localhost:11434",
  ollamaModel: "llama3.2",
  openaiEndpoint: "http://localhost:1234/v1",
  openaiModel: "local-model",
  openaiApiKey: ""
};

async function getAiSettings() {
  const data = await chrome.storage.local.get([
    "aiProvider",
    "geminiApiKey",
    "geminiModel",
    "ollamaEndpoint",
    "ollamaModel",
    "openaiEndpoint",
    "openaiModel",
    "openaiApiKey"
  ]);
  return {
    aiProvider: data.aiProvider || DEFAULT_AI_SETTINGS.aiProvider,
    geminiApiKey: data.geminiApiKey || DEFAULT_AI_SETTINGS.geminiApiKey,
    geminiModel: data.geminiModel || DEFAULT_AI_SETTINGS.geminiModel,
    ollamaEndpoint: data.ollamaEndpoint || DEFAULT_AI_SETTINGS.ollamaEndpoint,
    ollamaModel: data.ollamaModel || DEFAULT_AI_SETTINGS.ollamaModel,
    openaiEndpoint: data.openaiEndpoint || DEFAULT_AI_SETTINGS.openaiEndpoint,
    openaiModel: data.openaiModel || DEFAULT_AI_SETTINGS.openaiModel,
    openaiApiKey: data.openaiApiKey || DEFAULT_AI_SETTINGS.openaiApiKey
  };
}

async function fetchWithTimeout(resource, options = {}, timeoutMs = 120000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(id);
  }
}

async function callGeminiCloud({ prompt, apiKey, model }) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error("No Gemini API key provided. Please enter your API key in the JobMatch popup.");
  }
  const targetModel = model || "gemini-3.7-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent`;

  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey.trim()
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1
      }
    })
  }, 45000);

  if (!res.ok) {
    const errData = await res.json().catch(() => null);
    const errMsg = errData?.error?.message || (await res.text().catch(() => "")) || res.statusText;
    throw new Error(`Gemini API error (HTTP ${res.status}): ${errMsg}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini returned empty response content.");
  }
  return text;
}

async function callOllama({ prompt, endpoint, model }) {
  const base = (endpoint || "http://localhost:11434").replace(/\/+$/, "");
  const url = `${base}/api/generate`;
  // 180s (3 minutes) timeout for local inference
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model || "llama3.2",
      prompt,
      stream: false,
      format: "json"
    })
  }, 180000);

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Ollama error (HTTP ${res.status}): ${errText || res.statusText}`);
  }

  const data = await res.json();
  if (!data?.response) {
    throw new Error("Ollama returned empty response.");
  }
  return data.response;
}

async function callOpenAiCompat({ prompt, endpoint, model, apiKey }) {
  const base = (endpoint || "http://localhost:1234/v1").replace(/\/+$/, "");
  const url = `${base}/chat/completions`;
  const headers = { "Content-Type": "application/json" };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey.trim()}`;
  }

  // 180s (3 minutes) timeout for local models and reasoning deliberation
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: model || "local-model",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 4096
    })
  }, 180000);

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Local AI error (HTTP ${res.status}): ${errText || res.statusText}`);
  }

  const data = await res.json();
  const choice = data?.choices?.[0]?.message;
  const content = choice?.content || "";
  const reasoning = choice?.reasoning_content || "";

  if (!content && !reasoning) {
    throw new Error("Local AI server returned empty content.");
  }
  return { content, reasoning, raw: content || reasoning };
}

async function getOllamaModels(endpoint) {
  const base = (endpoint || "http://localhost:11434").replace(/\/+$/, "");
  const url = `${base}/api/tags`;
  const res = await fetchWithTimeout(url, { method: "GET" }, 8000);
  if (!res.ok) {
    throw new Error(`Could not fetch models from Ollama (HTTP ${res.status})`);
  }
  const data = await res.json();
  const models = (data?.models || []).map((m) => m.name || m.model).filter(Boolean);
  return models;
}

async function getOpenAiModels({ endpoint, apiKey }) {
  const base = (endpoint || "http://localhost:1234/v1").replace(/\/+$/, "");
  const url = `${base}/models`;
  const headers = {};
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey.trim()}`;
  const res = await fetchWithTimeout(url, { method: "GET", headers }, 8000);
  if (!res.ok) {
    throw new Error(`Could not fetch models from local server (HTTP ${res.status})`);
  }
  const data = await res.json().catch(() => ({}));
  const models = (data?.data || []).map((m) => m.id).filter(Boolean);
  return models;
}

async function testAiConnection({ provider, endpoint, model, apiKey }) {
  try {
    if (provider === "gemini") {
      if (!apiKey || !apiKey.trim()) {
        return { ok: false, error: "Please enter a Gemini API key." };
      }
      const targetModel = model || "gemini-3.7-flash";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent`;
      const res = await fetchWithTimeout(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey.trim()
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Ping" }] }],
          generationConfig: { maxOutputTokens: 5 }
        })
      }, 12000);

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        const errMsg = errData?.error?.message || (await res.text().catch(() => "")) || res.statusText;
        return { ok: false, error: `Gemini API error (HTTP ${res.status}): ${errMsg}` };
      }
      return { ok: true, message: `Connected to Gemini Cloud (${targetModel}) successfully!` };
    } else if (provider === "ollama") {
      const ep = endpoint || "http://localhost:11434";
      const models = await getOllamaModels(ep);
      if (!models || models.length === 0) {
        return { ok: true, models: [], message: "Connected to Ollama, but no models found. Run 'ollama pull llama3.2' to download one." };
      }
      return { ok: true, models, message: `Connected to Ollama! Found ${models.length} installed model(s).` };
    } else if (provider === "openai_compat") {
      const ep = (endpoint || "http://localhost:1234/v1").replace(/\/+$/, "");
      const url = `${ep}/models`;
      const headers = {};
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
      const res = await fetchWithTimeout(url, { method: "GET", headers }, 8000);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json().catch(() => ({}));
      const models = (data?.data || []).map((m) => m.id).filter(Boolean);
      return { ok: true, models, message: `Connected to local server! Found ${models.length} model(s).` };
    } else {
      // Chrome built-in
      const resp = await askOffscreen({ type: "AI_AVAILABILITY" });
      const state = resp?.availability;
      if (state === "available" || state === "readily") {
        return { ok: true, message: "Chrome built-in Gemini Nano is available and ready." };
      }
      return { ok: false, error: `Chrome built-in AI state: ${state || "unavailable"}` };
    }
  } catch (err) {
    return { ok: false, error: `Connection failed: ${err.message || String(err)}` };
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
  await clearProfileCache(targetId);

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
  await clearProfileCache(profileId);

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
    const staleKeys = Object.keys(all).filter((k) => k.startsWith("cache:v1:") || k.startsWith("cache:v2:") || k.startsWith("cache:v3:") || k.startsWith("cache:v5:"));
    if (staleKeys.length) await chrome.storage.local.remove(staleKeys);
  } catch (e) {
    // ignore
  }
});

function cacheKey(url, profileId) {
  return `cache:v6:${profileId || "default"}:${url}`;
}

// Per-profile index of cache keys (cacheIndex[profileId] = [cacheKey, ...]),
// so profile save/delete and AI-settings changes can remove exactly the
// entries that belong to them instead of pulling the entire extension
// storage (including every profile's resume text) into memory just to
// filter it by string prefix. Also bounds how many cached job results a
// single profile can accumulate, since the old approach only ever evicted
// entries lazily, on the rare chance that exact URL was revisited before
// its 7-day TTL lapsed.
const CACHE_INDEX_KEY = "cacheIndex";
const MAX_CACHE_ENTRIES_PER_PROFILE = 300;

async function getCacheIndex() {
  const { [CACHE_INDEX_KEY]: index } = await chrome.storage.local.get(CACHE_INDEX_KEY);
  return index && typeof index === "object" ? index : {};
}

async function addToCacheIndex(profileId, key) {
  const index = await getCacheIndex();
  const id = profileId || "default";
  const list = (Array.isArray(index[id]) ? index[id] : []).filter((k) => k !== key);
  list.push(key);

  let evicted = [];
  if (list.length > MAX_CACHE_ENTRIES_PER_PROFILE) {
    evicted = list.splice(0, list.length - MAX_CACHE_ENTRIES_PER_PROFILE);
  }
  index[id] = list;

  await chrome.storage.local.set({ [CACHE_INDEX_KEY]: index });
  if (evicted.length) {
    await chrome.storage.local.remove(evicted).catch(() => {});
  }
}

async function removeFromCacheIndex(profileId, key) {
  const index = await getCacheIndex();
  const id = profileId || "default";
  if (!Array.isArray(index[id])) return;
  index[id] = index[id].filter((k) => k !== key);
  await chrome.storage.local.set({ [CACHE_INDEX_KEY]: index }).catch(() => {});
}

async function clearProfileCache(profileId) {
  const index = await getCacheIndex();
  const id = profileId || "default";
  const keys = Array.isArray(index[id]) ? index[id] : [];
  if (keys.length) {
    await chrome.storage.local.remove(keys).catch(() => {});
  }
  delete index[id];
  await chrome.storage.local.set({ [CACHE_INDEX_KEY]: index });
}

async function clearAllCache() {
  const index = await getCacheIndex();
  const allKeys = Object.values(index).filter(Array.isArray).flat();
  if (allKeys.length) {
    await chrome.storage.local.remove(allKeys).catch(() => {});
  }
  await chrome.storage.local.remove(CACHE_INDEX_KEY).catch(() => {});
}

async function getCachedResult(url, profileId) {
  const key = cacheKey(url, profileId);
  const { [key]: cached } = await chrome.storage.local.get(key);
  if (!cached) return null;

  // If entry was an ephemeral fallback (e.g. transient model-busy or timeout) and has expired,
  // treat as a cache miss to give on-device AI another chance to analyze the job!
  if (cached.expiresAt && Date.now() > cached.expiresAt) {
    chrome.storage.local.remove(key).catch(() => {});
    removeFromCacheIndex(profileId, key).catch(() => {});
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
  await addToCacheIndex(profileId, key);
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

  const aiSettings = await getAiSettings();
  let aiRawResult = null;
  let activeEngineName;
  let primaryError = null;
  let fallbackNote = null;

  if (aiSettings.aiProvider === "gemini") {
    activeEngineName = `gemini:${aiSettings.geminiModel || "gemini-3.7-flash"}`;
    try {
      const prompt = self.JobMatch.buildMatchPrompt({
        resumeText: targetProfile.text,
        jobTitle: title,
        jobText: description,
        detectedJobSkills: detMatch.detectedJobSkills || [],
        yearsOfExperience: targetProfile.yearsOfExperience
      });
      const responseText = await callGeminiCloud({
        prompt,
        apiKey: aiSettings.geminiApiKey,
        model: aiSettings.geminiModel
      });
      aiRawResult = self.JobMatch.extractJson(responseText);
    } catch (e) {
      console.warn("[JobMatch Background] Gemini Cloud match error, falling back:", e);
      primaryError = `Gemini Cloud error: ${e.message}`;
    }
  } else if (aiSettings.aiProvider === "ollama") {
    activeEngineName = `ollama:${aiSettings.ollamaModel}`;
    try {
      const prompt = self.JobMatch.buildMatchPrompt({
        resumeText: targetProfile.text,
        jobTitle: title,
        jobText: description,
        detectedJobSkills: detMatch.detectedJobSkills || [],
        yearsOfExperience: targetProfile.yearsOfExperience
      });
      const responseText = await callOllama({
        prompt,
        endpoint: aiSettings.ollamaEndpoint,
        model: aiSettings.ollamaModel
      });
      aiRawResult = self.JobMatch.extractJson(responseText);
    } catch (e) {
      console.warn("[JobMatch Background] Ollama match error, falling back:", e);
      primaryError = `Ollama (${aiSettings.ollamaModel}) error: ${e.message}`;
    }
  } else if (aiSettings.aiProvider === "openai_compat") {
    activeEngineName = `local-ai:${aiSettings.openaiModel}`;
    try {
      const prompt = self.JobMatch.buildMatchPrompt({
        resumeText: targetProfile.text,
        jobTitle: title,
        jobText: description,
        detectedJobSkills: detMatch.detectedJobSkills || [],
        yearsOfExperience: targetProfile.yearsOfExperience
      });
      const response = await callOpenAiCompat({
        prompt,
        endpoint: aiSettings.openaiEndpoint,
        model: aiSettings.openaiModel,
        apiKey: aiSettings.openaiApiKey
      });
      // Extract from content first, then reasoning if content had no valid JSON
      aiRawResult = self.JobMatch.extractJson(response.content);
      if (!aiRawResult && response.reasoning) {
        aiRawResult = self.JobMatch.extractJson(response.reasoning);
      }
      if (!aiRawResult && response.raw) {
        aiRawResult = self.JobMatch.extractJson(response.raw);
      }
    } catch (e) {
      console.warn("[JobMatch Background] Local OpenAI-compatible match error, falling back:", e);
      primaryError = `Local model (${aiSettings.openaiModel}) error: ${e.message}`;
    }
  } else {
    // Default Chrome built-in Gemini Nano via offscreen
    activeEngineName = "ai";
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
        aiRawResult = aiResponse.result;
      } else {
        console.warn("[JobMatch Background] On-device AI unavailable:", aiResponse?.error || "Empty result");
      }
    } catch (e) {
      console.warn("[JobMatch Background] On-device AI threw exception:", e);
    }
  }

  // Multi-tier Fallback: If primary AI provider failed (and wasn't Chrome Nano), try Chrome built-in Gemini Nano first!
  if (!aiRawResult && aiSettings.aiProvider !== "chrome") {
    try {
      console.log(`[JobMatch Background] Primary provider (${aiSettings.aiProvider}) failed. Attempting first fallback: Chrome built-in Gemini Nano...`);
      const nanoResponse = await askOffscreen({
        type: "AI_MATCH_JOB",
        resumeText: targetProfile.text,
        jobTitle: title,
        jobText: description,
        detectedJobSkills: detMatch.detectedJobSkills || [],
        yearsOfExperience: targetProfile.yearsOfExperience
      });
      if (nanoResponse?.ok && nanoResponse.result) {
        aiRawResult = nanoResponse.result;
        activeEngineName = "ai";
        fallbackNote = primaryError
          ? `${primaryError}. Fell back to Chrome built-in Gemini Nano.`
          : `Primary AI unavailable. Fell back to Chrome built-in Gemini Nano.`;
      }
    } catch (nanoErr) {
      console.warn("[JobMatch Background] Chrome built-in Gemini Nano fallback also failed:", nanoErr);
    }
  }

  // Every provider's raw JSON goes through the same normalization before use:
  // clamp matchPercent to 0-100, and coerce each list field to an array of
  // trimmed strings so a malformed/reasoning-model response can't propagate
  // an out-of-range score or a non-array field into the UI or the grounding logic.
  if (aiRawResult) {
    aiRawResult = self.JobMatch.normalizeAiMatchResult(aiRawResult);
  }

  let result = null;
  if (aiRawResult) {
    // Hybrid merge with strict job-posting grounding validation:
    // AI missing skills that do not appear in the job posting are dropped as hallucinations.
    const mergedMissing = self.JobMatch.mergeMissingSkills(
      aiRawResult.missingSkills || [],
      detMatch.missingSkills || [],
      fullJobText,
      detMatch.detectedJobSkills || []
    );

    // Ground AI suggestions against the actual job posting
    const groundedSuggestions = self.JobMatch.filterGroundedSuggestions(
      aiRawResult.suggestions,
      fullJobText,
      mergedMissing.discardedAiSkills || [],
      detMatch.suggestions
    );

    // Ground AI strengths against job posting & resume
    const groundedStrengths = self.JobMatch.filterGroundedItems(
      aiRawResult.strengths,
      fullJobText,
      mergedMissing.discardedAiSkills || [],
      detMatch.strengths
    );

    // Ground AI gaps against job posting
    const groundedGaps = self.JobMatch.filterGroundedItems(
      aiRawResult.gaps,
      fullJobText,
      mergedMissing.discardedAiSkills || [],
      detMatch.gaps
    );

    // If deterministic experience gap exists and AI didn't explicitly include it, ensure it is present
    if (detMatch.experienceAnalysis?.status === "deficit" && !groundedGaps.some((g) => g.toLowerCase().includes("experience"))) {
      groundedGaps.unshift(detMatch.experienceAnalysis.gapMessage);
    }

    result = {
      engine: activeEngineName,
      matchPercent: typeof aiRawResult.matchPercent === "number" ? aiRawResult.matchPercent : (detMatch.matchPercent ?? null),
      missingSkills: mergedMissing,
      strengths: groundedStrengths,
      gaps: groundedGaps,
      suggestions: groundedSuggestions,
      matchedSkills: detMatch.matchedSkills || [],
      experienceAnalysis: detMatch.experienceAnalysis || null,
      fallbackNote: fallbackNote || null
    };
  }

  if (!result) {
    result = { ...detMatch };
    if (primaryError) {
      result.fallbackNote = `${primaryError}. Chrome Nano unavailable. Showing offline keyword match.`;
    }
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
      case "GET_AI_SETTINGS": {
        const settings = await getAiSettings();
        sendResponse({ ok: true, settings });
        return;
      }
      case "SAVE_AI_SETTINGS": {
        try {
          const current = await getAiSettings();
          const next = { ...current, ...msg.payload };
          await chrome.storage.local.set(next);

          // Clear cached job results if engine or model changed so jobs re-evaluate
          if (
            current.aiProvider !== next.aiProvider ||
            current.geminiModel !== next.geminiModel ||
            current.geminiApiKey !== next.geminiApiKey ||
            current.ollamaModel !== next.ollamaModel ||
            current.openaiModel !== next.openaiModel
          ) {
            await clearAllCache();
          }

          sendResponse({ ok: true, settings: next });
        } catch (err) {
          sendResponse({ ok: false, error: err?.message || String(err) });
        }
        return;
      }
      case "GET_OLLAMA_MODELS": {
        try {
          const models = await getOllamaModels(msg.payload?.endpoint);
          sendResponse({ ok: true, models });
        } catch (err) {
          sendResponse({ ok: false, error: err?.message || String(err) });
        }
        return;
      }
      case "GET_OPENAI_MODELS": {
        try {
          const models = await getOpenAiModels(msg.payload || {});
          sendResponse({ ok: true, models });
        } catch (err) {
          sendResponse({ ok: false, error: err?.message || String(err) });
        }
        return;
      }
      case "TEST_AI_CONNECTION": {
        try {
          const res = await testAiConnection(msg.payload || {});
          sendResponse(res);
        } catch (err) {
          sendResponse({ ok: false, error: err?.message || String(err) });
        }
        return;
      }
      default:
        sendResponse({ ok: false, error: "Unknown message type" });
    }
  })();

  return true;
});
