/**
 * portal.js — Logika portalu wyboru uczelni i wydziału platformy Uniplaner.
 * Zapewnia pełną dostępność (ARIA 1.2 Combobox), nawigację klawiaturą,
 * asynchroniczne ładowanie rejestru tenants.json oraz pamięć ostatniego wyboru w localStorage.
 */

// Klucz localStorage dla ostatnio wybranego planu
const LAST_VISITED_KEY = "uniplaner_last_visited";

/**
 * Czysty silnik domenowy portalu (ułatwiający testowanie jednostkowe)
 */
const PortalDomain = {
  /**
   * Grupuje płaską listę tenantów według uczelni (institution_id / institution_full).
   */
  groupTenantsByInstitution(tenants) {
    if (!Array.isArray(tenants)) return [];
    const map = new Map();

    for (const t of tenants) {
      const instKey = t.institution || t.institution_full || "Inna";
      if (!map.has(instKey)) {
        map.set(instKey, {
          institution: t.institution,
          institution_full: t.institution_full || t.institution,
          faculties: []
        });
      }
      map.get(instKey).faculties.push(t);
    }

    return Array.from(map.values()).sort((a, b) => 
      a.institution_full.localeCompare(b.institution_full, "pl")
    );
  },

  /**
   * Filtruje listę uczelni po wpisanym zapytaniu (case & diacritic-insensitive).
   */
  filterInstitutions(institutions, query) {
    if (!query || !query.trim()) return institutions;
    const norm = (str) =>
      (str || "")
        .toLowerCase()
        .replace(/ł/g, "l")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    const q = norm(query.trim());
    return institutions.filter((item) => {
      const full = norm(item.institution_full);
      const short = norm(item.institution);
      // Szukanie również po nazwach wydziałów danej uczelni (np. "Nawigacyjny")
      const facultyMatch = item.faculties && item.faculties.some(f => 
        norm(f.faculty_full).includes(q) || norm(f.faculty).includes(q)
      );
      return full.includes(q) || short.includes(q) || facultyMatch;
    });
  },

  /**
   * Zwraca podzbiór popularnych uczelni do szybkich chipów (np. UMG, SGGW).
   */
  getPopularInstitutions(institutions, limit = 4) {
    if (!Array.isArray(institutions)) return [];
    return institutions.slice(0, limit);
  },

  /**
   * Zapisuje ostatnio wybrany wydział w podanym storage (domyślnie localStorage).
   */
  saveLastVisited(tenant, storage = window.localStorage) {
    if (!tenant || !storage) return;
    try {
      const payload = {
        tenant_id: tenant.tenant_id,
        name: tenant.name || `${tenant.institution} - ${tenant.faculty_full}`,
        institution: tenant.institution,
        faculty_full: tenant.faculty_full,
        url: tenant.url,
        timestamp: Date.now()
      };
      storage.setItem(LAST_VISITED_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn("Nie udało się zapisać ostatnio odwiedzanego planu:", e);
    }
  },

  /**
   * Odczytuje ostatnio wybrany wydział.
   */
  loadLastVisited(storage = window.localStorage) {
    if (!storage) return null;
    try {
      const raw = storage.getItem(LAST_VISITED_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  },

  /**
   * Zwraca URL grafiki tenanta (logo_url lub icon_url jako fallback).
   */
  getTenantVisualUrl(tenant) {
    if (!tenant) return null;
    return tenant.logo_url || tenant.icon_url || null;
  }
};

/**
 * Kontroler interfejsu portalu
 */
class PortalApp {
  constructor() {
    this.tenants = [];
    this.institutions = [];
    this.filteredInstitutions = [];
    this.selectedInstitution = null;
    this.selectedTenant = null;
    this.activeIndex = -1;

    // Elementy DOM
    this.searchInput = document.getElementById("uni-search-input");
    this.toggleBtn = document.getElementById("uni-toggle-btn");
    this.listbox = document.getElementById("uni-listbox");
    this.statusEl = document.getElementById("uni-status");
    this.comboboxField = document.getElementById("combobox-field");
    this.errorContainer = document.getElementById("uni-error-container");
    this.errorText = document.getElementById("uni-error-text");
    this.retryBtn = document.getElementById("uni-retry-btn");
    this.loadingBadge = document.getElementById("uni-loading-badge");
    this.facultyStep = document.getElementById("step-faculty");
    this.facultyList = document.getElementById("faculty-list");
    this.actionStep = document.getElementById("step-action");
    this.launchBtn = document.getElementById("launch-plan-btn");
    this.lastVisitedCard = document.getElementById("last-visited-card");
    this.lastVisitedText = document.getElementById("last-visited-text");
    this.lastVisitedLink = document.getElementById("last-visited-link");
    this.themeToggleBtn = document.getElementById("theme-toggle-btn");
    this.actionHelper = document.getElementById("action-helper");
  }

  async init() {
    this.initThemeToggle();
    this.renderLastVisited();
    this.renderFacultyPlaceholder();
    this.bindEvents();
    await this.loadTenants();
  }

  async loadTenants() {
    this.setLoading(true);
    this.hideError();

    const candidatePaths = [
      "./tenants.json",
      "../dist/tenants.json",
      "./dist/tenants.json"
    ];

    let loadedData = null;
    let lastError = null;

    for (const p of candidatePaths) {
      try {
        const res = await fetch(p);
        if (res.ok) {
          loadedData = await res.json();
          break;
        }
      } catch (e) {
        lastError = e;
      }
    }

    this.setLoading(false);

    if (Array.isArray(loadedData) && loadedData.length > 0) {
      this.tenants = loadedData;
      this.institutions = PortalDomain.groupTenantsByInstitution(this.tenants);
      this.filteredInstitutions = [...this.institutions];
      this.renderFacultyPlaceholder();
      if (this.searchInput) {
        this.searchInput.placeholder = "Wpisz nazwę lub skrót uczelni (np. UMG, SGGW)...";
      }
    } else {
      console.error("Błąd ładowania tenants.json:", lastError);
      this.showError("Nie udało się pobrać listy uczelni. Sprawdź połączenie i spróbuj ponownie.");
      this.tenants = [];
      this.institutions = [];
      this.filteredInstitutions = [];
      this.renderFacultyPlaceholder();
    }
  }

  setLoading(isLoading) {
    if (this.loadingBadge) {
      this.loadingBadge.hidden = !isLoading;
    }
    if (this.comboboxField) {
      this.comboboxField.classList.toggle("is-loading", isLoading);
    }
    if (this.searchInput) {
      this.searchInput.setAttribute("aria-busy", isLoading ? "true" : "false");
      if (isLoading) {
        this.searchInput.placeholder = "Wczytywanie listy uczelni...";
      }
    }
  }

  showError(message) {
    if (this.errorContainer) {
      if (this.errorText) this.errorText.textContent = message;
      this.errorContainer.hidden = false;
    }
    if (this.statusEl) {
      this.statusEl.textContent = message;
    }
    if (this.comboboxField) {
      this.comboboxField.classList.add("has-error");
    }
  }

  hideError() {
    if (this.errorContainer) {
      this.errorContainer.hidden = true;
    }
    if (this.statusEl) {
      this.statusEl.textContent = "";
    }
    if (this.comboboxField) {
      this.comboboxField.classList.remove("has-error");
    }
  }

  renderLastVisited() {
    const last = PortalDomain.loadLastVisited();
    if (!last || !this.lastVisitedCard) return;

    this.lastVisitedText.textContent = `${last.institution} — ${last.faculty_full}`;
    this.lastVisitedLink.href = last.url;
    this.lastVisitedLink.addEventListener("click", () => {
      PortalDomain.saveLastVisited(last);
    });
    this.lastVisitedCard.hidden = false;
  }

  initThemeToggle() {
    if (!this.themeToggleBtn) return;

    const applyTheme = (theme) => {
      document.documentElement.setAttribute("data-theme", theme);
      document.documentElement.style.colorScheme = theme;
      const isDark = theme === "dark";
      this.themeToggleBtn.setAttribute("aria-pressed", isDark ? "true" : "false");
      this.themeToggleBtn.setAttribute("title", isDark ? "Przełącz na jasny motyw" : "Przełącz na ciemny motyw");
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", isDark ? "#17181c" : "#fbf9f4");
      try {
        localStorage.setItem("uniplaner_theme", theme);
      } catch (e) {}
    };

    let currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
    applyTheme(currentTheme);

    this.themeToggleBtn.addEventListener("click", () => {
      currentTheme = currentTheme === "dark" ? "light" : "dark";
      applyTheme(currentTheme);
    });
  }

  renderFacultyPlaceholder() {
    if (!this.facultyList) return;
    const popular = PortalDomain.getPopularInstitutions(this.institutions, 4);

    let chipsHtml = "";
    if (popular.length > 0) {
      chipsHtml = `
        <div class="quick-chips-section">
          <span class="quick-chips-label">Popularne uczelnie:</span>
          <div class="quick-chips-wrapper" role="group" aria-label="Szybki wybór uczelni">
            ${popular.map(p => `
              <button
                type="button"
                class="chip-btn"
                data-institution="${p.institution}"
                aria-label="Wybierz uczelnię ${p.institution_full || p.institution}"
              >
                ${p.institution}
              </button>
            `).join("")}
          </div>
        </div>
      `;
    }

    this.facultyList.innerHTML = `
      <div class="faculty-empty-placeholder">
        <p class="placeholder-title">Wybierz uczelnię powyżej</p>
        <p class="placeholder-hint">Wpisz skrót lub nazwę uczelni w wyszukiwarce${popular.length > 0 ? " albo wybierz jedną z popularnych poniżej:" : ", aby zobaczyć dostępne wydziały."}</p>
        ${chipsHtml}
      </div>
    `;

    if (popular.length > 0) {
      const chipButtons = this.facultyList.querySelectorAll(".chip-btn");
      chipButtons.forEach(btn => {
        btn.addEventListener("click", () => {
          const instCode = btn.getAttribute("data-institution");
          const targetInst = this.institutions.find(i => i.institution === instCode);
          if (targetInst) {
            this.selectInstitution(targetInst);
          }
        });
      });
    }

    this.disableLaunchBtn();
  }

  enableLaunchBtn(url, title) {
    if (!this.launchBtn) return;
    this.launchBtn.classList.remove("is-disabled");
    this.launchBtn.removeAttribute("aria-disabled");
    this.launchBtn.href = url;
    if (title) this.launchBtn.setAttribute("title", `Otwórz ${title}`);
    if (this.actionHelper) {
      this.actionHelper.textContent = "Wydział wybrany. Kliknij poniżej, aby otworzyć plan zajęć.";
      this.actionHelper.classList.add("is-ready");
    }
  }

  disableLaunchBtn() {
    if (!this.launchBtn) return;
    this.launchBtn.classList.add("is-disabled");
    this.launchBtn.setAttribute("aria-disabled", "true");
    this.launchBtn.removeAttribute("href");
    this.launchBtn.removeAttribute("title");
    if (this.actionHelper) {
      this.actionHelper.textContent = "Wybierz wydział powyżej, aby otworzyć plan zajęć.";
      this.actionHelper.classList.remove("is-ready");
    }
  }

  bindEvents() {
    if (!this.searchInput) return;

    // Wpisywanie w polu wyszukiwania
    this.searchInput.addEventListener("input", (e) => {
      this.handleInput(e.target.value);
    });

    // Obsługa klawiatury w comboboxie
    this.searchInput.addEventListener("keydown", (e) => {
      this.handleKeydown(e);
    });

    // Przycisk rozwijania / zwijania
    if (this.toggleBtn) {
      this.toggleBtn.addEventListener("click", () => {
        if (this.isOpen()) {
          this.closeDropdown();
        } else {
          this.filteredInstitutions = [...this.institutions];
          this.renderListbox();
          this.openDropdown();
          this.searchInput.focus();
        }
      });
    }

    // Przycisk ponowienia po błędzie
    if (this.retryBtn) {
      this.retryBtn.addEventListener("click", () => {
        this.loadTenants();
      });
    }

    // Zamknięcie po kliknięciu na zewnątrz
    document.addEventListener("click", (e) => {
      if (!this.searchInput.contains(e.target) && !this.listbox.contains(e.target) && (!this.toggleBtn || !this.toggleBtn.contains(e.target))) {
        this.closeDropdown();
      }
    });

    // Kliknięcie w przycisk przejścia
    if (this.launchBtn) {
      this.launchBtn.addEventListener("click", (e) => {
        if (!this.selectedTenant || this.launchBtn.classList.contains("is-disabled")) {
          e.preventDefault();
          return;
        }
        PortalDomain.saveLastVisited(this.selectedTenant);
      });
    }
  }

  handleInput(value) {
    this.filteredInstitutions = PortalDomain.filterInstitutions(this.institutions, value);
    this.activeIndex = -1;
    this.renderListbox();
    this.openDropdown();

    const count = this.filteredInstitutions.length;
    this.statusEl.textContent = count === 1 ? "1 uczelnia dostępna" : `${count} uczelni dostępnych`;
  }

  handleKeydown(e) {
    if (!this.isOpen() && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      this.openDropdown();
      return;
    }

    const items = this.listbox.querySelectorAll(".combobox-option");

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (items.length === 0) return;
      this.activeIndex = (this.activeIndex + 1) % items.length;
      this.updateActiveDescendant(items);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (items.length === 0) return;
      this.activeIndex = (this.activeIndex - 1 + items.length) % items.length;
      this.updateActiveDescendant(items);
    } else if (e.key === "Enter") {
      if (this.isOpen() && this.activeIndex >= 0 && items[this.activeIndex]) {
        e.preventDefault();
        items[this.activeIndex].click();
      }
    } else if (e.key === "Escape") {
      if (this.isOpen()) {
        e.preventDefault();
        this.closeDropdown();
      }
    }
  }

  updateActiveDescendant(items) {
    items.forEach((item, idx) => {
      const isActive = idx === this.activeIndex;
      item.classList.toggle("is-active", isActive);
      item.setAttribute("aria-selected", isActive ? "true" : "false");
      if (isActive) {
        this.searchInput.setAttribute("aria-activedescendant", item.id);
        item.scrollIntoView({ block: "nearest" });
      }
    });
  }

  openDropdown() {
    this.listbox.hidden = false;
    this.searchInput.setAttribute("aria-expanded", "true");
    if (this.toggleBtn) this.toggleBtn.setAttribute("aria-expanded", "true");
  }

  closeDropdown() {
    this.listbox.hidden = true;
    this.activeIndex = -1;
    this.searchInput.setAttribute("aria-expanded", "false");
    this.searchInput.removeAttribute("aria-activedescendant");
    if (this.toggleBtn) this.toggleBtn.setAttribute("aria-expanded", "false");
  }

  isOpen() {
    return !this.listbox.hidden;
  }

  renderListbox() {
    this.listbox.innerHTML = "";

    if (this.filteredInstitutions.length === 0) {
      const empty = document.createElement("li");
      empty.className = "combobox-empty";
      empty.textContent = "Nie znaleziono uczelni odpowiadającej kryteriom";
      this.listbox.appendChild(empty);
      return;
    }

    this.filteredInstitutions.forEach((inst, idx) => {
      const li = document.createElement("li");
      li.id = `uni-opt-${idx}`;
      li.className = "combobox-option";
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", "false");

      const primary = document.createElement("span");
      primary.className = "option-primary";
      primary.textContent = inst.institution_full;

      const secondary = document.createElement("span");
      secondary.className = "option-secondary";
      const facultyCount = inst.faculties.length;
      secondary.textContent = `${facultyCount} ${facultyCount === 1 ? "wydział" : "wydziały"}`;

      li.appendChild(primary);
      li.appendChild(secondary);

      li.addEventListener("click", () => {
        this.selectInstitution(inst);
      });

      this.listbox.appendChild(li);
    });
  }

  selectInstitution(inst) {
    this.selectedInstitution = inst;
    this.searchInput.value = inst.institution_full;
    this.closeDropdown();
    this.renderFaculties(inst.faculties);
  }

  renderFaculties(faculties) {
    this.facultyList.innerHTML = "";
    this.selectedTenant = null;
    this.disableLaunchBtn();

    faculties.forEach((tenant) => {
      const card = document.createElement("div");
      card.className = "faculty-card";
      card.setAttribute("role", "radio");
      card.setAttribute("tabindex", "0");
      card.setAttribute("aria-checked", "false");
      card.id = `faculty-card-${tenant.tenant_id}`;

      // Lewa strona: Nazwa i metadane
      const info = document.createElement("div");
      info.className = "faculty-info";

      const name = document.createElement("div");
      name.className = "faculty-name";
      name.textContent = tenant.faculty_full || tenant.faculty;

      const meta = document.createElement("div");
      meta.className = "faculty-meta";

      const authorBadge = document.createElement("span");
      authorBadge.className = "meta-item";
      authorBadge.textContent = tenant.plugin_author ? `Autor: ${tenant.plugin_author}` : "Oficjalny adapter";

      const versionBadge = document.createElement("span");
      versionBadge.className = "meta-item";
      versionBadge.textContent = `v${tenant.plugin_version || "1.0.0"}`;

      meta.appendChild(authorBadge);
      meta.appendChild(versionBadge);

      info.appendChild(name);
      info.appendChild(meta);

      // Prawa strona: Logo/Ikona i radio indicator
      const right = document.createElement("div");
      right.className = "faculty-right";

      const visualUrl = PortalDomain.getTenantVisualUrl(tenant);
      if (visualUrl) {
        const visual = document.createElement("div");
        visual.className = "faculty-logo-box";
        const img = document.createElement("img");
        img.src = visualUrl;
        img.alt = `Logo ${tenant.faculty_full || tenant.faculty}`;
        img.className = "faculty-logo-img";
        img.setAttribute("loading", "lazy");
        visual.appendChild(img);
        right.appendChild(visual);
      }

      const radio = document.createElement("div");
      radio.className = "faculty-radio-indicator";
      radio.setAttribute("aria-hidden", "true");
      right.appendChild(radio);

      card.appendChild(info);
      card.appendChild(right);

      // Zdarzenia wyboru
      card.addEventListener("click", () => {
        this.selectFaculty(tenant, card);
      });

      card.addEventListener("keydown", (e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          this.selectFaculty(tenant, card);
        }
      });

      this.facultyList.appendChild(card);
    });

    // Jeśli uczelnia ma tylko 1 wydział, zaznacz go automatycznie dla wygody
    if (faculties.length === 1) {
      const firstCard = this.facultyList.firstElementChild;
      if (firstCard) this.selectFaculty(faculties[0], firstCard);
    }
  }

  selectFaculty(tenant, cardEl) {
    this.selectedTenant = tenant;

    // Odznacz pozostałe karty
    const cards = this.facultyList.querySelectorAll(".faculty-card");
    cards.forEach(c => c.setAttribute("aria-checked", "false"));

    cardEl.setAttribute("aria-checked", "true");

    // Zaktualizuj przycisk przejścia
    this.enableLaunchBtn(tenant.url || `./${tenant.path}/`, tenant.name || tenant.faculty_full);
  }
}

// Inicjalizacja w przeglądarce
if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    const app = new PortalApp();
    app.init();
    window.__portalApp = app;
  });
}

// Eksport dla środowiska testowego (Node.js)
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    PortalDomain,
    LAST_VISITED_KEY
  };
}
