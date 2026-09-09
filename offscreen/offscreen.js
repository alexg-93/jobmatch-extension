// offscreen/offscreen.js
// Runs inside the hidden offscreen document created by background.js.
// This is the only place we attempt to call Chrome's built-in on-device
// model (Gemini Nano via the Prompt API / `LanguageModel`). It's free and
// runs entirely on-device — no API key, no network call, no data leaving
// the machine — but it's a newer browser capability that isn't guaranteed
// to exist on every Chrome install, so every call here is feature-detected
// and reports back cleanly if it's unavailable.

function getLanguageModelApi() {
  if (typeof LanguageModel !== "undefined") return LanguageModel;
  if (typeof ai !== "undefined" && ai?.languageModel) return ai.languageModel;
  if (typeof window !== "undefined" && window.ai?.languageModel) return window.ai.languageModel;
  if (typeof self !== "undefined" && self.ai?.languageModel) return self.ai.languageModel;
  return null;
}

const MODEL_OPTIONS = {
  expectedInputs: [{ type: "text", languages: ["en"] }],
  expectedOutputs: [{ type: "text", languages: ["en"] }]
};

async function getAvailability() {
  try {
    const model = getLanguageModelApi();
    if (!model) return "unavailable";

    if (typeof model.availability === "function") {
      let status;
      try {
        status = await model.availability(MODEL_OPTIONS);
      } catch (e) {
        status = await model.availability();
      }
      if (status === "readily" || status === "available") return "available";
      if (status === "after-download" || status === "downloadable" || status === "downloading") return "downloadable";
      return "unavailable";
    }

    if (typeof model.capabilities === "function") {
      const caps = await model.capabilities();
      const status = caps?.available;
      if (status === "readily" || status === "available") return "available";
      if (status === "after-download" || status === "downloadable") return "downloadable";
      return "unavailable";
    }

    return "unavailable";
  } catch (e) {
    return "unavailable";
  }
}

async function runPrompt(promptText) {
  const model = getLanguageModelApi();
  if (!model) {
    throw new Error("LanguageModel / Prompt API not present in this Chrome build");
  }
  const availability = await getAvailability();
  if (availability === "unavailable") {
    throw new Error("On-device model unavailable on this device");
  }
  let session;
  try {
    session = await model.create(MODEL_OPTIONS);
  } catch (e) {
    session = await model.create();
  }
  try {
    const result = await session.prompt(promptText);
    return result;
  } finally {
    session.destroy?.();
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.target !== "offscreen") return false;

  (async () => {
    try {
      if (msg.type === "AI_AVAILABILITY") {
        const availability = await getAvailability();
        sendResponse({ ok: true, availability });
        return;
      }

      if (msg.type === "AI_MATCH_JOB") {
        const prompt = self.JobMatch.buildMatchPrompt(msg.resumeText, msg.jobTitle, msg.jobText, msg.detectedJobSkills);
        const raw = await runPrompt(prompt);
        const parsed = self.JobMatch.extractJson(raw);
        if (!parsed) throw new Error("Model response wasn't parseable JSON");
        sendResponse({ ok: true, result: parsed });
        return;
      }

      if (msg.type === "AI_EXTRACT_SKILLS") {
        const prompt = self.JobMatch.buildSkillExtractionPrompt(msg.resumeText);
        const raw = await runPrompt(prompt);
        const parsed = self.JobMatch.extractJson(raw);
        const skills = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.skills) ? parsed.skills : null);
        if (!skills) throw new Error("Model response wasn't a skills array");
        sendResponse({ ok: true, skills });
        return;
      }

      sendResponse({ ok: false, error: "Unknown message type" });
    } catch (err) {
      sendResponse({ ok: false, error: String(err && err.message ? err.message : err) });
    }
  })();

  return true; // keep the message channel open for the async response
});
