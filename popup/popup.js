// popup/popup.js

function $(id) {
  return document.getElementById(id);
}

function sendMessage(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}

async function extractPdfText(arrayBuffer) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("lib/pdf.worker.min.js");
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it) => it.str).join(" ") + "\n";
  }
  return text.trim();
}

function setStatus(msg, isError) {
  const el = $("status");
  el.textContent = msg;
  el.className = isError ? "status status--error" : "status";
}

let profiles = [];
let activeProfileId = null;
let selectedProfileId = null;
let isProcessing = false;

function setButtonsDisabled(disabled) {
  $("saveBtn").disabled = disabled;
  $("clearBtn").disabled = disabled;
  $("resumeFile").disabled = disabled;
  $("setActiveBtn").disabled = disabled;
  $("deleteProfileBtn").disabled = disabled || profiles.length <= 1;
}

function getSelectedProfile() {
  return profiles.find((p) => p.id === selectedProfileId) || profiles[0] || null;
}

function renderProfilesUI() {
  const tabsContainer = $("profilesTabs");
  tabsContainer.innerHTML = "";

  profiles.forEach((p) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "profile-tab" + (p.id === selectedProfileId ? " active" : "");
    const isAct = p.id === activeProfileId;
    btn.innerHTML = `${escapeHtml(p.name)} ${isAct ? '<span class="tab-star" title="Active default profile">★</span>' : ""}`;
    btn.addEventListener("click", () => {
      if (isProcessing || p.id === selectedProfileId) return;
      selectedProfileId = p.id;
      populateSelectedProfile();
    });
    tabsContainer.appendChild(btn);
  });

  if (profiles.length < 3) {
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "profile-tab-add";
    addBtn.textContent = "+ Add Profile";
    addBtn.addEventListener("click", async () => {
      if (isProcessing || profiles.length >= 3) return;
      await createNewProfile();
    });
    tabsContainer.appendChild(addBtn);
  }

  $("profilesCount").textContent = `${profiles.length}/3`;

  const curr = getSelectedProfile();
  if (curr) {
    $("profileNameInput").value = curr.name || "";
    const isCurrActive = curr.id === activeProfileId;
    const actBtn = $("setActiveBtn");
    actBtn.className = "btn btn-tiny btn-active-toggle" + (isCurrActive ? " is-active" : "");
    actBtn.textContent = isCurrActive ? "★ Active" : "☆ Set Active";
    actBtn.title = isCurrActive ? "This is your active default profile" : "Set this profile as default active";

    $("deleteProfileBtn").disabled = profiles.length <= 1;
  }
}

