/**
 * Tenant Config Module (web/js/tenant-config.js)
 * Wczytuje data/tenant_config.json, aplikuje branding uczelni/wydziału,
 * kolory form zajęć oraz udostępnia flagi funkcji (features).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.TenantConfig = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DEFAULT_CONFIG = {
    id: "umg_wn",
    name: "Uniwersytet Morski w Gdyni — Wydział Nawigacyjny",
    short_name: "Plan Zajęć WN",
    icon: "⚓",
    theme_color: "#0d233a",
    institution: "UMG",
    faculty: "WN",
    locale: "pl",
    forms: {
      lecture: { label: "Wykład", badge_color: "#3b82f6" },
      exercise: { label: "Ćwiczenia", badge_color: "#10b981" },
      lab: { label: "Laboratorium", badge_color: "#ec4899" },
      simulator: { label: "Symulator", badge_color: "#f59e0b" },
      project: { label: "Projekt", badge_color: "#8b5cf6" },
      seminar: { label: "Seminarium", badge_color: "#6366f1" },
      elective: { label: "Fakultet", badge_color: "#14b8a6" },
      other: { label: "Inne", badge_color: "#64748b" }
    },
    features: {
      cross_reference: true,
      free_rooms: true,
      events: true,
      lesson_hiding: {
        enabled: true,
        bulk_electives_dialog: false
      },
      voting: {
        enabled: false,
        threshold: 10
      },
      changelog: true
    }
  };

  let currentConfig = { ...DEFAULT_CONFIG };

  function isFeatureEnabled(config, featurePath) {
    const cfg = config || currentConfig;
    const features = (cfg && cfg.features) || DEFAULT_CONFIG.features;
    const parts = String(featurePath).split(".");
    let cur = features;
    for (const part of parts) {
      if (cur === null || cur === undefined) return false;
      cur = cur[part];
    }
    if (cur && typeof cur === "object" && "enabled" in cur) {
      return Boolean(cur.enabled);
    }
    return Boolean(cur);
  }

  function applyBrandingToDOM(config, elements = {}) {
    if (typeof document === "undefined" || !config) return;
    const brandName = config.short_name || config.name;
    if (brandName) {
      document.title = brandName;
      const brandH1 = document.querySelector(".brand-titles h1");
      if (brandH1) brandH1.textContent = brandName;
    }

    if (config.icon && typeof document.querySelector === "function") {
      const favicon = document.querySelector('link[rel="icon"]');
      if (favicon && String(config.icon).length <= 4) {
        favicon.setAttribute(
          "href",
          `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>${encodeURIComponent(config.icon)}</text></svg>`
        );
      }
    }

    // Apply form badge colors as CSS variables on :root
    if (config.forms && document.documentElement && document.documentElement.style) {
      for (const [formKey, formMeta] of Object.entries(config.forms)) {
        if (formMeta && formMeta.badge_color) {
          document.documentElement.style.setProperty(`--form-${formKey}-color`, formMeta.badge_color);
        }
      }
    }

    // Toggle feature-gated UI controls
    if (elements.eventsBtn) {
      elements.eventsBtn.classList.toggle("hidden", !isFeatureEnabled(config, "events"));
    }
    if (elements.freeRoomsBtn) {
      elements.freeRoomsBtn.classList.toggle("hidden", !isFeatureEnabled(config, "free_rooms"));
    }
    if (elements.headerSearchBtn) {
      elements.headerSearchBtn.classList.toggle("hidden", !isFeatureEnabled(config, "cross_reference"));
    }
  }

  async function load(url = "data/tenant_config.json", stateObj = null, elements = {}) {
    try {
      if (typeof fetch !== "undefined") {
        const res = await fetch(url);
        if (res && res.ok) {
          const data = await res.json();
          currentConfig = {
            ...DEFAULT_CONFIG,
            ...data,
            features: {
              ...DEFAULT_CONFIG.features,
              ...(data.features || {})
            }
          };
          if (stateObj) {
            stateObj.tenantConfig = currentConfig;
            if (currentConfig.id) {
              stateObj.tenantId = currentConfig.id;
            }
          }
          applyBrandingToDOM(currentConfig, elements);
          return currentConfig;
        }
      }
    } catch (_) {
      // Fallback to default config
    }
    if (stateObj && !stateObj.tenantConfig) {
      stateObj.tenantConfig = currentConfig;
    }
    return currentConfig;
  }

  return {
    DEFAULT_CONFIG,
    get: () => currentConfig,
    load,
    applyBrandingToDOM,
    isFeatureEnabled
  };
});
