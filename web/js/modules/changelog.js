/**
 * Changelog Module (web/js/modules/changelog.js)
 * Moduł powiadomień o nowościach ("Co nowego w aplikacji?").
 * Sterowany flagą tenant_config.features.changelog.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ChangelogModule = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const LEGACY_CHANGELOG_KEY = "last_seen_changelog_version";
  let currentPendingChangelogVersion = null;

  function defaultEscapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function extractMajorMinor(ver) {
    if (!ver) return "";
    const match = String(ver).trim().match(/^v?(\d+\.\d+)/);
    return match ? match[1] : String(ver).trim();
  }

  function shouldShowChangelog(latestVersion, lastSeenVersion) {
    if (!latestVersion) return false;
    if (!lastSeenVersion) return true;
    return extractMajorMinor(latestVersion) !== extractMajorMinor(lastSeenVersion);
  }

  function openChangelogModal(changelogEntry, elements = {}, escapeHtmlFn = defaultEscapeHtml) {
    if (!elements.changelogModal || !changelogEntry) return;

    currentPendingChangelogVersion = changelogEntry.version || null;

    if (elements.changelogVersionBadge) {
      elements.changelogVersionBadge.textContent = changelogEntry.version
        ? `Wersja ${changelogEntry.version}`
        : "Aktualizacja";
    }

    if (elements.changelogDate) {
      elements.changelogDate.textContent = changelogEntry.date || "";
    }

    if (elements.changelogFeaturesList) {
      const features = Array.isArray(changelogEntry.features) ? changelogEntry.features : [];
      elements.changelogFeaturesList.innerHTML = features
        .map((feat) => `<li>${escapeHtmlFn(feat)}</li>`)
        .join("");
    }

    if (typeof elements.changelogModal.showModal === "function") {
      elements.changelogModal.showModal();
    } else if (elements.changelogModal.classList) {
      elements.changelogModal.classList.remove("hidden");
    }
  }

  function closeChangelogModal(elements = {}, tenantId = "umg_wn") {
    if (!elements.changelogModal) return;

    if (currentPendingChangelogVersion) {
      try {
        if (typeof localStorage !== "undefined") {
          const scopedKey = `${tenantId || "umg_wn"}_${LEGACY_CHANGELOG_KEY}`;
          localStorage.setItem(scopedKey, currentPendingChangelogVersion);
          if (!tenantId || tenantId === "umg_wn") {
            localStorage.setItem(LEGACY_CHANGELOG_KEY, currentPendingChangelogVersion);
          }
        }
      } catch (e) {
        console.warn("Could not save seen changelog version to localStorage:", e);
      }
      currentPendingChangelogVersion = null;
    }

    if (typeof elements.changelogModal.close === "function") {
      elements.changelogModal.close();
    } else if (elements.changelogModal.classList) {
      elements.changelogModal.classList.add("hidden");
    }
  }

  async function checkChangelogNotification(options = {}) {
    const {
      elements = {},
      escapeHtmlFn = defaultEscapeHtml,
      tenantId = "umg_wn",
      enabled = true
    } = options;

    if (!enabled) return;

    try {
      const response = await fetch("changelog.json");
      if (!response.ok) return;

      const changelogs = await response.json();
      if (!Array.isArray(changelogs) || changelogs.length === 0) return;

      const latest = changelogs[0];
      if (!latest || !latest.version) return;

      let lastSeen = null;
      try {
        if (typeof localStorage !== "undefined") {
          const scopedKey = `${tenantId || "umg_wn"}_${LEGACY_CHANGELOG_KEY}`;
          lastSeen = localStorage.getItem(scopedKey);
          if (!lastSeen && (!tenantId || tenantId === "umg_wn")) {
            lastSeen = localStorage.getItem(LEGACY_CHANGELOG_KEY);
          }
        }
      } catch (_) {
        // LocalStorage might be disabled
      }

      if (shouldShowChangelog(latest.version, lastSeen)) {
        openChangelogModal(latest, elements, escapeHtmlFn);
      }
    } catch (err) {
      console.debug("Changelog check skipped or failed:", err);
    }
  }

  return {
    LEGACY_CHANGELOG_KEY,
    extractMajorMinor,
    shouldShowChangelog,
    openChangelogModal,
    closeChangelogModal,
    checkChangelogNotification
  };
});
