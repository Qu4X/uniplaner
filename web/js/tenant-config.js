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


  const CURATED_MOTIFS = ["nautical", "logistics", "veterinary", "medicine", "engineering", "it", "general"];

  const INSTITUTION_DEFAULT_MOTIFS = {
    umg: ["nautical", "logistics"],
    morski: ["nautical", "logistics"],
    nawigac: ["nautical", "logistics"],
    sggw: ["veterinary", "medicine"],
    weteryn: ["veterinary", "medicine"],
    agh: ["engineering", "it"],
    politechn: ["engineering", "it"]
  };

  const MOTIF_ICONS = {
    nautical: ["anchor", "ship", "compass", "helm", "lighthouse", "waves"],
    logistics: ["truck", "box", "crane", "plane"],
    veterinary: ["paw", "bone", "syringe", "flask"],
    medicine: ["flask", "syringe", "paw", "book"],
    engineering: ["gear", "laptop", "crane", "box"],
    it: ["laptop", "gear", "calendar", "book"],
    general: ["calendar", "book", "gradCap", "building"]
  };

  const ICON_PATHS = {
    anchor: '<circle cx="32" cy="14" r="5"></circle><path d="M32 19 V53 M23 27 H41 M13 39 Q15 54 32 54 Q49 54 51 39 M13 39 L7 45 M13 39 L19 44 M51 39 L45 44 M51 39 L57 45"></path>',
    ship: '<path d="M9 39 H55 L49 51 Q32 55 15 51 Z M18 39 V31 H46 V39 M26 31 V23 H38 V31 M30 23 V15 H34 V23 M23 35 H23.1 M32 35 H32.1 M41 35 H41.1"></path>',
    compass: '<circle cx="32" cy="32" r="22"></circle><path d="M32 14 L37 32 L32 50 L27 32 Z M32 6 V10 M32 54 V58 M6 32 H10 M54 32 H58"></path>',
    helm: '<circle cx="32" cy="32" r="18"></circle><circle cx="32" cy="32" r="6"></circle><path d="M32 6 V26 M32 38 V58 M6 32 H26 M38 32 H58 M14 14 L28 28 M36 36 L50 50 M50 14 L36 28 M28 36 L14 50"></path>',
    lighthouse: '<path d="M25 54 L28 23 H36 L39 54 Z M26 38 H38 M27 23 V17 H37 V23 M26 17 L32 10 L38 17 M43 19 H53 M43 14 L52 10 M43 24 L52 28 M20 54 H44"></path>',
    waves: '<path d="M6 25 Q13 18 20 25 T34 25 T48 25 T62 25 M6 37 Q13 30 20 37 T34 37 T48 37 T62 37 M6 49 Q13 42 20 49 T34 49 T48 49 T62 49"></path>',
    truck: '<path d="M7 22 H37 V43 H7 Z M37 29 H48 L56 37 V43 H37"></path><circle cx="17" cy="46" r="4.5"></circle><circle cx="47" cy="46" r="4.5"></circle>',
    box: '<path d="M12 21 L32 11 L52 21 V43 L32 53 L12 43 Z M12 21 L32 31 L52 21 M32 31 V53"></path>',
    crane: '<path d="M20 54 V14 M28 54 V14 M20 47 L28 40 L20 33 L28 26 L20 19 M10 14 H54 M13 14 V22 H20 M48 14 V35 M44 35 H52 V39 H44 Z M16 54 H32"></path>',
    plane: '<path d="M32 7 Q35 11 35 20 V29 L56 41 V47 L35 41 V51 L41 55 V59 L32 56 L23 59 V55 L29 51 V41 L8 47 V41 L29 29 V20 Q29 11 32 7 Z"></path>',
    calendar: '<path d="M12 16 H52 V53 H12 Z M12 26 H52 M22 10 V20 M42 10 V20 M21 34 H43 M21 42 H43 M27 30 V50 M37 30 V50"></path>',
    book: '<path d="M32 18 C26 14 18 14 10 17 V49 C18 46 26 46 32 50 C38 46 46 46 54 49 V17 C46 14 38 14 32 18 Z M32 18 V50"></path>',
    gradCap: '<path d="M32 13 L56 24 L32 35 L8 24 Z M16 28 V43 C16 43 22 49 32 49 C42 49 48 43 48 43 V28 M52 26 V44"></path><circle cx="52" cy="45" r="2"></circle>',
    building: '<path d="M8 24 L32 11 L56 24 Z M12 28 H52 M16 28 V48 M27 28 V48 M37 28 V48 M48 28 V48 M10 48 H54 M6 53 H58"></path>',
    paw: '<circle cx="21" cy="23" r="5"></circle><circle cx="43" cy="23" r="5"></circle><circle cx="32" cy="17" r="5"></circle><path d="M22 37 C18 31 24 25 32 25 C40 25 46 31 42 37 C40 43 45 49 39 52 C35 54 29 54 25 52 C19 49 24 43 22 37 Z"></path>',
    bone: '<path d="M14 26 C11 26 9 24 9 21 C9 18 12 17 14 18 C16 16 19 18 19 21 L45 39 C48 37 51 39 51 42 C53 43 53 46 51 48 C49 50 46 50 44 48 C42 50 39 48 40 45 L14 26 Z"></path>',
    syringe: '<path d="M17 26 H43 V38 H17 Z M17 32 H9 M9 26 V38 M43 32 H55 M24 26 V30 M31 26 V30 M38 26 V30 M43 22 V42"></path>',
    flask: '<path d="M27 12 H37 M32 12 V24 L46 48 C48 51 46 54 42 54 H22 C18 54 16 51 18 48 L32 24 M21 44 H43"></path>',
    gear: '<circle cx="32" cy="32" r="9"></circle><path d="M29 8 H35 L36 14 L41 16 L46 12 L50 16 L46 21 L48 26 L54 27 V33 L48 34 L46 39 L50 44 L46 48 L41 44 L36 46 L35 52 H29 L28 46 L23 44 L18 48 L14 44 L18 39 L16 34 L10 33 V27 L16 26 L18 21 L14 16 L18 12 L23 16 L28 14 Z"></path>',
    laptop: '<path d="M14 17 H50 V39 H14 Z M8 45 H56 L60 51 H4 Z M28 48 H36"></path>'
  };

  const GRID_SLOTS = [
    { x: 45,  y: 40,  rot: -8 },
    { x: 135, y: 40,  rot: 4 },
    { x: 225, y: 40,  rot: 20 },
    { x: 0,   y: 120, rot: 0, wrap: 270 },
    { x: 90,  y: 120, rot: -12 },
    { x: 180, y: 120, rot: 6 },
    { x: 45,  y: 200, rot: 3 },
    { x: 135, y: 200, rot: -5 },
    { x: 225, y: 200, rot: 35 },
    { x: 0,   y: 280, rot: -6, wrap: 270 },
    { x: 90,  y: 280, rot: 12 },
    { x: 180, y: 280, rot: -18 }
  ];

  function resolveMotifs(config) {
    const rawMotifs = (config && config.branding && Array.isArray(config.branding.motifs) && config.branding.motifs.length > 0)
      ? config.branding.motifs
      : (config && Array.isArray(config.motifs) ? config.motifs : []);
    if (rawMotifs.length > 0) {
      const valid = rawMotifs
        .map(m => String(m).toLowerCase().trim())
        .filter(m => CURATED_MOTIFS.includes(m))
        .slice(0, 3);
      if (valid.length > 0) return valid;
    }

    const searchStr = `${(config && config.id) || ""} ${(config && config.institution) || ""} ${(config && config.name) || ""}`.toLowerCase();
    for (const [key, defaultMotifs] of Object.entries(INSTITUTION_DEFAULT_MOTIFS)) {
      if (searchStr.includes(key)) {
        return defaultMotifs;
      }
    }

    return ["general"];
  }

  function renderBackgroundPattern(motifs) {
    if (typeof document === "undefined" || !document.body) return;

    const motifList = Array.isArray(motifs) && motifs.length > 0 ? motifs : ["general"];
    let iconKeys = [];
    for (const m of motifList) {
      if (MOTIF_ICONS[m]) {
        iconKeys.push(...MOTIF_ICONS[m]);
      }
    }
    iconKeys = iconKeys.filter(k => Boolean(ICON_PATHS[k]));
    if (iconKeys.length === 0) {
      iconKeys = MOTIF_ICONS.general.filter(k => Boolean(ICON_PATHS[k]));
    }
    if (!iconKeys.includes("calendar") && ICON_PATHS.calendar) iconKeys.push("calendar");
    if (!iconKeys.includes("book") && ICON_PATHS.book) iconKeys.push("book");

    const uniqueKeys = [...new Set(iconKeys)];
    let defsHtml = "";
    for (const key of uniqueKeys) {
      defsHtml += `<g id="pat-icon-${key}"><g transform="translate(-32 -32)">${ICON_PATHS[key]}</g></g>`;
    }

    let slotsHtml = "";
    for (let i = 0; i < GRID_SLOTS.length; i++) {
      const slot = GRID_SLOTS[i];
      const iconKey = iconKeys[i % iconKeys.length];
      const iconId = `#pat-icon-${iconKey}`;
      slotsHtml += `<g transform="translate(${slot.x} ${slot.y}) rotate(${slot.rot}) scale(0.62)"><use href="${iconId}"></use><use href="${iconId}" transform="translate(1.8 1.4)" opacity="0.5"></use></g>`;
      if (slot.wrap !== undefined) {
        slotsHtml += `<g transform="translate(${slot.wrap} ${slot.y}) rotate(${slot.rot}) scale(0.62)"><use href="${iconId}"></use><use href="${iconId}" transform="translate(1.8 1.4)" opacity="0.5"></use></g>`;
      }
    }

    let svgEl = document.getElementById("app-bg-pattern");
    if (!svgEl) {
      svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svgEl.setAttribute("id", "app-bg-pattern");
      svgEl.setAttribute("class", "app-bg-pattern");
      svgEl.setAttribute("aria-hidden", "true");
      svgEl.setAttribute("preserveAspectRatio", "none");
      document.body.insertBefore(svgEl, document.body.firstChild);
    }

    svgEl.innerHTML = `
      <defs>
        ${defsHtml}
        <pattern id="app-bg-pat" width="270" height="320" patternUnits="userSpaceOnUse" x="6" y="6">
          <g fill="none" stroke="var(--bg-pattern-stroke, rgba(147, 180, 255, 0.12))" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">
            ${slotsHtml}
          </g>
        </pattern>
        <linearGradient id="app-fade-top" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="black"></stop>
          <stop offset="0.6" stop-color="#444444"></stop>
          <stop offset="1" stop-color="white"></stop>
        </linearGradient>
        <linearGradient id="app-fade-bottom" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="white"></stop>
          <stop offset="0.5" stop-color="#444444"></stop>
          <stop offset="1" stop-color="black"></stop>
        </linearGradient>
        <mask id="app-bg-mask">
          <rect width="100%" height="100%" fill="white"></rect>
          <rect x="0" y="0" width="100%" height="260" fill="url(#app-fade-top)"></rect>
          <rect x="0" y="70%" width="100%" height="30%" fill="url(#app-fade-bottom)"></rect>
        </mask>
      </defs>
      <rect width="100%" height="100%" fill="url(#app-bg-pat)" mask="url(#app-bg-mask)"></rect>
    `;
  }

  function applyBrandingToDOM(config, elements = {}) {
    if (typeof document === "undefined" || !config) return;
    try { renderBackgroundPattern(resolveMotifs(config)); } catch (_) {}
    if (typeof document.querySelector === "function") {
      const metaTheme = document.querySelector('meta[name="theme-color"]');
      if (metaTheme) {
        let cssHeaderBg = "";
        if (typeof window !== "undefined" && typeof window.getComputedStyle === "function" && document.documentElement) {
          try {
            const val = window.getComputedStyle(document.documentElement).getPropertyValue("--school-header-bg");
            if (val && val.trim()) cssHeaderBg = val.trim();
          } catch (_) {}
        }
        if (cssHeaderBg) metaTheme.setAttribute("content", cssHeaderBg);
        else if (config.theme_color) metaTheme.setAttribute("content", config.theme_color);
      }
    }
    const headerTitle = config.faculty ? `Plan zajęć ${config.faculty}` : (config.short_name || config.name || "Plan zajęć");
    document.title = headerTitle;
    if (typeof document.querySelector === "function") {
      const brandH1 = document.querySelector(".brand-titles h1");
      if (brandH1) brandH1.textContent = headerTitle;
    }

    if (typeof document.querySelector === "function") {
      const brandLogo = document.querySelector(".brand-logo");
      const currentSrc = brandLogo ? (brandLogo.getAttribute("src") || "") : "";
      const isDefaultPlaceholder = !currentSrc || currentSrc.includes("planwn.svg");
      const hasCustomFileLogo = !isDefaultPlaceholder && (currentSrc.includes("icon.png") || currentSrc.includes("logo.svg"));

      if (brandLogo && isDefaultPlaceholder && config.id !== "umg_wn") {
        brandLogo.setAttribute("src", "icon.png");
      }

      if (!hasCustomFileLogo && config.icon && String(config.icon).length <= 4) {
        const svgIconUri = `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>${encodeURIComponent(config.icon)}</text></svg>`;
        const favicon = document.querySelector('link[rel="icon"]');
        if (favicon && !favicon.getAttribute("href").includes("icon.png")) {
          favicon.setAttribute("href", svgIconUri);
        }
        if (brandLogo && isDefaultPlaceholder && config.id !== "umg_wn") {
          brandLogo.onerror = function () {
            this.onerror = null;
            this.setAttribute("src", svgIconUri);
          };
        } else if (brandLogo && !hasCustomFileLogo && config.id !== "umg_wn") {
          brandLogo.setAttribute("src", svgIconUri);
        }
        const pluginLogo = document.getElementById("about-plugin-logo");
        if (pluginLogo) {
          pluginLogo.setAttribute("src", svgIconUri);
        }
      }
    }

    // Render dynamic legend items in About modal from config.forms
    if (config.forms && typeof config.forms === "object") {
      if (typeof document.getElementById === "function") {
        // legend-bar populated dynamically by renderSchedule based on active lessons

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

    // Dynamic footer & about modal branding (Uniplaner platform + Active Plugin)
    if (typeof document.getElementById === "function") {
      const aboutTitle = document.getElementById("about-modal-title");
      if (aboutTitle) aboutTitle.textContent = "O aplikacji Uniplaner";

      const aboutAppName = document.getElementById("about-app-name");
      if (aboutAppName) aboutAppName.textContent = "Uniplaner";

      const pluginNameEl = document.getElementById("about-plugin-name");
      if (pluginNameEl) {
        pluginNameEl.textContent = config.name || `${config.institution || ""} — ${config.faculty_full || config.faculty || ""}`.trim();
      }

      const pluginVerEl = document.getElementById("about-plugin-version");
      if (pluginVerEl) {
        pluginVerEl.textContent = config.plugin_version ? `v${config.plugin_version}` : "v1.0.0";
      }

      const pluginAuthorEl = document.getElementById("about-plugin-author");
      if (pluginAuthorEl) {
        pluginAuthorEl.textContent = config.plugin_author || "Społeczność akademicka";
      }

      const sourceUrl = config.source_url || "https://arktur.umg.edu.pl/planyzaj/strpza5.php";
      const sourceLabel = config.source_label || "systemu uczelni";
      for (const linkId of ["about-source-link", "about-disclaimer-link", "footer-source-link", "about-plugin-source"]) {
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

      const footerPlugin = document.getElementById("footer-plugin-name");
      if (footerPlugin) {
        const fac = config.faculty || "Wydział";
        const inst = config.institution || "Uczelnia";
        footerPlugin.textContent = `${fac} (${inst})`;
      }

      const planIssuesBtn = document.getElementById("about-tally-btn");
      if (planIssuesBtn) {
        const feedback = config.feedback || {};
        const tallyId = feedback.tally_form_id || config.tally_form_id;
        const issuesUrl = feedback.plan_issues_url;
        const email = feedback.contact_email;
        const facultyLabel = config.faculty ? `w planie ${config.faculty}` : "w planie zajęć";

        const labelSpan = planIssuesBtn.querySelector("span");
        if (labelSpan) {
          labelSpan.textContent = `Błąd ${facultyLabel}`;
        }

        if (tallyId) {
          planIssuesBtn.setAttribute("href", `https://tally.so/r/${tallyId}`);
          planIssuesBtn.setAttribute("data-tally-open", tallyId);
          planIssuesBtn.classList.remove("hidden");
        } else if (issuesUrl) {
          planIssuesBtn.setAttribute("href", issuesUrl);
          planIssuesBtn.removeAttribute("data-tally-open");
          planIssuesBtn.classList.remove("hidden");
        } else if (email) {
          const subject = encodeURIComponent(`[${config.short_name || config.name || "Uniplaner"}] Błąd w planie zajęć`);
          planIssuesBtn.setAttribute("href", `mailto:${email}?subject=${subject}`);
          planIssuesBtn.removeAttribute("data-tally-open");
          planIssuesBtn.classList.remove("hidden");
        } else {
          planIssuesBtn.classList.add("hidden");
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
    isFeatureEnabled,
    resolveMotifs,
    renderBackgroundPattern
  };
});
