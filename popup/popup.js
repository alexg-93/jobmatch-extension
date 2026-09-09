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

async function loadExisting() {
  const resumeResp = await sendMessage({ type: "GET_RESUME" });
  const resume = resumeResp?.resume;
  if (resume && resume.text) {
    $("resumeText").value = resume.text;
    $("resumeInfo").textContent =
      `Saved resume: ${resume.text.length} characters, ${resume.skills?.length || 0} detected skills` +
      (resume.savedAt ? ` · saved ${new Date(resume.savedAt).toLocaleString()}` : "");
    $("customSkills").value = (resume.customSkills || []).join(", ");
  } else {
    $("resumeInfo").textContent = "No resume saved yet.";
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

let isProcessing = false;

function setButtonsDisabled(disabled) {
  $("saveBtn").disabled = disabled;
  $("clearBtn").disabled = disabled;
  $("resumeFile").disabled = disabled;
}

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
    setStatus(`Loaded ${file.name} (${text.length} characters). Review below, then Save.`);
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

  isProcessing = true;
  setButtonsDisabled(true);
  const saveBtn = $("saveBtn");
  saveBtn.innerHTML = '<span class="btn-spinner"></span> Saving…';

  try {
    const customSkills = $("customSkills").value.split(",").map((s) => s.trim()).filter(Boolean);
    setStatus("Extracting skills…");
    const skillResp = await sendMessage({ type: "EXTRACT_SKILLS", payload: { resumeText: text, customSkills } });
    const skills = skillResp?.skills || [];

    const resume = { text, skills, customSkills, savedAt: Date.now() };
    await sendMessage({ type: "SAVE_RESUME", payload: resume });
    setStatus(`Saved. Detected ${skills.length} skills. Cached job results were cleared so they'll be re-scored against this resume.`);
    await loadExisting();
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
  await sendMessage({ type: "SAVE_RESUME", payload: { text: "", skills: [], customSkills: [] } });
  $("resumeFile").value = "";
  $("resumeText").value = "";
  $("customSkills").value = "";
  setStatus("Resume cleared.");
  loadExisting();
});

loadExisting();
