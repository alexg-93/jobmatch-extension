// content/widget.js
// Injects and updates a small floating panel on the job page. Loaded before
// the site-specific script (linkedin.js / drushim.js), which calls into
// window.JobMatchWidget.

(function () {
  const WIDGET_ID = "jobmatch-widget-root";

  function ensureRoot() {
    let root = document.getElementById(WIDGET_ID);
    if (!root) {
      root = document.createElement("div");
      root.id = WIDGET_ID;
      document.documentElement.appendChild(root);
    }
    root.style.display = "block";
    return root;
  }

  function hide() {
    const root = document.getElementById(WIDGET_ID);
    if (root) root.style.display = "none";
  }

  function colorForPercent(pct) {
    if (pct === null || pct === undefined) return "var(--jm-neutral)";
    if (pct >= 75) return "var(--jm-good)";
    if (pct >= 45) return "var(--jm-mid)";
    return "var(--jm-low)";
  }

  function renderLoading(title = "") {
    const root = ensureRoot();
    root.style.display = "block";
    root.innerHTML = `
      <div class="jm-panel jm-panel--loading">
        <div class="jm-spinner"></div>
        <div class="jm-loading-text">
          <span>Analyzing match…</span>
          ${title ? `<div class="jm-scanned-title" title="${escapeHtml(title)}">${escapeHtml(title)}</div>` : ""}
        </div>
        <button class="jm-close" title="Dismiss">×</button>
      </div>`;
    root.querySelector(".jm-close")?.addEventListener("click", () => (root.style.display = "none"));
  }

  function renderError(message) {
    const root = ensureRoot();
    root.style.display = "block";
    root.innerHTML = `
      <div class="jm-panel jm-panel--error">
        <div class="jm-header">
          <span class="jm-title">JobMatch</span>
          <button class="jm-close" title="Dismiss">×</button>
        </div>
        <div class="jm-body">${escapeHtml(message)}</div>
      </div>`;
    root.querySelector(".jm-close")?.addEventListener("click", () => (root.style.display = "none"));
  }

  function renderResult(result, onProfileSwitch, onRefresh) {
    const root = ensureRoot();
    root.style.display = "block";
    const pct = result.matchPercent;
    const pctLabel = pct === null || pct === undefined ? "—" : `${pct}%`;
    const missing = result.missingSkills || [];
    const suggestions = result.suggestions || [];
    let engineLabel = "on-device AI";
    if (result.engine?.startsWith("gemini:")) {
      const model = result.engine.replace("gemini:", "");
      engineLabel = `Gemini (${model})`;
    } else if (result.engine?.startsWith("ollama:")) {
      const model = result.engine.replace("ollama:", "");
      engineLabel = `Ollama (${model})`;
    } else if (result.engine?.startsWith("local-ai:")) {
      const model = result.engine.replace("local-ai:", "");
      engineLabel = `Local AI (${model})`;
    } else if (result.engine === "ai") {
      engineLabel = "on-device AI";
    } else if (result.engine === "keyword") {
      engineLabel = "keyword match";
    } else if (result.engine) {
      engineLabel = result.engine;
    }
    const jobTitle = result.jobTitle || "";
    const profiles = result.profiles || [];
    const activeProfileId = result.activeProfileId || result.profileId;
    const hasMultipleProfiles = profiles.length > 1;

    const strengths = result.strengths || [];
    const gaps = result.gaps || [];

    root.innerHTML = `
      <div class="jm-panel">
        <div class="jm-header">
          <div class="jm-header-text">
            <span class="jm-title">JobMatch</span>
            ${jobTitle ? `<div class="jm-scanned-title" title="${escapeHtml(jobTitle)}">${escapeHtml(jobTitle)}</div>` : ""}
          </div>
          <div class="jm-header-actions">
            <button class="jm-refresh" title="Run a fresh analysis (ignore cached result)">⟳</button>
            <button class="jm-close" title="Dismiss">×</button>
          </div>
        </div>
        ${hasMultipleProfiles ? `
          <div class="jm-profile-bar">
            <span class="jm-profile-label">CV:</span>
            <select class="jm-profile-select" title="Switch resume profile">
              ${profiles.map((p) => `
                <option value="${escapeHtml(p.id)}" ${p.id === activeProfileId ? "selected" : ""}>
                  ${escapeHtml(p.name)}${!p.hasResume ? " (empty)" : ""}
                </option>
              `).join("")}
            </select>
          </div>
        ` : (result.profileName && result.profileName !== "Primary Profile" ? `
          <div class="jm-profile-bar">
            <span class="jm-profile-tag">${escapeHtml(result.profileName)}</span>
          </div>
        ` : "")}
        <div class="jm-score-row">
          <div class="jm-score" style="color:${colorForPercent(pct)}">${pctLabel}</div>
          <div class="jm-score-label">match${engineLabel ? ` · ${engineLabel}` : ""}</div>
        </div>
        ${result.fallbackNote ? `<div class="jm-fallback-note">ℹ️ ${escapeHtml(result.fallbackNote)}</div>` : ""}
        ${result.note ? `<div class="jm-note">${escapeHtml(result.note)}</div>` : ""}
        ${strengths.length ? `
          <div class="jm-section jm-section--strengths">
            <div class="jm-section-title jm-title--strengths">Key Strengths</div>
            <ul class="jm-list jm-strengths">
              ${strengths.map((s) => `
                <li class="jm-item jm-strength-item">
                  <span class="jm-strength-bullet">✓</span>
                  <span class="jm-item-text" dir="auto">${escapeHtml(cleanSuggestionText(s))}</span>
                </li>
              `).join("")}
            </ul>
          </div>` : ""}
        ${gaps.length ? `
          <div class="jm-section jm-section--gaps">
            <div class="jm-section-title jm-title--gaps">Gaps & Weaknesses</div>
            <ul class="jm-list jm-gaps">
              ${gaps.map((g) => `
                <li class="jm-item jm-gap-item">
                  <span class="jm-gap-bullet">!</span>
                  <span class="jm-item-text" dir="auto">${escapeHtml(cleanSuggestionText(g))}</span>
                </li>
              `).join("")}
            </ul>
          </div>` : ""}
        ${missing.length ? `
          <div class="jm-section">
            <div class="jm-section-title">Missing / not detected</div>
            <div class="jm-tags">
              ${missing.map((s) => `<span class="jm-tag jm-tag--missing">${escapeHtml(s)}</span>`).join("")}
            </div>
          </div>` : ""}
        ${suggestions.length ? `
          <div class="jm-section">
            <div class="jm-section-title">How to Bridge the Gaps</div>
            <ul class="jm-suggestions">
              ${suggestions.map((s) => {
                const cleaned = cleanSuggestionText(s);
                return `
                <li class="jm-suggestion-item">
                  <span class="jm-suggestion-bullet">•</span>
                  <span class="jm-suggestion-text" dir="auto">${escapeHtml(cleaned)}</span>
                </li>`;
              }).join("")}
            </ul>
          </div>` : ""}
      </div>`;

    root.querySelector(".jm-close")?.addEventListener("click", () => (root.style.display = "none"));

    if (typeof onRefresh === "function") {
      root.querySelector(".jm-refresh")?.addEventListener("click", () => onRefresh());
    }

    if (hasMultipleProfiles && typeof onProfileSwitch === "function") {
      root.querySelector(".jm-profile-select")?.addEventListener("change", (e) => {
        onProfileSwitch(e.target.value);
      });
    }
  }

  function cleanSuggestionText(text) {
    let s = (text || "").trim();
    while (/^(\d+[.)]|[•*\-–—])\s*/.test(s)) {
      s = s.replace(/^(\d+[.)]|[•*\-–—])\s*/, "").trim();
    }
    return s;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  // Floating Manual Scan Trigger
  const MANUAL_BTN_ID = "jobmatch-manual-btn-root";
  let manualRoot = null;
  let isDraggingManual = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let elemStartX = 0;
  let elemStartY = 0;
  let hasMoved = false;

  function ensureManualRoot() {
    if (!manualRoot || !document.getElementById(MANUAL_BTN_ID)) {
      manualRoot = document.getElementById(MANUAL_BTN_ID);
      if (!manualRoot) {
        manualRoot = document.createElement("div");
        manualRoot.id = MANUAL_BTN_ID;
        document.documentElement.appendChild(manualRoot);
        setupManualDrag(manualRoot);
      }
    }
    return manualRoot;
  }

  function setupManualDrag(el) {
    el.addEventListener("mousedown", onDragStart);
  }

  function onDragStart(e) {
    if (e.target.closest(".jm-manual-close-btn")) return;

    isDraggingManual = true;
    hasMoved = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;

    const rect = manualRoot.getBoundingClientRect();
    elemStartX = rect.left;
    elemStartY = rect.top;

    manualRoot.classList.add("jm-dragging");

    window.addEventListener("mousemove", onDragMove, { passive: false });
    window.addEventListener("mouseup", onDragEnd);
  }

  function onDragMove(e) {
    if (!isDraggingManual) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      hasMoved = true;
    }

    let newLeft = elemStartX + dx;
    let newTop = elemStartY + dy;

    const rect = manualRoot.getBoundingClientRect();
    const maxLeft = window.innerWidth - rect.width - 5;
    const maxTop = window.innerHeight - rect.height - 5;

    newLeft = Math.max(5, Math.min(newLeft, maxLeft));
    newTop = Math.max(5, Math.min(newTop, maxTop));

    manualRoot.style.left = `${newLeft}px`;
    manualRoot.style.top = `${newTop}px`;
    manualRoot.style.right = "auto";
    manualRoot.style.bottom = "auto";
  }

  function onDragEnd() {
    isDraggingManual = false;
    manualRoot?.classList.remove("jm-dragging");
    window.removeEventListener("mousemove", onDragMove);
    window.removeEventListener("mouseup", onDragEnd);
  }

  function showManualButton(onScanClick, onCloseClick) {
    const root = ensureManualRoot();
    if (root.style.display === "flex") {
      return; // already visible, don't recreate DOM
    }
    root.style.display = "flex";
    root.innerHTML = `
      <div class="jm-manual-drag-handle" title="Drag to reposition">⋮⋮</div>
      <button class="jm-manual-action-btn" title="Analyze job match with resume">
        <span>✨</span> Scan Job
      </button>
      <button class="jm-manual-close-btn" title="Dismiss">×</button>
    `;

    const actionBtn = root.querySelector(".jm-manual-action-btn");
    actionBtn?.addEventListener("click", () => {
      if (hasMoved) {
        hasMoved = false;
        return;
      }
      onScanClick?.();
    });

    const closeBtn = root.querySelector(".jm-manual-close-btn");
    closeBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      hideManualButton();
      onCloseClick?.();
    });
  }

  function hideManualButton() {
    const root = document.getElementById(MANUAL_BTN_ID);
    if (root) root.style.display = "none";
  }

  window.JobMatchWidget = {
    renderLoading,
    renderError,
    renderResult,
    hide,
    showManualButton,
    hideManualButton
  };
})();
