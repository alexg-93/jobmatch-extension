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
  $("profileYearsInput").value = (curr.yearsOfExperience !== null && curr.yearsOfExperience !== undefined) ? curr.yearsOfExperience : "";
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

  const availabilityResp = await sendMessage({ type: "GET_AI_AVAILABILITY" });
  const state = availabilityResp?.availability;
  const aiEl = $("aiStatus");
  if (state === "available" || state === "readily") {
    aiEl.textContent = "On-device AI: ready — matching runs locally, free, no data leaves this device.";
    aiEl.className = "ai-status ai-status--ok";
  } else if (state === "downloadable" || state === "downloading" || state === "after-download") {
    aiEl.textContent = "On-device AI: model downloading — using offline keyword matching until it's ready.";
    aiEl.className = "ai-status ai-status--pending";
  } else {
    aiEl.textContent = "On-device AI: not available on this Chrome build — using offline keyword matching.";
    aiEl.className = "ai-status ai-status--off";
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

$("resumeFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (isProcessing) return;
  isProcessing = true;
  setButtonsDisabled(true);
  setStatus("Reading file…");
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
  } finally {
    isProcessing = false;
    setButtonsDisabled(false);
  }
});

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
    const yearsVal = $("profileYearsInput").value.trim();
    const yearsOfExperience = yearsVal ? parseFloat(yearsVal) : null;
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
        yearsOfExperience
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
  $("resumeText").value = "";
  $("customSkills").value = "";
  $("profileYearsInput").value = "";
  setStatus(`Cleared resume text for profile "${curr.name}".`);
  loadExisting();
});

loadExisting();
