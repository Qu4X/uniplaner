/**
 * portal.js — Logika portalu wyboru uczelni i wydziału platformy Uniplaner.
 * Zapewnia pełną dostępność (ARIA 1.2 Combobox), nawigację klawiaturą,
 * 3-stanowy motyw (Jasny/System/Ciemny), asynchroniczne ładowanie rejestru tenants.json
 * oraz pamięć ostatniego wyboru w localStorage.
 */

// Klucz localStorage dla ostatnio wybranego planu
const LAST_VISITED_KEY = "uniplaner_last_visited";
// Klucz localStorage dla wybranego motywu (w trybie System jest usuwany)
const THEME_STORAGE_KEY = "uniplaner_theme";

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
   * Zwraca podzbiór popularnych uczelni do szybkich chipów (np. UMG, SGGW, AGH).
   */
  getPopularInstitutions(institutions, limit = 4) {
    if (!Array.isArray(institutions)) return [];
    return institutions.slice(0, limit);
  },

  /**
   * Zapisuje ostatnio wybrany wydział w podanym storage (domyślnie localStorage).
   */
  saveLastVisited(tenant, storage = (typeof window !== "undefined" ? window.localStorage : null)) {
    if (!tenant || !storage) return;
    try {
      const payload = {
        tenant_id: tenant.tenant_id,
        name: tenant.name || `${tenant.institution} - ${tenant.faculty_full || tenant.faculty}`,
        institution: tenant.institution,
        faculty_full: tenant.faculty_full || tenant.faculty,
        url: tenant.url || `./${tenant.path}/`,
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
  loadLastVisited(storage = (typeof window !== "undefined" ? window.localStorage : null)) {
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
  },

  /**
   * Zwraca poprawną formę gramatyczną liczby wydziałów po polsku.
   */
  formatFacultyCount(count) {
    if (count === 1) return "1 wydział";
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
      return `${count} wydziały`;
    }
    return `${count} wydziałów`;
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
    this.actionHelper = document.getElementById("action-helper");

    // Elementy przełącznika motywu
    this.themeSegmentBtns = document.querySelectorAll(".theme-segment-btn");
    this.themeDropdownBtn = document.getElementById("theme-dropdown-btn");
    this.themeMenuDropdown = document.getElementById("theme-menu-dropdown");
    this.themeDropdownItems = document.querySelectorAll(".theme-dropdown-item");
    this.themeBtnIcon = document.getElementById("theme-btn-icon");
  }

  async init() {
    this.initTheme();
    this.renderLastVisited();
    this.renderFacultyPlaceholder();
    this.bindEvents();
    await this.loadTenants();
  }

  // ==========================================
  // 3-stanowy motyw: Jasny / System / Ciemny
  // ==========================================

  getThemeMode() {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === "light" || saved === "dark") return saved;
    } catch (_) {}
    return "system";
  }

  getEffectiveTheme(mode = this.getThemeMode()) {
    if (mode === "system") {
      const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      return prefersDark ? "dark" : "light";
    }
    return mode;
  }

  setThemeMode(mode) {
    try {
      if (mode === "system") {
        localStorage.removeItem(THEME_STORAGE_KEY);
        document.documentElement.removeAttribute("data-theme");
      } else {
        localStorage.setItem(THEME_STORAGE_KEY, mode);
        document.documentElement.setAttribute("data-theme", mode);
      }
    } catch (e) {
      console.warn("Błąd zapisu preferencji motywu w localStorage:", e);
    }

    const effective = this.getEffectiveTheme(mode);
    document.documentElement.style.colorScheme = effective;

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute("content", effective === "dark" ? "#151517" : "#F7EFDC");
    }

    this.updateThemeUI(mode, effective);
  }

  updateThemeUI(mode, effective) {
    // 1. Desktop Segmented Control
    if (this.themeSegmentBtns) {
      this.themeSegmentBtns.forEach(btn => {
        const val = btn.getAttribute("data-theme-val");
        const isActive = val === mode;
        btn.setAttribute("aria-checked", isActive ? "true" : "false");
        btn.setAttribute("tabindex", isActive ? "0" : "-1");
        btn.tabIndex = isActive ? 0 : -1;
        btn.classList.toggle("is-active", isActive);
      });
    }

    // 2. Mobile Dropdown Menu Items
    if (this.themeDropdownItems) {
      this.themeDropdownItems.forEach(item => {
        const val = item.getAttribute("data-theme-val");
        const isActive = val === mode;
        item.setAttribute("aria-checked", isActive ? "true" : "false");
        item.classList.toggle("is-active", isActive);
      });
    }

    // 3. Mobile Dropdown Trigger Button Icon & Label
    if (this.themeDropdownBtn) {
      const label = mode === "light" ? "jasny" : (mode === "dark" ? "ciemny" : "system");
      this.themeDropdownBtn.setAttribute("aria-label", `Motyw: ${label}`);

      if (this.themeBtnIcon) {
        if (mode === "light") {
          this.themeBtnIcon.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="5"></circle>
              <line x1="12" y1="1" x2="12" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="23"></line>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
              <line x1="1" y1="12" x2="3" y2="12"></line>
              <line x1="21" y1="12" x2="23" y2="12"></line>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
            </svg>
          `;
        } else if (mode === "dark") {
          this.themeBtnIcon.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            </svg>
          `;
        } else {
          this.themeBtnIcon.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="12" rx="2"></rect>
              <path d="M8 20h8M12 16v4"></path>
            </svg>
          `;
        }
      }
    }
  }

  initTheme() {
    const currentMode = this.getThemeMode();
    this.setThemeMode(currentMode);

    // Nasłuch kliknięć i klawiatury w segmented control
    if (this.themeSegmentBtns) {
      const btns = Array.from(this.themeSegmentBtns);
      btns.forEach((btn, idx) => {
        btn.addEventListener("click", () => {
          const val = btn.getAttribute("data-theme-val");
          if (val) this.setThemeMode(val);
        });
        btn.addEventListener("keydown", (e) => {
          let nextIdx = -1;
          if (e.key === "ArrowRight" || e.key === "ArrowDown") {
            nextIdx = (idx + 1) % btns.length;
          } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
            nextIdx = (idx - 1 + btns.length) % btns.length;
          } else if (e.key === "Home") {
            nextIdx = 0;
          } else if (e.key === "End") {
            nextIdx = btns.length - 1;
          }
          if (nextIdx !== -1) {
            e.preventDefault();
            const targetBtn = btns[nextIdx];
            const val = targetBtn.getAttribute("data-theme-val");
            if (val) this.setThemeMode(val);
            if (typeof targetBtn.focus === "function") targetBtn.focus();
          }
        });
      });
    }

    // Nasłuch kliknięć w mobile dropdown
    if (this.themeDropdownBtn && this.themeMenuDropdown) {
      this.themeDropdownBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = !this.themeMenuDropdown.hidden;
        this.themeMenuDropdown.hidden = isOpen;
        this.themeDropdownBtn.setAttribute("aria-expanded", !isOpen ? "true" : "false");
      });

      this.themeDropdownItems.forEach(item => {
        item.addEventListener("click", (e) => {
          e.stopPropagation();
          const val = item.getAttribute("data-theme-val");
          if (val) this.setThemeMode(val);
          this.themeMenuDropdown.hidden = true;
          this.themeDropdownBtn.setAttribute("aria-expanded", "false");
          this.themeDropdownBtn.focus();
        });
      });

      document.addEventListener("click", (e) => {
        if (!this.themeDropdownBtn.contains(e.target) && !this.themeMenuDropdown.contains(e.target)) {
          this.themeMenuDropdown.hidden = true;
          this.themeDropdownBtn.setAttribute("aria-expanded", "false");
        }
      });

      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !this.themeMenuDropdown.hidden) {
          this.themeMenuDropdown.hidden = true;
          this.themeDropdownBtn.setAttribute("aria-expanded", "false");
          this.themeDropdownBtn.focus();
        }
      });
    }

    // Nasłuch zmian prefers-color-scheme w trybie System
    if (window.matchMedia) {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => {
        if (this.getThemeMode() === "system") {
          this.setThemeMode("system");
        }
      };
      if (mq.addEventListener) {
        mq.addEventListener("change", handler);
      } else if (mq.addListener) {
        mq.addListener(handler);
      }
    }
  }

  // ==========================================
  // Ładowanie i stan listy uczelni
  // ==========================================

  async loadTenants() {
    this.setLoading(true);
    this.hideError();

    const candidatePaths = [
      "./tenants.json",
      "tenants.json",
      "./portal/tenants.json",
      "portal/tenants.json",
      "../dist/tenants.json",
      "./dist/tenants.json",
      "dist/tenants.json"
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
        this.searchInput.placeholder = "Wpisz nazwę lub skrót uczelni (np. UMG, SGGW)…";
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

  renderFacultyPlaceholder() {
    if (!this.facultyList) return;
    const popular = PortalDomain.getPopularInstitutions(this.institutions, 4);

    let chipsHtml = "";
    if (popular.length > 0) {
      chipsHtml = `
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
      `;
    }

    this.facultyList.innerHTML = `
      <div class="faculty-empty-placeholder">
        <p class="placeholder-title" id="faculty-prompt">Najpierw wybierz uczelnię</p>
        <p class="placeholder-hint">Wpisz nazwę albo wybierz jedną z popularnych:</p>
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
      this.actionHelper.style.display = "none";
    }
  }

  disableLaunchBtn() {
    if (!this.launchBtn) return;
    this.launchBtn.classList.add("is-disabled");
    this.launchBtn.setAttribute("aria-disabled", "true");
    this.launchBtn.removeAttribute("href");
    this.launchBtn.removeAttribute("title");
    this.launchBtn.setAttribute("aria-describedby", "faculty-prompt");
    if (this.actionHelper) {
      this.actionHelper.style.display = "none";
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

    // Zamknięcie listy po kliknięciu na zewnątrz
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
      secondary.textContent = PortalDomain.formatFacultyCount(inst.faculties.length);

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

    const prompt = document.createElement("p");
    prompt.id = "faculty-prompt";
    prompt.className = "faculty-prompt-text";
    prompt.textContent = "Wybierz wydział";
    this.facultyList.appendChild(prompt);

    faculties.forEach((tenant) => {
      const card = document.createElement("div");
      card.className = "faculty-card";
      card.setAttribute("role", "radio");
      card.setAttribute("tabindex", "0");
      card.setAttribute("aria-checked", "false");
      card.id = `faculty-card-${tenant.tenant_id}`;

      // Lewa strona: Logo/Ikona
      const visual = document.createElement("div");
      visual.className = "faculty-logo-box";
      const visualUrl = PortalDomain.getTenantVisualUrl(tenant);
      if (visualUrl) {
        const img = document.createElement("img");
        img.src = visualUrl;
        img.alt = "";
        img.className = "faculty-logo-img";
        img.setAttribute("loading", "lazy");
        visual.appendChild(img);
      } else {
        // Fallback: ikona kalendarza / akademicka
        visual.innerHTML = `
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
        `;
      }

      // Środek: Nazwa i metadane
      const info = document.createElement("div");
      info.className = "faculty-info";

      const name = document.createElement("div");
      name.className = "faculty-name";
      name.textContent = tenant.faculty_full || tenant.faculty;

      const meta = document.createElement("div");
      meta.className = "faculty-meta";
      const author = tenant.plugin_author ? `Autor: ${tenant.plugin_author}` : "Oficjalny adapter";
      const version = `v${tenant.plugin_version || "1.0.0"}`;
      meta.textContent = `${author} · ${version}`;

      info.appendChild(name);
      info.appendChild(meta);

      // Prawa strona: Radio
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "faculty_choice";
      radio.className = "faculty-radio";
      radio.checked = false;
      radio.tabIndex = -1;
      radio.setAttribute("aria-hidden", "true");

      card.appendChild(visual);
      card.appendChild(info);
      card.appendChild(radio);

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

    // Odznacz pozostałe karty i radio
    const cards = this.facultyList.querySelectorAll(".faculty-card");
    cards.forEach(c => {
      c.setAttribute("aria-checked", "false");
      const r = c.querySelector(".faculty-radio");
      if (r) r.checked = false;
    });

    cardEl.setAttribute("aria-checked", "true");
    const activeRadio = cardEl.querySelector(".faculty-radio");
    if (activeRadio) activeRadio.checked = true;

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
    LAST_VISITED_KEY,
    THEME_STORAGE_KEY,
    PortalApp
  };
}
