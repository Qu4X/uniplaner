/**
 * Tenant Config Module (web/js/tenant-config.js)
 * Wczytuje data/tenant_config.json, aplikuje branding uczelni/wydziału,
 * dynamicznie buduje legendę form zajęć oraz udostępnia flagi funkcji (features).
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
    institution_full: "Uniwersytet Morski w Gdyni (UMG)",
    faculty: "WN",
    faculty_full: "Wydział Nawigacyjny",
    source_url: "https://arktur.umg.edu.pl/planyzaj/strpza5.php",
    source_label: "arktur.umg.edu.pl",
    locale: "pl",
    tally_form_id: "2E2vNj",
    forms: {
      lecture:   { label: "Wykład",       abbr: "W",    badge_color: "#2563eb" },
      exercise:  { label: "Ćwiczenia",    abbr: "Ćw",   badge_color: "#059669" },
      lab:       { label: "Laboratorium", abbr: "Lab",  badge_color: "#7c3aed" },
      simulator: { label: "Symulator",    abbr: "Sym",  badge_color: "#d97706" },
      project:   { label: "Projekt",      abbr: "Pr",   badge_color: "#8b5cf6" },
      seminar:   { label: "Seminarium",   abbr: "Sem",  badge_color: "#6366f1" },
      elective:  { label: "Fakultet",     abbr: "Fak",  badge_color: "#0d9488" },
      other:     { label: "Inne",         abbr: "Inne", badge_color: "#6b7280" }
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

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

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
      if (typeof document.querySelector === "function") {
        const brandH1 = document.querySelector(".brand-titles h1");
        if (brandH1) brandH1.textContent = brandName;
      }
    }

    if (config.icon && typeof document.querySelector === "function" && String(config.icon).length <= 4) {
      const svgIconUri = `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>${encodeURIComponent(config.icon)}</text></svg>`;
      const favicon = document.querySelector('link[rel="icon"]');
      if (favicon) {
        favicon.setAttribute("href", svgIconUri);
      }
      if (config.id && config.id !== "umg_wn") {
        const brandLogo = document.querySelector(".brand-logo");
        if (brandLogo) {
          brandLogo.setAttribute("src", svgIconUri);
        }
        const aboutLogo = document.querySelector("#about-logo-badge img");
        if (aboutLogo) {
          aboutLogo.setAttribute("src", svgIconUri);
        }
      }
    }

    // Apply form badge colors as CSS variables on :root and render dynamic legend
    if (config.forms && typeof config.forms === "object") {
      if (document.documentElement && document.documentElement.style) {
        for (const [formKey, formMeta] of Object.entries(config.forms)) {
          if (formMeta && formMeta.badge_color) {
            document.documentElement.style.setProperty(`--form-${formKey}-color`, formMeta.badge_color);
          }
        }
      }

      if (typeof document.getElementById === "function") {
        const previewEl = document.getElementById("legend-preview-dots");
        const listEl = document.getElementById("legend-items-list");
        const formEntries = Object.entries(config.forms);
        if (previewEl && listEl && formEntries.length > 0) {
          previewEl.innerHTML = formEntries
            .map(([key, meta]) => {
              const label = escapeHtml((meta && meta.label) || key);
              const color = escapeHtml((meta && meta.badge_color) || "");
              const styleAttr = color ? ` style="background-color: ${color};"` : "";
              return `<span class="legend-dot form-${escapeHtml(key)}" title="${label}"${styleAttr}></span>`;
            })
            .join("");

          listEl.innerHTML = formEntries
            .map(([key, meta]) => {
              const label = escapeHtml((meta && meta.label) || key);
              const abbr = escapeHtml((meta && meta.abbr) || label.slice(0, 3));
              const color = escapeHtml((meta && meta.badge_color) || "");
              const borderStyle = color ? ` style="border-left-color: ${color};"` : "";
              const abbrStyle = color ? ` style="color: ${color};"` : "";
              return `<li class="legend-item form-${escapeHtml(key)}"${borderStyle}>
                <span class="legend-label"><strong class="legend-abbr"${abbrStyle}>${abbr}</strong> ${label}</span>
              </li>`;
            })
            .join("");
        }
      }
    }

    // Dynamic footer & about modal branding
    if (typeof document.getElementById === "function") {
      const aboutTitle = document.getElementById("about-modal-title");
      if (aboutTitle && brandName) aboutTitle.textContent = `O aplikacji ${brandName}`;

      const aboutAppName = document.getElementById("about-app-name");
      if (aboutAppName && brandName) aboutAppName.textContent = brandName;

      const sourceUrl = config.source_url || "https://arktur.umg.edu.pl/planyzaj/strpza5.php";
      const sourceLabel = config.source_label || "systemu uczelni";
      for (const linkId of ["about-source-link", "about-disclaimer-link", "footer-source-link"]) {
        const linkEl = document.getElementById(linkId);
        if (linkEl) {
          linkEl.setAttribute("href", sourceUrl);
          linkEl.textContent = sourceLabel;
        }
      }

      const instFull = config.institution_full || config.name || config.institution || "uczelnię";
      const instShort = config.institution || "Uczelnia";
      const disclaimerInst = document.getElementById("about-disclaimer-inst");
      if (disclaimerInst) disclaimerInst.textContent = instFull;

      const disclaimerTm = document.getElementById("about-disclaimer-trademark");
      if (disclaimerTm) {
        disclaimerTm.textContent = `Wszelkie nazwy własne, skróty i znaki (w tym „${instShort}” oraz „${instFull}”) należą do ich prawnych właścicieli i zostały użyte wyłącznie w celach informacyjnych oraz identyfikacyjnych.`;
      }

      const footerFaculty = document.getElementById("footer-faculty-label");
      if (footerFaculty && config.faculty) {
        footerFaculty.textContent = `Projekt nieoficjalny dla studentów ${config.faculty}.`;
      }

      const tallyBtn = document.getElementById("about-tally-btn");
      if (tallyBtn) {
        if (config.tally_form_id) {
          tallyBtn.setAttribute("href", `https://tally.so/r/${config.tally_form_id}`);
          tallyBtn.setAttribute("data-tally-open", config.tally_form_id);
          tallyBtn.classList.remove("hidden");
        } else {
          tallyBtn.classList.add("hidden");
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
    const bulkElectivesEnabled = isFeatureEnabled(config, "lesson_hiding.bulk_electives_dialog");
    if (elements.electivesBtn) {
      elements.electivesBtn.classList.toggle("hidden", !bulkElectivesEnabled);
    }
    if (elements.bannerElectivesBtn) {
      elements.bannerElectivesBtn.classList.toggle("hidden", !bulkElectivesEnabled);
    }
    const votingEnabled = isFeatureEnabled(config, "voting");
    if (elements.proposeBtn) {
      elements.proposeBtn.classList.toggle("hidden", !votingEnabled);
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
