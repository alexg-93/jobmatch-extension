// content/base-adapter.js
// Shared driver for every JobMatch site adapter (linkedin.js, drushim.js,
// alljobs.js, comeet.js, greenhouse.js). Each adapter file only defines
// site-specific selectors/extraction and calls:
//
//   window.JobMatchAdapter.start({
//     extractJob,            // () => { title, description }
//     jobKeyFromUrl,         // () => string, a stable per-job cache key
//     isSpecificJobPage,     // () => boolean, true only on a single-job view
//     minDescriptionLength   // number, guards against analyzing a not-yet-loaded page
//   });
//
// This file owns the poll loop, scan-mode (auto/manual) handling, message
// round-trip to the background service worker, and reacting to resume/profile
// changes made in the popup — logic that used to be copy-pasted identically
// across every adapter file.

(function () {
  function startAdapter(config) {
    const { extractJob, jobKeyFromUrl, isSpecificJobPage, minDescriptionLength = 50 } = config;

    let currentJobKey = null;
    let analyzedJobKey = null;
    let isAnalyzing = false;
    let dismissedManualKey = null;
    let scanMode = "auto";
    let tickInterval = null;
    let debounceTimer = null;
    let observer = null;

    function stopPolling() {
      if (tickInterval) {
        clearInterval(tickInterval);
        tickInterval = null;
      }
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      if (observer) {
        observer.disconnect();
        observer = null;
      }
    }

    // SPA route/content changes (a new job selected, a description finishing
    // its async render) show up as DOM mutations, so react to those directly
    // instead of polling every 1.5s regardless of whether anything changed.
    // Debounced so a burst of mutations (e.g. a whole list re-rendering)
    // collapses into a single tick().
    function scheduleTick() {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(tick, 250);
    }

    function analyze(job, key, profileId = null, forceRefresh = false) {
      if (!chrome.runtime?.id) {
        stopPolling();
        window.JobMatchWidget?.renderError?.("Extension updated. Please refresh the page.");
        return;
      }

      isAnalyzing = true;
      window.JobMatchWidget.renderLoading(job.title);

      try {
        chrome.runtime.sendMessage(
          { type: "ANALYZE_JOB", payload: { url: key, title: job.title, description: job.description, profileId, forceRefresh } },
          (result) => {
            isAnalyzing = false;
            if (!chrome.runtime?.id || chrome.runtime.lastError) {
              analyzedJobKey = key;
              window.JobMatchWidget?.renderError?.("Extension updated. Please refresh the page.");
              stopPolling();
              return;
            }
            // Stale response from an earlier job switch
            if (currentJobKey !== key) return;

            if (!result) {
              analyzedJobKey = key;
              window.JobMatchWidget.renderError("No response from extension — try reloading the page.");
              return;
            }
            if (result.error) {
              // Allow re-try if no resume uploaded yet
              if (result.engine !== "none") {
                analyzedJobKey = key;
              }
              window.JobMatchWidget.renderError(result.error);
              return;
            }

            analyzedJobKey = key;
            window.JobMatchWidget.renderResult(
              result,
              (newProfileId) => {
                analyze(job, key, newProfileId);
              },
              () => {
                // Re-extract in case the page content changed since the last scan.
                analyze(extractJob(), key, profileId, true);
              }
            );
          }
        );
      } catch (err) {
        isAnalyzing = false;
        stopPolling();
        window.JobMatchWidget?.renderError?.("Extension updated. Please refresh the page.");
      }
    }

    function tick() {
      if (!chrome.runtime?.id) {
        stopPolling();
        return;
      }

      if (!isSpecificJobPage()) {
        window.JobMatchWidget?.hide?.();
        window.JobMatchWidget?.hideManualButton?.();
        return;
      }

      const key = jobKeyFromUrl();

      // If switched to a new job, reset analysis state for the new job
      if (key !== currentJobKey) {
        currentJobKey = key;
        analyzedJobKey = null;
        dismissedManualKey = null;
      }

      const job = extractJob();
      if (!job.description || job.description.length < minDescriptionLength) return; // not loaded yet

      if (scanMode === "manual") {
        if (analyzedJobKey === key) {
          window.JobMatchWidget?.hideManualButton?.();
          return;
        }
        if (isAnalyzing) {
          window.JobMatchWidget?.hideManualButton?.();
          return;
        }
        if (dismissedManualKey === key) {
          // User closed the manual button on this job: keep it hidden!
          return;
        }
        window.JobMatchWidget?.showManualButton?.(
          () => {
            window.JobMatchWidget?.hideManualButton?.();
            analyze(job, key);
          },
          () => {
            dismissedManualKey = key;
          }
        );
        return;
      }

      window.JobMatchWidget?.hideManualButton?.();

      // Already analyzed and outputted: stop immediately, do not loop
      if (analyzedJobKey === key) return;

      // Analysis is currently in progress: wait for it to complete
      if (isAnalyzing) return;

      analyze(job, key);
    }

    // When the user updates their resume, profiles, or scan mode in the popup, update active tab
    if (typeof chrome !== "undefined") {
      chrome.storage?.onChanged?.addListener((changes, area) => {
        if (area === "local") {
          if (changes.resume || changes.activeProfileId || changes.profiles) {
            analyzedJobKey = null;
            tick();
          }
          if (changes.scanMode) {
            scanMode = changes.scanMode.newValue || "auto";
            tick();
          }
        }
      });
    }

    // Don't start ticking until the real scanMode is known — chrome.storage.local.get
    // is async, and the very first tick() must not run against the "auto" default
    // while the actual (possibly "manual") value is still in flight, or it can
    // auto-analyze and mark the job as already-analyzed before manual mode ever
    // gets a chance to show its scan button.
    function startTicking() {
      if (typeof MutationObserver !== "undefined") {
        observer = new MutationObserver(scheduleTick);
        observer.observe(document.documentElement, { childList: true, subtree: true });
      }

      // Low-frequency safety net: catches route changes that don't trigger an
      // observable DOM mutation (rare) and the very first render. Far cheaper
      // than the previous unconditional 1.5s poll.
      tickInterval = setInterval(tick, 4000);
      tick();
    }

    if (typeof chrome !== "undefined") {
      try {
        chrome.storage?.local?.get("scanMode", (data) => {
          if (data?.scanMode) scanMode = data.scanMode;
          startTicking();
        });
      } catch (e) {
        // context invalidated
        startTicking();
      }
    } else {
      startTicking();
    }

    return { tick };
  }

  window.JobMatchAdapter = { start: startAdapter };
})();
