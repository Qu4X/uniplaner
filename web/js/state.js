/**
 * State Module (web/js/state.js)
 * Centralny stan aplikacji oraz obsługa izolowanego localStorage z prefiksem tenanta
 * i jednorazową migracją starszych kluczy dla domyślnego tenanta UMG WN.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.AppState = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DEFAULT_TENANT_ID = "umg_wn";

  function getTenantId(stateObj = null) {
    const s = stateObj || state;
    if (s && s.tenantConfig && s.tenantConfig.id) {
      return s.tenantConfig.id;
    }
    if (s && s.tenantId) {
      return s.tenantId;
    }
    return DEFAULT_TENANT_ID;
  }

  function getStorageKey(key, tenantId = null) {
    const tid = tenantId || getTenantId();
    return `${tid}_${key}`;
  }

  function getStorageItem(key, legacyKey = null, tenantId = null) {
    if (typeof localStorage === "undefined") return null;
    const tid = tenantId || getTenantId();
    const scopedKey = `${tid}_${key}`;
    try {
      const val = localStorage.getItem(scopedKey);
      if (val !== null && val !== undefined) {
        return val;
      }
      if (tid === DEFAULT_TENANT_ID && legacyKey) {
        const legacyVal = localStorage.getItem(legacyKey);
        if (legacyVal !== null && legacyVal !== undefined) {
          localStorage.setItem(scopedKey, legacyVal);
          return legacyVal;
        }
      }
    } catch (_) {
      // localStorage niedostępny
    }
    return null;
  }

  function setStorageItem(key, value, legacyKey = null, tenantId = null) {
    if (typeof localStorage === "undefined") return;
    const tid = tenantId || getTenantId();
    const scopedKey = `${tid}_${key}`;
    try {
      localStorage.setItem(scopedKey, String(value));
      if (tid === DEFAULT_TENANT_ID && legacyKey) {
        localStorage.setItem(legacyKey, String(value));
      }
    } catch (_) {
      // localStorage niedostępny
    }
  }

  function removeStorageItem(key, legacyKey = null, tenantId = null) {
    if (typeof localStorage === "undefined") return;
    const tid = tenantId || getTenantId();
    const scopedKey = `${tid}_${key}`;
    try {
      localStorage.removeItem(scopedKey);
      if (tid === DEFAULT_TENANT_ID && legacyKey) {
        localStorage.removeItem(legacyKey);
      }
    } catch (_) {
      // localStorage niedostępny
    }
  }

  const savedDaysView =
    getStorageItem("days_view", "umg_days_view", DEFAULT_TENANT_ID) ||
    (typeof localStorage !== "undefined" && localStorage.getItem("umg_show_weekends") === "true"
      ? "all"
      : "workdays");

  const savedStudyMode =
    getStorageItem("study_mode", "umg_study_mode", DEFAULT_TENANT_ID) || "stacjonarne";

  const savedTheme = getStorageItem("theme", "umg_theme", DEFAULT_TENANT_ID);
  const themeMode = (savedTheme === "light" || savedTheme === "dark") ? savedTheme : "system";
  const systemPrefersDark =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const effectiveTheme =
    themeMode === "system" ? (systemPrefersDark ? "dark" : "light") : themeMode;

  const state = {
    tenantId: DEFAULT_TENANT_ID,
    tenantConfig: null,
    plansData: null,
    studyMode: savedStudyMode, // "stacjonarne" | "niestacjonarne"
    selectedPlanId: null,
    selectedGroup: null,
    scheduleData: null,
    crossRefData: null,
    weekOffset: 0,
    daysView: savedDaysView, // "workdays" | "active_only" | "all"
    selectedDayTab: "ALL",
    dismissedDuplicatePlans: new Set(),
    dismissedModificationPlans: new Set(),
    hiddenLessonSlots: new Set(),
    previewHiddenLessons: false,
    dismissedHiddenLessonsBanner: false,
    proposals: [],
    userVotes: new Set(),
    themeMode,
    theme: effectiveTheme
  };

  return {
    DEFAULT_TENANT_ID,
    state,
    get: () => state,
    getTenantId,
    getStorageKey,
    getStorageItem,
    setStorageItem,
    removeStorageItem
  };
});