function populateSelectedProfile() {
  renderProfilesUI();
  const curr = getSelectedProfile();
  if (!curr) return;

  $("resumeText").value = curr.text || "";
  $("customSkills").value = (curr.customSkills || []).join(", ");
  if (curr.text) {
    $("resumeInfo").textContent =
      `Profile "${curr.name}": ${curr.text.length} chars, ${curr.skills?.length || 0} skills` +
      (curr.savedAt ? ` · saved ${new Date(curr.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : "");
  } else {
    $("resumeInfo").textContent = `Profile "${curr.name}" is empty. Upload or paste resume text below.`;
  }
}

async function createNewProfile() {
  const nextNum = profiles.length + 1;
  const defaultName = nextNum === 2 ? "Frontend Specialist" : nextNum === 3 ? "Team Lead" : `Profile ${nextNum}`;
  isProcessing = true;
  setButtonsDisabled(true);
  setStatus("Creating new profile…");
  try {
    const res = await sendMessage({
      type: "SAVE_PROFILE",
      payload: {
        name: defaultName,
        text: "",
        skills: [],
        customSkills: []
      }
    });
    if (res?.ok) {
      profiles = res.profiles;
      selectedProfileId = res.savedProfile?.id || profiles[profiles.length - 1].id;
      activeProfileId = res.activeProfileId;
      populateSelectedProfile();
      setStatus(`Created profile "${defaultName}". Upload a resume for this profile.`);
      $("profileNameInput").focus();
    } else {
      setStatus(res?.error || "Failed to create profile", true);
    }
  } catch (err) {
    setStatus("Error creating profile: " + err.message, true);
  } finally {
    isProcessing = false;
    setButtonsDisabled(false);
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

let currentAiSettings = {
  aiProvider: "chrome",
  geminiApiKey: "",
  geminiModel: "gemini-3.7-flash",
  ollamaEndpoint: "http://localhost:11434",
  ollamaModel: "llama3.2",
  openaiEndpoint: "http://localhost:1234/v1",
  openaiModel: "local-model",
  openaiApiKey: ""
};

async function updateAiStatusDisplay() {
  const aiEl = $("aiStatus");
  if (!aiEl) return;
  const provider = currentAiSettings.aiProvider;

  if (provider === "gemini") {
    const hasKey = Boolean(currentAiSettings.geminiApiKey?.trim());
    if (hasKey) {
      aiEl.textContent = `AI Engine: Google Gemini Cloud (${currentAiSettings.geminiModel || "gemini-3.7-flash"}) — ready.`;
      aiEl.className = "ai-status ai-status--ok";
    } else {
      aiEl.textContent = `AI Engine: Google Gemini Cloud — please enter an API key below.`;
      aiEl.className = "ai-status ai-status--pending";
    }
  } else if (provider === "ollama") {
    aiEl.textContent = `AI Engine: Ollama (Local) — model "${currentAiSettings.ollamaModel}". 100% private offline.`;
    aiEl.className = "ai-status ai-status--ok";
  } else if (provider === "openai_compat") {
    aiEl.textContent = `AI Engine: Local server — model "${currentAiSettings.openaiModel}". 100% private offline.`;
    aiEl.className = "ai-status ai-status--ok";
  } else {
    // Chrome built-in Gemini Nano
    const availabilityResp = await sendMessage({ type: "GET_AI_AVAILABILITY" });
    const state = availabilityResp?.availability;
    if (state === "available" || state === "readily") {
      aiEl.textContent = "AI Engine: Chrome Built-in (Gemini Nano) — ready & offline.";
      aiEl.className = "ai-status ai-status--ok";
    } else if (state === "downloadable" || state === "downloading" || state === "after-download") {
      aiEl.textContent = "AI Engine: Chrome Built-in — model downloading. Using offline keyword match.";
      aiEl.className = "ai-status ai-status--pending";
    } else {
      aiEl.textContent = "AI Engine: Chrome Built-in not active on this browser — select Gemini, Ollama or use keyword match.";
      aiEl.className = "ai-status ai-status--off";
    }
  }
}

function updateAiProviderUI(provider) {
  const buttons = document.querySelectorAll("#aiProviderToggle .provider-btn");
  buttons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.provider === provider);
  });

  const geminiPanel = $("geminiSettings");
  const ollamaPanel = $("ollamaSettings");
  const openaiPanel = $("openaiSettings");
  if (geminiPanel) geminiPanel.style.display = provider === "gemini" ? "block" : "none";
  if (ollamaPanel) ollamaPanel.style.display = provider === "ollama" ? "block" : "none";
  if (openaiPanel) openaiPanel.style.display = provider === "openai_compat" ? "block" : "none";

  updateAiStatusDisplay();
}

async function populateOllamaModels(endpoint) {
  const select = $("ollamaModelSelect");
  if (!select) return;
  const statusEl = $("ollamaConnStatus");
  if (statusEl) {
    statusEl.textContent = "Fetching models…";
    statusEl.className = "conn-status-text loading";
  }

  const res = await sendMessage({ type: "GET_OLLAMA_MODELS", payload: { endpoint } });
  select.innerHTML = "";
  if (res?.ok && Array.isArray(res.models) && res.models.length > 0) {
    res.models.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m;
      select.appendChild(opt);
    });

    if (res.models.includes(currentAiSettings.ollamaModel)) {
      select.value = currentAiSettings.ollamaModel;
    } else {
      select.value = res.models[0];
      currentAiSettings.ollamaModel = res.models[0];
      await sendMessage({ type: "SAVE_AI_SETTINGS", payload: { ollamaModel: res.models[0] } });
    }

    if (statusEl) {
      statusEl.textContent = `Connected (${res.models.length} models)`;
      statusEl.className = "conn-status-text ok";
    }
  } else {
    const opt = document.createElement("option");
    opt.value = currentAiSettings.ollamaModel || "llama3.2";
    opt.textContent = currentAiSettings.ollamaModel || "llama3.2";
    select.appendChild(opt);
    if (statusEl) {
      statusEl.textContent = res?.error ? "Offline / Not connected" : "No models found";
      statusEl.className = "conn-status-text err";
    }
  }
}

async function populateOpenAiModels(endpoint, apiKey) {
  const datalist = $("openaiModelsList");
  if (!datalist) return;
  const statusEl = $("openaiConnStatus");
  if (statusEl) {
    statusEl.textContent = "Fetching models…";
    statusEl.className = "conn-status-text loading";
  }

  const res = await sendMessage({
    type: "GET_OPENAI_MODELS",
    payload: { endpoint, apiKey }
  });

  datalist.innerHTML = "";
  if (res?.ok && Array.isArray(res.models) && res.models.length > 0) {
    res.models.forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m;
      datalist.appendChild(opt);
    });

    if (currentAiSettings.openaiModel === "local-model" && res.models[0]) {
      const input = $("openaiModelInput");
      if (input) input.value = res.models[0];
      currentAiSettings.openaiModel = res.models[0];
      await sendMessage({ type: "SAVE_AI_SETTINGS", payload: { openaiModel: res.models[0] } });
      updateAiStatusDisplay();
    }

    if (statusEl) {
      statusEl.textContent = `Connected (${res.models.length} models)`;
      statusEl.className = "conn-status-text ok";
    }
  } else if (statusEl) {
    statusEl.textContent = res?.error ? "Offline / Not connected" : "No models found";
    statusEl.className = "conn-status-text err";
  }
}

async function loadExisting() {
  const profilesResp = await sendMessage({ type: "GET_PROFILES" });
  if (profilesResp?.ok && Array.isArray(profilesResp.profiles)) {
    profiles = profilesResp.profiles;
    activeProfileId = profilesResp.activeProfileId;
    if (!selectedProfileId || !profiles.some((p) => p.id === selectedProfileId)) {
      selectedProfileId = activeProfileId || profiles[0]?.id;
    }
    populateSelectedProfile();
  }

  const settingsResp = await sendMessage({ type: "GET_AI_SETTINGS" });
  if (settingsResp?.ok && settingsResp.settings) {
    currentAiSettings = settingsResp.settings;
  }

  if ($("geminiApiKeyInput")) $("geminiApiKeyInput").value = currentAiSettings.geminiApiKey || "";
  if ($("geminiModelSelect")) $("geminiModelSelect").value = currentAiSettings.geminiModel || "gemini-3.7-flash";
  if ($("ollamaEndpoint")) $("ollamaEndpoint").value = currentAiSettings.ollamaEndpoint;
  if ($("openaiEndpoint")) $("openaiEndpoint").value = currentAiSettings.openaiEndpoint;
  if ($("openaiModelInput")) $("openaiModelInput").value = currentAiSettings.openaiModel;
  if ($("openaiApiKeyInput")) $("openaiApiKeyInput").value = currentAiSettings.openaiApiKey;

  updateAiProviderUI(currentAiSettings.aiProvider);
  if (currentAiSettings.aiProvider === "ollama") {
    populateOllamaModels(currentAiSettings.ollamaEndpoint);
  } else if (currentAiSettings.aiProvider === "openai_compat") {
    populateOpenAiModels(currentAiSettings.openaiEndpoint, currentAiSettings.openaiApiKey);
  }

  const { scanMode = "auto" } = await chrome.storage.local.get("scanMode");
  updateScanModeUI(scanMode);
}

function updateScanModeUI(mode) {
  const buttons = document.querySelectorAll("#scanModeToggle .mode-btn");
  buttons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });
  const hint = $("modeHint");
  if (hint) {
    hint.textContent = mode === "manual"
      ? "Manual: shows a floating draggable button on job pages to scan when you choose."
      : "Auto: automatically scans job listings when opened.";
  }
}

document.querySelectorAll("#scanModeToggle .mode-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const mode = btn.dataset.mode;
    updateScanModeUI(mode);
    await chrome.storage.local.set({ scanMode: mode });
  });
});

document.querySelectorAll("#aiProviderToggle .provider-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const provider = btn.dataset.provider;
    if (provider === currentAiSettings.aiProvider) return;
    currentAiSettings.aiProvider = provider;
    updateAiProviderUI(provider);
    await sendMessage({ type: "SAVE_AI_SETTINGS", payload: { aiProvider: provider } });
    if (provider === "ollama") {
      populateOllamaModels(currentAiSettings.ollamaEndpoint);
    } else if (provider === "openai_compat") {
      populateOpenAiModels(currentAiSettings.openaiEndpoint, currentAiSettings.openaiApiKey);
    }
  });
});

$("refreshOllamaModelsBtn")?.addEventListener("click", async () => {
  const ep = $("ollamaEndpoint").value.trim() || currentAiSettings.ollamaEndpoint;
  populateOllamaModels(ep);
});

$("testOllamaBtn")?.addEventListener("click", async () => {
  const statusEl = $("ollamaConnStatus");
  if (statusEl) {
    statusEl.textContent = "Testing…";
    statusEl.className = "conn-status-text loading";
  }
  const ep = $("ollamaEndpoint").value.trim() || currentAiSettings.ollamaEndpoint;
  const res = await sendMessage({
    type: "TEST_AI_CONNECTION",
    payload: { provider: "ollama", endpoint: ep }
  });
  if (statusEl) {
    if (res?.ok) {
      statusEl.textContent = res.message || "Connected!";
      statusEl.className = "conn-status-text ok";
      if (Array.isArray(res.models) && res.models.length > 0) {
        populateOllamaModels(ep);
      }
    } else {
      statusEl.textContent = res?.error || "Offline";
      statusEl.className = "conn-status-text err";
    }
  }
});

$("refreshOpenAiModelsBtn")?.addEventListener("click", async () => {
  const ep = $("openaiEndpoint")?.value.trim() || currentAiSettings.openaiEndpoint;
  const key = $("openaiApiKeyInput")?.value.trim() || currentAiSettings.openaiApiKey;
  populateOpenAiModels(ep, key);
});

$("testOpenAiBtn")?.addEventListener("click", async () => {
  const statusEl = $("openaiConnStatus");
  if (statusEl) {
    statusEl.textContent = "Testing…";
    statusEl.className = "conn-status-text loading";
  }
  const ep = $("openaiEndpoint").value.trim() || currentAiSettings.openaiEndpoint;
  const model = $("openaiModelInput").value.trim() || currentAiSettings.openaiModel;
  const apiKey = $("openaiApiKeyInput").value.trim() || currentAiSettings.openaiApiKey;
  const res = await sendMessage({
    type: "TEST_AI_CONNECTION",
    payload: { provider: "openai_compat", endpoint: ep, model, apiKey }
  });
  if (statusEl) {
    if (res?.ok) {
      statusEl.textContent = res.message || "Connected!";
      statusEl.className = "conn-status-text ok";
      if (Array.isArray(res.models) && res.models.length > 0) {
        populateOpenAiModels(ep, apiKey);
      }
    } else {
      statusEl.textContent = res?.error || "Offline";
      statusEl.className = "conn-status-text err";
    }
  }
});

$("testGeminiBtn")?.addEventListener("click", async () => {
  const statusEl = $("geminiConnStatus");
  if (statusEl) {
    statusEl.textContent = "Testing…";
    statusEl.className = "conn-status-text loading";
  }
  const apiKey = $("geminiApiKeyInput")?.value.trim() || currentAiSettings.geminiApiKey;
  const model = $("geminiModelSelect")?.value || currentAiSettings.geminiModel || "gemini-3.7-flash";
  const res = await sendMessage({
    type: "TEST_AI_CONNECTION",
    payload: { provider: "gemini", apiKey, model }
  });
  if (statusEl) {
    if (res?.ok) {
      statusEl.textContent = res.message || "Connected!";
      statusEl.className = "conn-status-text ok";
    } else {
      statusEl.textContent = res?.error || "Offline";
      statusEl.className = "conn-status-text err";
    }
  }
});

$("geminiApiKeyInput")?.addEventListener("change", async () => {
  const key = $("geminiApiKeyInput").value.trim();
  currentAiSettings.geminiApiKey = key;
  await sendMessage({ type: "SAVE_AI_SETTINGS", payload: { geminiApiKey: key } });
  updateAiStatusDisplay();
});

$("geminiModelSelect")?.addEventListener("change", async () => {
  const model = $("geminiModelSelect").value;
  currentAiSettings.geminiModel = model;
  await sendMessage({ type: "SAVE_AI_SETTINGS", payload: { geminiModel: model } });
  updateAiStatusDisplay();
});

$("ollamaModelSelect")?.addEventListener("change", async () => {
  const model = $("ollamaModelSelect").value;
  currentAiSettings.ollamaModel = model;
  await sendMessage({ type: "SAVE_AI_SETTINGS", payload: { ollamaModel: model } });
  updateAiStatusDisplay();
});

$("ollamaEndpoint")?.addEventListener("change", async () => {
  const ep = $("ollamaEndpoint").value.trim();
  currentAiSettings.ollamaEndpoint = ep;
  await sendMessage({ type: "SAVE_AI_SETTINGS", payload: { ollamaEndpoint: ep } });
  populateOllamaModels(ep);
});

$("openaiEndpoint")?.addEventListener("change", async () => {
  const ep = $("openaiEndpoint").value.trim();
  currentAiSettings.openaiEndpoint = ep;
  await sendMessage({ type: "SAVE_AI_SETTINGS", payload: { openaiEndpoint: ep } });
});

$("openaiModelInput")?.addEventListener("change", async () => {
  const model = $("openaiModelInput").value.trim();
  currentAiSettings.openaiModel = model;
  await sendMessage({ type: "SAVE_AI_SETTINGS", payload: { openaiModel: model } });
  updateAiStatusDisplay();
});

$("openaiApiKeyInput")?.addEventListener("change", async () => {
  const key = $("openaiApiKeyInput").value.trim();
  currentAiSettings.openaiApiKey = key;
  await sendMessage({ type: "SAVE_AI_SETTINGS", payload: { openaiApiKey: key } });
});

$("profileNameInput").addEventListener("change", async () => {
  const curr = getSelectedProfile();
  if (!curr) return;
  const newName = $("profileNameInput").value.trim();
  if (!newName || newName === curr.name) return;

  curr.name = newName;
  await sendMessage({
    type: "SAVE_PROFILE",
    payload: {
      id: curr.id,
      name: newName,
      text: curr.text,
      skills: curr.skills,
      customSkills: curr.customSkills,
      yearsOfExperience: curr.yearsOfExperience
    }
  });
  renderProfilesUI();
  setStatus(`Profile renamed to "${newName}".`);
});

$("setActiveBtn").addEventListener("click", async () => {
  const curr = getSelectedProfile();
  if (!curr || curr.id === activeProfileId) return;

  const res = await sendMessage({ type: "SET_ACTIVE_PROFILE", payload: { profileId: curr.id } });
  if (res?.ok) {
    activeProfileId = curr.id;
    renderProfilesUI();
    setStatus(`"${curr.name}" is now your default active profile.`);
  }
});

$("deleteProfileBtn").addEventListener("click", async () => {
  const curr = getSelectedProfile();
  if (!curr || profiles.length <= 1) return;

  if (!confirm(`Delete profile "${curr.name}"? This cannot be undone.`)) return;

  isProcessing = true;
  setButtonsDisabled(true);
  setStatus("Deleting profile…");
  try {
    const res = await sendMessage({ type: "DELETE_PROFILE", payload: { profileId: curr.id } });
    if (res?.ok) {
      profiles = res.profiles;
      activeProfileId = res.activeProfileId;
      selectedProfileId = activeProfileId;
      populateSelectedProfile();
      setStatus(`Deleted profile. Active profile is now "${getSelectedProfile()?.name}".`);
    } else {
      setStatus(res?.error || "Could not delete profile", true);
    }
  } catch (err) {
    setStatus("Error deleting profile: " + err.message, true);
  } finally {
    isProcessing = false;
    setButtonsDisabled(false);
  }
});

async function handleResumeFile(file) {
  if (!file || isProcessing) return;
  isProcessing = true;
  setButtonsDisabled(true);
  setStatus("Reading file…");
  const dropzoneText = $("resumeFileLabel");
  if (dropzoneText) dropzoneText.textContent = file.name;
  try {
    let text;
    if (file.name.toLowerCase().endsWith(".pdf")) {
      const buf = await file.arrayBuffer();
      text = await extractPdfText(buf);
    } else {
      text = await file.text();
    }
    $("resumeText").value = text;
    setStatus(`Loaded ${file.name} (${text.length} characters). Review below, then click Save.`);
  } catch (err) {
    setStatus("Couldn't read that file: " + err.message, true);
    if (dropzoneText) dropzoneText.textContent = "Choose a file or drop it here";
  } finally {
    isProcessing = false;
    setButtonsDisabled(false);
  }
}

$("resumeFile").addEventListener("change", (e) => {
  handleResumeFile(e.target.files[0]);
});

const dropzone = $("resumeDropzone");
if (dropzone) {
  ["dragenter", "dragover"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("jm-dropzone--active");
    });
  });
  ["dragleave", "dragend"].forEach((evt) => {
    dropzone.addEventListener(evt, () => dropzone.classList.remove("jm-dropzone--active"));
  });
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("jm-dropzone--active");
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    try {
      $("resumeFile").files = e.dataTransfer.files;
    } catch (err) {
      // Some browsers disallow programmatically setting input.files; the
      // drag-drop still works since we process `file` directly below.
    }
    handleResumeFile(file);
  });
}

$("saveBtn").addEventListener("click", async () => {
  if (isProcessing) return;

  const text = $("resumeText").value.trim();
  if (!text) {
    setStatus("Paste or upload resume text first.", true);
    return;
  }

  const curr = getSelectedProfile();
  if (!curr) return;

  const name = $("profileNameInput").value.trim() || curr.name;

  isProcessing = true;
  setButtonsDisabled(true);
  const saveBtn = $("saveBtn");
  saveBtn.innerHTML = '<span class="btn-spinner"></span> Saving…';

  try {
    const customSkills = $("customSkills").value.split(",").map((s) => s.trim()).filter(Boolean);
    setStatus("Extracting skills for profile…");
    const skillResp = await sendMessage({ type: "EXTRACT_SKILLS", payload: { resumeText: text, customSkills } });
    const skills = skillResp?.skills || [];

    const saveResp = await sendMessage({
      type: "SAVE_PROFILE",
      payload: {
        id: curr.id,
        name,
        text,
        skills,
        customSkills,
        yearsOfExperience: curr.yearsOfExperience
      }
    });

    if (saveResp?.ok) {
      profiles = saveResp.profiles;
      activeProfileId = saveResp.activeProfileId;
      selectedProfileId = curr.id;
      setStatus(`Saved profile "${name}". Detected ${skills.length} skills. Cached results for this profile were refreshed.`);
      populateSelectedProfile();
    } else {
      setStatus(saveResp?.error || "Error saving profile", true);
    }
  } catch (err) {
    setStatus("Error saving resume: " + (err?.message || err), true);
  } finally {
    isProcessing = false;
    setButtonsDisabled(false);
    saveBtn.textContent = "Save resume";
  }
});

$("clearBtn").addEventListener("click", async () => {
  if (isProcessing) return;
  const curr = getSelectedProfile();
  if (!curr) return;

  await sendMessage({
    type: "SAVE_PROFILE",
    payload: { id: curr.id, name: curr.name, text: "", skills: [], customSkills: [], yearsOfExperience: null }
  });
  $("resumeFile").value = "";
  if ($("resumeFileLabel")) $("resumeFileLabel").textContent = "Choose a file or drop it here";
  $("resumeText").value = "";
  $("customSkills").value = "";
  setStatus(`Cleared resume text for profile "${curr.name}".`);
  loadExisting();
});

loadExisting();
