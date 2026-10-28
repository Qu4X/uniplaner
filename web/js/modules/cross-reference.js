/**
 * CrossRef — Moduł powiązań krzyżowych (wykładowcy, sale, przedmioty) oraz wyszukiwarki wolnych sal
 * 
 * Zgodny ze specyfikacją: docs/specs/cross-reference-modals.md (v4)
 */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.CrossRef = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  const DNI_TYGODNIA = ["PON", "WT", "ŚR", "CZW", "PT", "SOB", "ND"];
  const DNI_PELNE = {
    PON: "Poniedziałek",
    WT: "Wtorek",
    ŚR: "Środa",
    CZW: "Czwartek",
    PT: "Piątek",
    SOB: "Sobota",
    ND: "Niedziela"
  };

  const STANDARD_SLOTS = [
    { label: "08:00 - 09:30", start: 480, end: 570 },
    { label: "09:45 - 11:15", start: 585, end: 675 },
    { label: "11:30 - 13:00", start: 690, end: 780 },
    { label: "13:30 - 15:00", start: 810, end: 900 },
    { label: "15:15 - 16:45", start: 915, end: 1005 },
    { label: "17:00 - 18:30", start: 1020, end: 1110 },
    { label: "18:45 - 20:15", start: 1125, end: 1215 }
  ];

  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normalizeQuery(str) {
    if (!str) return "";
    return String(str)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/ł/g, "l");
  }

  function parseMinutes(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.trim().split(":").map(Number);
    return (parts[0] || 0) * 60 + (parts[1] || 0);
  }

  function getWarsawTimeParts(date = new Date()) {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Warsaw",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
    const parts = formatter.formatToParts(date);
    const getPart = type => parts.find(p => p.type === type)?.value;
    const year = getPart("year");
    const month = getPart("month");
    const day = getPart("day");
    const hour = parseInt(getPart("hour"), 10) || 0;
    const minute = parseInt(getPart("minute"), 10) || 0;
    return {
      dateISO: `${year}-${month}-${day}`,
      minutes: hour * 60 + minute
    };
  }

  // --- Czysta warstwa logiki i zapytań (CrossRef.Engine) ---
  const Engine = {
    STANDARD_SLOTS,
    DNI_TYGODNIA,
    DNI_PELNE,
    escapeHtml,
    normalizeQuery,
    parseMinutes,
    getWarsawTimeParts,

    search(crossRefData, query, limitPerCategory = 5) {
      if (!crossRefData || !query || typeof query !== "string") {
        return { teachers: [], rooms: [], subjects: [] };
      }
      const trimmed = query.trim();
      if (trimmed.length < 2) {
        return { teachers: [], rooms: [], subjects: [] };
      }

      const norm = normalizeQuery(trimmed);
      const roomQuery = norm.replace(/^sala\s+/, "");

      const matchedTeachers = [];
      if (crossRefData.teachers) {
        for (const t of Object.keys(crossRefData.teachers)) {
          if (normalizeQuery(t).includes(norm)) {
            matchedTeachers.push({
              name: t,
              classCount: (crossRefData.teachers[t] || []).length
            });
            if (matchedTeachers.length >= limitPerCategory) break;
          }
        }
      }

      const matchedRooms = [];
      const roomList = crossRefData.room_list || (crossRefData.rooms ? Object.keys(crossRefData.rooms) : []);
      for (const r of roomList) {
        const normR = normalizeQuery(r);
        if (normR.includes(norm) || (roomQuery && normR.includes(roomQuery))) {
          matchedRooms.push({ room: r });
          if (matchedRooms.length >= limitPerCategory) break;
        }
      }

      const matchedSubjects = [];
      if (crossRefData.subjects) {
        for (const s of Object.keys(crossRefData.subjects)) {
          const sData = crossRefData.subjects[s] || {};
          const normS = normalizeQuery(s);
          const rawVariants = (sData.raw_variants || []).map(normalizeQuery);
          if (normS.includes(norm) || rawVariants.some(v => v.includes(norm))) {
            matchedSubjects.push({
              name: s,
              teachers: sData.teachers || []
            });
            if (matchedSubjects.length >= limitPerCategory) break;
          }
        }
      }

      return {
        teachers: matchedTeachers,
        rooms: matchedRooms,
        subjects: matchedSubjects
      };
    },

    findFreeRooms(crossRefData, options = {}) {
      if (!crossRefData) return [];
      const scheduleEngine = options.scheduleEngine;
      if (!scheduleEngine) {
        throw new Error("CrossRef.Engine.findFreeRooms requires scheduleEngine instance");
      }

      let dateISO = options.dateISO;
      let queryRange = options.queryRange;

      if (!queryRange && options.now) {
        const warsaw = getWarsawTimeParts(options.now);
        dateISO = warsaw.dateISO;
        queryRange = { start: warsaw.minutes, end: warsaw.minutes + 1 };
      } else if (!dateISO) {
        const warsaw = getWarsawTimeParts(options.now || new Date());
        dateISO = warsaw.dateISO;
      }

      if (!queryRange) {
        queryRange = { start: 0, end: 1440 };
      }

      let roomsList = crossRefData.room_list || (crossRefData.rooms ? Object.keys(crossRefData.rooms) : []);
      if (options.filterText && typeof options.filterText === "string") {
        const fNorm = normalizeQuery(options.filterText.trim());
        if (fNorm.length >= 1) {
          roomsList = roomsList.filter(r => normalizeQuery(r).includes(fNorm));
        }
      }

      // 1. Sprawdzenie dnia wolnego od zajęć (święto, przerwa, sesja)
      if (!scheduleEngine.isTeachingDay(dateISO)) {
        return roomsList.map(r => ({
          room: r,
          isFree: true,
          occupyingClass: null,
          nextClass: null
        }));
      }

      // 2. Rozwiązanie dnia bazowego planu (z uwzględnieniem zamian rektorskich)
      const effectiveDay = scheduleEngine.resolveBaseDay(dateISO);
      if (!effectiveDay || effectiveDay === "ND") {
        return roomsList.map(r => ({
          room: r,
          isFree: true,
          occupyingClass: null,
          nextClass: null
        }));
      }

      // 3. Weryfikacja obłożenia dla każdej pasującej sali
      const results = [];
      for (const r of roomsList) {
        const daySchedule = (crossRefData.rooms && crossRefData.rooms[r] && crossRefData.rooms[r][effectiveDay]) || [];
        const occ = scheduleEngine.getRoomOccupancyAt(daySchedule, queryRange, dateISO, effectiveDay);
        results.push({
          room: r,
          isFree: occ.isFree,
          occupyingClass: occ.occupyingClass,
          nextClass: occ.nextClass
        });
      }

      // Sortowanie: najpierw wolne, potem alfabetycznie po nazwie sali
      results.sort((a, b) => {
        if (a.isFree !== b.isFree) return a.isFree ? -1 : 1;
        return a.room.localeCompare(b.room, undefined, { numeric: true, sensitivity: 'base' });
      });

      return results;
    },

    normalizeGroupName(raw) {
      if (!raw) return { prefix: "", num: null, raw: "" };
      const str = String(raw).trim().toUpperCase();
      const m = str.match(/^([A-ZĄĆĘŁŃÓŚŹŻ.\s_-]+?)(\d+)$/);
      if (m) {
        return {
          prefix: m[1].replace(/[\s._-]/g, ""),
          num: parseInt(m[2], 10),
          raw: str
        };
      }
      const onlyNum = str.match(/^(\d+)$/);
      if (onlyNum) {
        return {
          prefix: "",
          num: parseInt(onlyNum[1], 10),
          raw: str
        };
      }
      return {
        prefix: str.replace(/[\s._-]/g, ""),
        num: null,
        raw: str
      };
    },

    isGroupInListOrRange(userGroup, groupsData) {
      if (!userGroup || !groupsData) return false;
      const u = this.normalizeGroupName(userGroup);

      let items = [];
      if (Array.isArray(groupsData)) {
        items = groupsData;
      } else if (typeof groupsData === "string") {
        items = groupsData.split(",").map(s => s.trim());
      }

      for (const itemStr of items) {
        if (!itemStr) continue;
        const trimmed = String(itemStr).trim();

        // Check if itemStr is a range like "GR.01–GR.08" or "GR.01-GR.08" or "GR. 1 - GR. 8"
        const rangeMatch = trimmed.match(/^(.+?)\s*[-–—]\s*(.+)$/);
        if (rangeMatch) {
          const startG = this.normalizeGroupName(rangeMatch[1]);
          const endG = this.normalizeGroupName(rangeMatch[2]);
          if (startG.num !== null && endG.num !== null && u.num !== null) {
            const prefixMatches = !u.prefix || !startG.prefix || (u.prefix === startG.prefix);
            if (prefixMatches && u.num >= startG.num && u.num <= endG.num) {
              return true;
            }
          }
        }

        const g = this.normalizeGroupName(trimmed);
        if (u.raw && g.raw && u.raw === g.raw) return true;
        if (u.num !== null && g.num !== null && u.num === g.num) {
          if (!u.prefix || !g.prefix || u.prefix === g.prefix) {
            return true;
          }
        }
      }
      return false;
    },

    isUserPlanMatch(item, userPlanId, userPlanName) {
      if (!userPlanId && !userPlanName) return false;
      if (userPlanId && item && item.plan_id && String(userPlanId) === String(item.plan_id)) {
        return true;
      }
      if (item && item.plan_name && userPlanName) {
        const normA = item.plan_name.toLowerCase().replace(/\s+/g, " ").trim();
        const normB = userPlanName.toLowerCase().replace(/\s+/g, " ").trim();
        if (normA === normB) return true;
        const semA = normA.match(/sem(?:\.|\s+)(\d+)/);
        const semB = normB.match(/sem(?:\.|\s+)(\d+)/);
        if (semA && semB && semA[1] === semB[1]) {
          const wordsA = normA.replace(/sem(?:\.|\s+)\d+/, "").split(/[^a-ząćęłńóśźż0-9]+/).filter(w => w.length > 2);
          const wordsB = normB.replace(/sem(?:\.|\s+)\d+/, "").split(/[^a-ząćęłńóśźż0-9]+/).filter(w => w.length > 2);
          const common = wordsA.filter(w => wordsB.includes(w));
          if (common.length >= 2) return true;
        }
      }
      return false;
    },

    isUserGroupMatch(item, userPlanId, userGroup, userPlanName) {
      if (!userGroup) return false;
      const planMatches = this.isUserPlanMatch(item, userPlanId, userPlanName);
      if (!planMatches) return false;
      return this.isGroupInListOrRange(userGroup, item && item.groups);
    },

    renderSlotCard(item, type = "room") {
      if (!item) return "";

      function formatGroupsSummary(groups) {
        if (!Array.isArray(groups) || groups.length === 0) return { text: "", title: "" };
        const fullText = groups.join(", ");
        if (groups.length <= 2) return { text: fullText, title: fullText };

        const matches = groups.map(g => {
          const m = g.match(/^([^\d]+)(\d+)$/);
          return m ? { prefix: m[1], num: parseInt(m[2], 10) } : null;
        });

        if (matches.every(m => m !== null && m.prefix === matches[0].prefix)) {
          let contiguous = true;
          for (let i = 1; i < matches.length; i++) {
            if (matches[i].num !== matches[i-1].num + 1) {
              contiguous = false;
              break;
            }
          }
          if (contiguous) {
            return { text: `${groups[0]}–${groups[groups.length - 1]}`, title: fullText };
          }
        }

        if (groups.length > 3) {
          return { text: `${groups.length} grup`, title: fullText };
        }
        return { text: fullText, title: fullText };
      }

      let cycleBadges = "";
      if (item.polowa_sem) {
        cycleBadges += `<span class="lesson-sem-badge">${escapeHtml(item.polowa_sem)}. poł. sem.</span>`;
      }
      if (item.co_ile === 2) {
        const odStr = item.od_tyg === 2 ? "od 2 tyg" : "od 1 tyg";
        cycleBadges += `<span class="lesson-cycle-badge">co 2 tyg (${odStr})</span>`;
      }

      const hoursParts = (item.hours || "").split(/[-–]/).map(s => s.trim());
      const startTime = hoursParts[0] || "";
      const endTime = hoursParts[1] || "";

      let isUserGroup = false;
      let uPlanId = null;
      let uGroup = null;
      let uPlanName = null;

      if (typeof window !== "undefined") {
        if (window.state) {
          uPlanId = window.state.selectedPlanId || null;
          uGroup = window.state.selectedGroup || null;
          if (uPlanId && window.state.plansData && window.state.plansData.plans && window.state.plansData.plans[uPlanId]) {
            uPlanName = window.state.plansData.plans[uPlanId].name;
          }
        }
        if ((!uGroup || !uPlanId) && window.AppState && window.AppState.state) {
          uPlanId = uPlanId || window.AppState.state.selectedPlanId;
          uGroup = uGroup || window.AppState.state.selectedGroup;
        }
        if ((!uGroup || !uPlanId) && typeof localStorage !== "undefined") {
          const tid = (window.state && window.state.tenantId) || "umg_wn";
          uPlanId = uPlanId || localStorage.getItem(`${tid}_selected_plan`) || localStorage.getItem("umg_selected_plan");
          uGroup = uGroup || localStorage.getItem(`${tid}_selected_group`) || localStorage.getItem("umg_selected_group");
        }
      }

      if (uGroup) {
        isUserGroup = this.isUserGroupMatch(item, uPlanId, uGroup, uPlanName);
      }

      let formKey = "";
      let formLabel = item.form || "";
      const sLower = (item.subject || "").toLowerCase();
      if (/wyk/i.test(sLower) || /\(w\)/i.test(sLower)) { formKey = "lecture"; if (!formLabel) formLabel = "Wykład"; }
      else if (/ćw/i.test(sLower) || /\(ćw\)/i.test(sLower)) { formKey = "exercise"; if (!formLabel) formLabel = "Ćwiczenia"; }
      else if (/lab/i.test(sLower) || /\(lab\)/i.test(sLower)) { formKey = "lab"; if (!formLabel) formLabel = "Laboratorium"; }
      else if (/sym/i.test(sLower) || /\(sym\)/i.test(sLower)) { formKey = "simulator"; if (!formLabel) formLabel = "Symulator"; }
      else if (/proj/i.test(sLower) || /\(pr\)/i.test(sLower)) { formKey = "project"; if (!formLabel) formLabel = "Projekt"; }
      else if (/sem/i.test(sLower) || /\(sem\)/i.test(sLower)) { formKey = "seminar"; if (!formLabel) formLabel = "Seminarium"; }

      const grpObj = formatGroupsSummary(item.groups);
      const typeBadgeHtml = formLabel ? `<span class="lesson-type-pill" data-type="${formKey}">${escapeHtml(formLabel)}</span>` : "";

      let actionBtnHtml = "";
      if (type === "room") {
        if (item.teacher && item.teacher !== "Brak danych prowadzącego") {
          actionBtnHtml = `<button type="button" class="lesson-teacher-btn modal-action-btn" data-teacher="${escapeHtml(item.teacher)}" aria-label="Pokaż plan: ${escapeHtml(item.teacher)}">${escapeHtml(item.teacher)}</button>`;
        } else {
          actionBtnHtml = `<span>Brak danych prowadzącego</span>`;
        }
      } else if (type === "teacher") {
        if (item.room) {
          actionBtnHtml = `<button type="button" class="lesson-room-btn modal-action-btn" data-room="${escapeHtml(item.room)}" aria-label="Pokaż plan sali ${escapeHtml(item.room)}">Sala ${escapeHtml(item.room)}</button>`;
        }
      }

      const primaryParts = [];
      if (item.plan_name) primaryParts.push(escapeHtml(item.plan_name));
      if (grpObj.text && (!item.plan_name || !item.plan_name.toLowerCase().includes(grpObj.text.toLowerCase()))) {
        const titleAttr = grpObj.title && grpObj.title !== grpObj.text ? ` title="${escapeHtml(grpObj.title)}"` : "";
        primaryParts.push(`<span class="groups-nowrap"${titleAttr}>${escapeHtml(grpObj.text)}</span>`);
      }

      const primaryChunksHtml = primaryParts.map((part, idx) => {
        const sep = idx < primaryParts.length - 1 ? "\u00a0·\u00a0" : "";
        return `<span class="meta-chunk">${part}${sep}</span>`;
      }).join("");

      const subtitleHtml = `
        <span class="meta-primary-info"${actionBtnHtml ? ' data-has-action="true"' : ''}>${primaryChunksHtml}</span>
        ${actionBtnHtml ? `<span class="meta-secondary-action"><span class="meta-action-sep" aria-hidden="true"> · </span>${actionBtnHtml}</span>` : ''}
      `;

      return `
        <div class="modal-slot-item${isUserGroup ? ' is-user-group' : ''}">
          <div class="modal-slot-time-col">
            <span class="slot-start-time">${escapeHtml(startTime)}</span>
            <span class="slot-end-time">${escapeHtml(endTime)}</span>
          </div>
          <div class="modal-slot-content-col">
            <div class="modal-slot-top-row">
              ${typeBadgeHtml}
              ${isUserGroup ? '<span class="user-group-badge">Twoja grupa</span>' : ''}
              ${cycleBadges ? `<div class="modal-slot-badges">${cycleBadges}</div>` : ''}
            </div>
            <div class="modal-slot-subject">${escapeHtml(item.subject || "")}</div>
            <div class="modal-slot-meta-subtitle">${subtitleHtml}</div>
          </div>
        </div>
      `;
    }
  };

  // --- Warstwa zarządzania danymi (CrossRef.DataService) ---
  const CACHE_KEY = "umg_cross_ref_cache";
  const SCHEMA_VERSION = 1;

  function _resolveCrossRefCacheKey(tenantId = null) {
    let tid = tenantId;
    if (!tid && typeof window !== "undefined" && window.AppState && typeof window.AppState.getTenantId === "function") {
      tid = window.AppState.getTenantId();
    }
    if (!tid || tid === "umg_wn") return CACHE_KEY;
    return `${tid}_cross_ref_cache`;
  }

  const DataService = {
    CACHE_KEY,
    SCHEMA_VERSION,
    getCacheKey: _resolveCrossRefCacheKey,

    async load(options = {}) {
      const storage = options.storage || (typeof localStorage !== "undefined" ? localStorage : null);
      const fetchFn = options.fetchFn || (typeof fetch !== "undefined" ? fetch : null);
      const url = options.url || "data/cross_reference.json";
      const onUpdate = options.onUpdate || null;
      const cacheKey = _resolveCrossRefCacheKey(options.tenantId);

      let cachedData = null;

      if (storage) {
        try {
          const raw = storage.getItem(cacheKey);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.schemaVersion === SCHEMA_VERSION && parsed.data) {
              cachedData = parsed.data;
            } else {
              storage.removeItem(cacheKey);
            }
          }
        } catch (e) {
          try { storage.removeItem(cacheKey); } catch (_) {}
        }
      }

      const fetchPromise = (async () => {
        if (!fetchFn) return null;
        try {
          const res = await fetchFn(url);
          if (!res.ok) return null;
          const fresh = await res.json();
          if (fresh && storage) {
            try {
              storage.setItem(cacheKey, JSON.stringify({
                schemaVersion: SCHEMA_VERSION,
                cachedAt: Date.now(),
                data: fresh
              }));
            } catch (e) {
              // QuotaExceededError or private browsing restriction
            }
          }
          if (onUpdate && fresh) {
            try { onUpdate(fresh); } catch (_) {}
          }
          return fresh;
        } catch (e) {
          return null;
        }
      })();

      if (cachedData) {
        fetchPromise.catch(() => {});
        return cachedData;
      }

      return await fetchPromise;
    }
  };

  // --- Warstwa widoku i interakcji (CrossRef.UI) ---
  const UI = {
    elements: null,
    scheduleEngine: null,
    cachedData: null,
    previousFocusedElement: null,
    onBeforeOpen: null,
    navHistory: [],
    _isNavigatingHistory: false,
    freeRoomsState: {
      dateISO: null,
      slot: "NOW",
      filterText: ""
    },

    init(config = {}) {
      this.elements = config.elements || {};
      this.scheduleEngine = config.scheduleEngine || null;
      this.onBeforeOpen = config.onBeforeOpen || null;

      // Inicjalizacja nasłuchu zdarzeń modala i wyszukiwarki
      if (this.elements.modal) {
        this._bindAccessibilityEvents();
        this._bindSearchEvents();
      }
    },

    _bindAccessibilityEvents() {
      const modal = this.elements.modal;
      if (!modal) return;

      // Zamykanie przez kliknięcie w przycisk close
      const closeBtn = (typeof modal.querySelector === "function" ? modal.querySelector(".btn-close") : null) ||
        (typeof document !== "undefined" && typeof document.getElementById === "function" ? document.getElementById("close-cross-modal") : null);
      if (closeBtn && typeof closeBtn.addEventListener === "function") {
        closeBtn.addEventListener("click", () => this.closeModal());
      }

      // Przycisk powrotu w historii dialogu
      const backBtn = (typeof modal.querySelector === "function" ? modal.querySelector("#cross-modal-back-btn") : null) ||
        (typeof document !== "undefined" && typeof document.getElementById === "function" ? document.getElementById("cross-modal-back-btn") : null);
      if (backBtn && typeof backBtn.addEventListener === "function") {
        backBtn.addEventListener("click", () => this.popHistory());
      }

      // Obsługa legacy backdrop jeśli istnieje w DOM
      if (typeof modal.querySelector === "function") {
        const backdrop = modal.querySelector(".modal-backdrop");
        if (backdrop && typeof backdrop.addEventListener === "function") {
          backdrop.addEventListener("click", () => this.closeModal());
        }
      }

      // Dialog light-dismiss (kliknięcie poza oknem modalnym)
      if (typeof modal.addEventListener === "function") {
        modal.addEventListener("click", (e) => {
          if (typeof modal.getBoundingClientRect === "function") {
            const rect = modal.getBoundingClientRect();
            const isInDialog = (
              rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
              rect.left <= e.clientX && e.clientX <= rect.left + rect.width
            );
            if (!isInDialog || e.target === modal) {
              this.closeModal();
            }
          } else if (e.target === modal) {
            this.closeModal();
          }
        });

        modal.addEventListener("cancel", (e) => {
          e.preventDefault();
          this.handleEscape();
        });
      }

      // Klawisz Escape i Focus Trap (fallback dla przeglądarek bez natywnego dialogu)
      if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
        document.addEventListener("keydown", (e) => {
          const isHidden = (modal.classList && typeof modal.classList.contains === "function" && modal.classList.contains("hidden")) ||
            (modal.open === false);
          if (isHidden) return;

          if (e.key === "Escape") {
            e.preventDefault();
            this.handleEscape();
            return;
          }

          if (e.key === "Tab") {
            if (typeof modal.querySelectorAll !== "function") return;
            const focusable = modal.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
            if (!focusable || focusable.length === 0) return;

            const first = focusable[0];
            const last = focusable[focusable.length - 1];

            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        });
      }
    },

    _bindSearchEvents() {
      const input = this.elements.searchInput;
      const clearBtn = this.elements.clearSearchBtn;

      if (input && typeof input.addEventListener === "function") {
        input.addEventListener("input", () => this.handleSearch(input.value));
        input.addEventListener("focus", () => {
          if (input.value && input.value.trim().length >= 2) this.handleSearch(input.value);
        });
      }

      if (clearBtn && typeof clearBtn.addEventListener === "function") {
        clearBtn.addEventListener("click", () => this.clearSearch());
      }
    },

    openModal(title, badge, bodyHtml, triggerElement = null) {
      if (!this.elements || !this.elements.modal) return;

      const modal = this.elements.modal;
      const isAlreadyOpen = modal.open || (modal.classList && typeof modal.classList.contains === "function" && !modal.classList.contains("hidden"));

      // Jeśli modal jest już otwarty (np. nawigacja z sali do wykładowcy), nie nadpisujemy triggerElement pierwotnego wywołania
      if (!isAlreadyOpen || triggerElement) {
        this.previousFocusedElement = triggerElement || (typeof document !== "undefined" ? document.activeElement : null);
      }

      if (this.elements.title) this.elements.title.textContent = title;
      if (this.elements.badge) this.elements.badge.textContent = badge;
      if (this.elements.body) this.elements.body.innerHTML = bodyHtml;
      this._updateScopeNotice();

      if (typeof modal.removeAttribute === "function") { modal.removeAttribute("inert"); modal.removeAttribute("hidden"); }
      if (typeof modal.showModal === "function") {
        if (!modal.open) {
          modal.showModal();
        }
      }
      if (modal.classList && typeof modal.classList.remove === "function") {
        modal.classList.remove("hidden");
      }
      if (typeof modal.setAttribute === "function") {
        modal.setAttribute("aria-hidden", "false");
      }

      // Fokus na pierwszy element interaktywny lub przycisk zamknięcia
      if (typeof modal.querySelector === "function") {
        const focusable = modal.querySelector('input, select, button:not(.modal-backdrop), [tabindex="0"]');
        if (focusable && typeof focusable.focus === "function") {
          setTimeout(() => focusable.focus(), 50);
        }
      }
    },

    closeModal() {
      this.navHistory = [];
      this._isNavigatingHistory = false;
      this._updateBackButton();

      if (!this.elements || !this.elements.modal) return;

      const modal = this.elements.modal;
      if (typeof modal.close === "function") {
        if (modal.open) {
          modal.close();
        }
      }
      if (modal.classList && typeof modal.classList.add === "function") {
        modal.classList.add("hidden");
      }
      if (typeof modal.setAttribute === "function") {
        modal.setAttribute("aria-hidden", "true");
      }

      if (this.previousFocusedElement && typeof this.previousFocusedElement.focus === "function") {
        try {
          this.previousFocusedElement.focus();
        } catch (_) {}
      }
    },

    handleEscape() {
      if (this.navHistory && this.navHistory.length > 0) {
        this.popHistory();
        return;
      }
      this.closeModal();
    },

    popHistory() {
      if (!this.navHistory || this.navHistory.length === 0) {
        this.closeModal();
        return;
      }
      const prev = this.navHistory.pop();
      this._isNavigatingHistory = true;
      let p;
      if (prev.type === "teacher") {
        p = this.openTeacher(prev.target, prev.weekOffset);
      } else if (prev.type === "room") {
        p = this.openRoom(prev.target, prev.weekOffset);
      } else if (prev.type === "free_rooms") {
        p = this.openFreeRooms();
      }
      if (p && typeof p.finally === "function") {
        p.finally(() => {
          this._isNavigatingHistory = false;
          this._updateBackButton();
        });
      } else {
        this._isNavigatingHistory = false;
        this._updateBackButton();
      }
      this._updateBackButton();
    },

    _getFacultyAbbr() {
      if (typeof window !== "undefined") {
        const cfg = (window.state && window.state.tenantConfig) ||
          (window.TenantConfig && typeof window.TenantConfig.get === "function" ? window.TenantConfig.get() : null);
        if (cfg && (cfg.faculty || cfg.short_name)) {
          return cfg.faculty || cfg.short_name;
        }
      }
      return "WN";
    },

    _updateScopeNotice(mode = this.currentModalType) {
      const noticeEl = (this.elements && this.elements.scopeNotice) ||
        (typeof document !== "undefined" && typeof document.getElementById === "function" ? document.getElementById("cross-modal-scope-notice") : null);
      if (!noticeEl) return;
      const fac = this._getFacultyAbbr();
      if (mode === "free_rooms") {
        noticeEl.textContent = `Zajęcia z planu ${fac}. Sala może być zajęta przez inny wydział.`;
      } else {
        noticeEl.textContent = `Zajęcia z planu ${fac}. Zajęcia innych wydziałów nie są uwzględnione.`;
      }
    },

    _updateBackButton() {
      const backBtn = typeof document !== "undefined" ? document.getElementById("cross-modal-back-btn") : null;
      const backText = typeof document !== "undefined" ? document.getElementById("cross-modal-back-text") : null;
      if (!backBtn) return;
      if (this.navHistory && this.navHistory.length > 0) {
        const prev = this.navHistory[this.navHistory.length - 1];
        if (backText) backText.textContent = prev.target;
        backBtn.classList.remove("hidden");
        backBtn.setAttribute("aria-label", `Wróć: ${prev.target}`);
      } else {
        backBtn.classList.add("hidden");
      }
    },

    async _ensureData() {
      if (this.cachedData) return this.cachedData;
      const data = await DataService.load({
        onUpdate: (fresh) => {
          this.cachedData = fresh;
        }
      });
      this.cachedData = data;
      return data;
    },

    async openTeacher(teacherName, targetWeekOffset = null) {
      if (this.onBeforeOpen) this.onBeforeOpen();

      const modal = this.elements && this.elements.modal;
      const isCurrentlyOpen = Boolean(modal && (!modal.classList.contains("hidden") || modal.open));
      if (!this._isNavigatingHistory && isCurrentlyOpen && this.currentModalTarget && (this.currentModalTarget !== teacherName || this.currentModalType !== "teacher")) {
        if (!this.navHistory) this.navHistory = [];
        this.navHistory.push({
          type: this.currentModalType,
          target: this.currentModalTarget,
          weekOffset: this.currentModalWeekOffset
        });
      }

      const weekOffset = (typeof targetWeekOffset === "number") ? targetWeekOffset : (
        (typeof window !== "undefined" && window.state && typeof window.state.weekOffset === "number") ? window.state.weekOffset : 0
      );
      this.currentModalType = "teacher";
      this.currentModalTarget = teacherName;
      this.currentModalWeekOffset = weekOffset;
      this._updateBackButton();

      this.openModal(teacherName, "Plan prowadzącego", `<div class="spinner" style="margin: 2rem auto;"></div><p style="text-align:center;">Wczytywanie planu...</p>`);

      const data = await this._ensureData();
      if (!data) {
        this.openModal(teacherName, "Plan prowadzącego", `<p class="placeholder-text" style="text-align:center; padding: 2rem; color: #ef4444;">Nie udało się załadować danych.</p>`);
        return;
      }

      let entries = (data.teachers && data.teachers[teacherName]) || null;
      if (!entries && data.teachers) {
        const lower = teacherName.toLowerCase().trim();
        for (const [k, v] of Object.entries(data.teachers)) {
          if (k.toLowerCase().trim() === lower) {
            entries = v;
            break;
          }
        }
      }
      entries = entries || [];

      if (entries.length === 0) {
        this.openModal(teacherName, "Plan prowadzącego", `<p class="placeholder-text" style="text-align:center; padding: 2rem;">Brak zaplanowanych zajęć w bazie dla ${escapeHtml(teacherName)}.</p>`);
        return;
      }

      // Calculate dates for target week
      const now = new Date();
      const dayOfWeek = now.getDay();
      const diffDays = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1) + weekOffset * 7;
      const targetMonday = new Date(now.getFullYear(), now.getMonth(), diffDays);
      targetMonday.setHours(0, 0, 0, 0);

      const targetSunday = new Date(targetMonday);
      targetSunday.setDate(targetMonday.getDate() + 6);

      const formatShort = d => `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
      const formatIso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const weekDatesText = `${formatShort(targetMonday)} – ${formatShort(targetSunday)}`;

      let acadWeek = "";
      if (typeof window !== "undefined" && window.Timeline && typeof window.Timeline.getAcademicInfoForWeek === "function") {
        const acad = window.Timeline.getAcademicInfoForWeek(targetMonday);
        if (acad && acad.weekNum) acadWeek = `Tydzień ${acad.weekNum} · `;
      }

      const todayStr = (new Date()).toDateString();

      let html = `<div class="modal-schedule-section">`;

      for (let dIdx = 0; dIdx < DNI_TYGODNIA.length; dIdx++) {
        const day = DNI_TYGODNIA[dIdx];
        const dayDate = new Date(targetMonday);
        dayDate.setDate(targetMonday.getDate() + dIdx);
        const dayIso = formatIso(dayDate);
        const isToday = dayDate.toDateString() === todayStr;

        // Filter entries for this day and week date
        const dayEntries = entries.filter(e => {
          if (e.day !== day) return false;
          if (Array.isArray(e.dates) && e.dates.length > 0) {
            return e.dates.includes(dayIso);
          }
          return true;
        });

        if (dayEntries.length === 0) continue;

        dayEntries.sort((a, b) => {
          const startA = parseMinutes((a.hours || "").split(/[-–]/)[0]);
          const startB = parseMinutes((b.hours || "").split(/[-–]/)[0]);
          return startA - startB;
        });

        html += `
          <div class="modal-day-group">
            <div class="modal-day-header ${isToday ? 'is-today' : ''}">
              <span class="modal-day-name">${DNI_PELNE[day] || day}</span>
              <span class="modal-day-date">${formatShort(dayDate)}</span>
              ${isToday ? '<span class="modal-day-today-tag">Dziś</span>' : ''}
            </div>
            <div class="modal-slots-list">
        `;

        for (const e of dayEntries) {
          html += Engine.renderSlotCard(e, "teacher");
        }

        html += `</div></div>`;
      }

      html += `</div>`;
      if (this.elements.weekNav) {
        const weekNavHtml = `
          <button type="button" class="modal-nav-btn modal-prev-week-btn" data-modal-nav="${weekOffset - 1}" aria-label="Poprzedni tydzień">
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"></path></svg>
          </button>
          <span class="modal-week-label">${acadWeek}${weekDatesText}</span>
          <button type="button" class="modal-nav-btn modal-next-week-btn" data-modal-nav="${weekOffset + 1}" aria-label="Następny tydzień">
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"></path></svg>
          </button>
        `;
        this.elements.weekNav.innerHTML = weekNavHtml;
        this.openModal(teacherName, "Plan prowadzącego", html);
      } else {
        const fullHtml = `
          <div class="modal-week-nav">
            <button type="button" class="modal-nav-btn modal-prev-week-btn" data-modal-nav="${weekOffset - 1}" aria-label="Poprzedni tydzień">
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"></path></svg>
            </button>
            <span class="modal-week-label">${acadWeek}${weekDatesText}</span>
            <button type="button" class="modal-nav-btn modal-next-week-btn" data-modal-nav="${weekOffset + 1}" aria-label="Następny tydzień">
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"></path></svg>
            </button>
          </div>
          ${html}
        `;
        this.openModal(teacherName, "Plan prowadzącego", fullHtml);
      }
      this._bindModalActionLinks();
      this._bindModalNavEvents();
    },

    async openRoom(roomName, targetWeekOffset = null) {
      if (this.onBeforeOpen) this.onBeforeOpen();

      const modal = this.elements && this.elements.modal;
      const isCurrentlyOpen = Boolean(modal && (!modal.classList.contains("hidden") || modal.open));
      if (!this._isNavigatingHistory && isCurrentlyOpen && this.currentModalTarget && (this.currentModalTarget !== roomName || this.currentModalType !== "room")) {
        if (!this.navHistory) this.navHistory = [];
        this.navHistory.push({
          type: this.currentModalType,
          target: this.currentModalTarget,
          weekOffset: this.currentModalWeekOffset
        });
      }

      const weekOffset = (typeof targetWeekOffset === "number") ? targetWeekOffset : (
        (typeof window !== "undefined" && window.state && typeof window.state.weekOffset === "number") ? window.state.weekOffset : 0
      );
      this.currentModalType = "room";
      this.currentModalTarget = roomName;
      this.currentModalWeekOffset = weekOffset;
      this._updateBackButton();

      this.openModal(roomName, "Plan sali", `<div class="spinner" style="margin: 2rem auto;"></div><p style="text-align:center;">Wczytywanie obłożenia sali...</p>`);

      const data = await this._ensureData();
      if (!data) {
        this.openModal(roomName, "Plan sali", `<p class="placeholder-text" style="text-align:center; padding: 2rem; color: #ef4444;">Nie udało się załadować danych.</p>`);
        return;
      }

      let roomDays = (data.rooms && data.rooms[roomName]) || null;
      if (!roomDays && data.rooms) {
        const lower = roomName.toLowerCase().trim();
        for (const [k, v] of Object.entries(data.rooms)) {
          if (k.toLowerCase().trim() === lower) {
            roomDays = v;
            break;
          }
        }
      }
      roomDays = roomDays || {};

      const now = new Date();
      const dayOfWeek = now.getDay();
      const diffDays = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1) + weekOffset * 7;
      const targetMonday = new Date(now.getFullYear(), now.getMonth(), diffDays);
      targetMonday.setHours(0, 0, 0, 0);

      const targetSunday = new Date(targetMonday);
      targetSunday.setDate(targetMonday.getDate() + 6);

      const formatShort = d => `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
      const formatIso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const weekDatesText = `${formatShort(targetMonday)} – ${formatShort(targetSunday)}`;

      let acadWeek = "";
      if (typeof window !== "undefined" && window.Timeline && typeof window.Timeline.getAcademicInfoForWeek === "function") {
        const acad = window.Timeline.getAcademicInfoForWeek(targetMonday);
        if (acad && acad.weekNum) acadWeek = `Tydzień ${acad.weekNum} · `;
      }

      const todayStr = (new Date()).toDateString();

      function formatMin(mins) {
        const h = String(Math.floor(mins / 60)).padStart(2, "0");
        const m = String(mins % 60).padStart(2, "0");
        return `${h}:${m}`;
      }

      let html = `<div class="modal-schedule-section">`;

      for (let dIdx = 0; dIdx < DNI_TYGODNIA.length; dIdx++) {
        const day = DNI_TYGODNIA[dIdx];
        const dayDate = new Date(targetMonday);
        dayDate.setDate(targetMonday.getDate() + dIdx);
        const dayIso = formatIso(dayDate);
        const isToday = dayDate.toDateString() === todayStr;

        const dayEntries = (roomDays[day] || []).filter(e => {
          if (Array.isArray(e.dates) && e.dates.length > 0) {
            return e.dates.includes(dayIso);
          }
          return true;
        });

        if (dayEntries.length === 0) continue;

        dayEntries.sort((a, b) => {
          const startA = parseMinutes((a.hours || "").split(/[-–]/)[0]);
          const startB = parseMinutes((b.hours || "").split(/[-–]/)[0]);
          return startA - startB;
        });

        html += `
          <div class="modal-day-group">
            <div class="modal-day-header ${isToday ? 'is-today' : ''}">
              <span class="modal-day-name">${DNI_PELNE[day] || day}</span>
              <span class="modal-day-date">${formatShort(dayDate)}</span>
              ${isToday ? '<span class="modal-day-today-tag">Dziś</span>' : ''}
            </div>
            <div class="modal-slots-list">
        `;

        let lastEnd = null;
        for (let i = 0; i < dayEntries.length; i++) {
          const e = dayEntries[i];
          const parts = (e.hours || "").split(/[-–]/).map(s => s.trim());
          const startM = parseMinutes(parts[0]);
          const endM = parseMinutes(parts[1]);

          if (lastEnd !== null && startM - lastEnd >= 15) {
            html += `
              <div class="modal-free-slot">
                <div class="modal-slot-time-col">
                  <span class="slot-start-time">${formatMin(lastEnd)}</span>
                  <span class="slot-end-time">${formatMin(startM)}</span>
                </div>
                <div class="modal-free-label">Sala wolna</div>
              </div>
            `;
          }

          html += Engine.renderSlotCard(e, "room");
          lastEnd = Math.max(lastEnd || 0, endM);
        }

        html += `</div></div>`;
      }

      html += `</div>`;
      if (this.elements.weekNav) {
        const weekNavHtml = `
          <button type="button" class="modal-nav-btn modal-prev-week-btn" data-modal-nav="${weekOffset - 1}" aria-label="Poprzedni tydzień">
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"></path></svg>
          </button>
          <span class="modal-week-label">${acadWeek}${weekDatesText}</span>
          <button type="button" class="modal-nav-btn modal-next-week-btn" data-modal-nav="${weekOffset + 1}" aria-label="Następny tydzień">
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"></path></svg>
          </button>
        `;
        this.elements.weekNav.innerHTML = weekNavHtml;
        this.openModal(roomName, "Plan sali", html);
      } else {
        const fullHtml = `
          <div class="modal-week-nav">
            <button type="button" class="modal-nav-btn modal-prev-week-btn" data-modal-nav="${weekOffset - 1}" aria-label="Poprzedni tydzień">
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"></path></svg>
            </button>
            <span class="modal-week-label">${acadWeek}${weekDatesText}</span>
            <button type="button" class="modal-nav-btn modal-next-week-btn" data-modal-nav="${weekOffset + 1}" aria-label="Następny tydzień">
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"></path></svg>
            </button>
          </div>
          ${html}
        `;
        this.openModal(roomName, "Plan sali", fullHtml);
      }
      this._bindModalActionLinks();
      this._bindModalNavEvents();
    },

    _bindModalNavEvents() {
      if (!this.elements) return;
      const root = this.elements.modal || this.elements.body;
      if (!root) return;
      const navButtons = root.querySelectorAll("button[data-modal-nav]");
      navButtons.forEach(btn => {
        btn.addEventListener("click", () => {
          const targetOffset = parseInt(btn.getAttribute("data-modal-nav"), 10);
          if (this.currentModalType === "room" && this.currentModalTarget) {
            this.openRoom(this.currentModalTarget, targetOffset);
          } else if (this.currentModalType === "teacher" && this.currentModalTarget) {
            this.openTeacher(this.currentModalTarget, targetOffset);
          }
        });
      });
    },

    async openSubject(subjectName) {
      if (this.onBeforeOpen) this.onBeforeOpen();
      this.currentModalType = "subject";
      this.currentModalTarget = subjectName;
      this._updateBackButton();
      if (this.elements && this.elements.weekNav) this.elements.weekNav.innerHTML = "";

      this.openModal(subjectName, "📚 Przedmiot", `<div class="spinner" style="margin: 2rem auto;"></div><p style="text-align:center;">Wczytywanie szczegółów przedmiotu...</p>`);

      const data = await this._ensureData();
      if (!data) {
        this.openModal(subjectName, "📚 Przedmiot", `<p class="placeholder-text" style="text-align:center; padding: 2rem; color: #ef4444;">Nie udało się załadować danych.</p>`);
        return;
      }

      let sInfo = (data.subjects && data.subjects[subjectName]) || null;
      if (!sInfo && data.subjects) {
        const lower = subjectName.toLowerCase().trim();
        for (const [k, v] of Object.entries(data.subjects)) {
          if (k.toLowerCase().trim() === lower) {
            sInfo = v;
            break;
          }
        }
      }

      if (!sInfo) {
        this.openModal(subjectName, "📚 Przedmiot", `<p class="placeholder-text" style="text-align:center; padding: 2rem;">Brak danych w bazie dla przedmiotu ${escapeHtml(subjectName)}.</p>`);
        return;
      }

      let html = `<div class="modal-schedule-section">`;

      if (sInfo.raw_variants && sInfo.raw_variants.length > 0) {
        html += `
          <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.5rem;">
            Oznaczenia w planach: ${sInfo.raw_variants.map(v => `<code>${escapeHtml(v)}</code>`).join(", ")}
          </div>
        `;
      }

      if (sInfo.teachers && sInfo.teachers.length > 0) {
        html += `
          <div style="margin-top: 0.5rem;">
            <div class="control-label" style="margin-bottom: 0.25rem;">Prowadzący ten przedmiot:</div>
            <div style="display: flex; flex-direction: column; gap: 0.35rem;">
              ${sInfo.teachers.map(t => `<button class="lesson-teacher-btn" data-teacher="${escapeHtml(t)}">👨‍🏫 ${escapeHtml(t)}</button>`).join("")}
            </div>
          </div>
        `;
      }

      if (sInfo.plans && sInfo.plans.length > 0) {
        html += `
          <div style="margin-top: 0.5rem;">
            <div class="control-label" style="margin-bottom: 0.25rem;">Grupy realizujące ten przedmiot w semestrze:</div>
            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
        `;
        for (const p of sInfo.plans) {
          const gChips = (p.groups || []).map(g => `<span class="modal-group-chip">${escapeHtml(g)}</span>`).join("");
          html += `
            <div style="font-size: 0.82rem; color: var(--text-secondary); background: var(--bg-card); padding: 0.5rem 0.75rem; border-radius: 6px; border: 1px solid var(--border-subtle);">
              <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 0.25rem;">${escapeHtml(p.plan_name)}</div>
              <div class="modal-groups-chips">${gChips}</div>
            </div>
          `;
        }
        html += `</div></div>`;
      }

      html += `</div>`;
      this.openModal(subjectName, "📚 Przedmiot", html);
      this._bindModalActionLinks();
    },

    async openFreeRooms(customOptions = {}) {
      if (this.onBeforeOpen) this.onBeforeOpen();
      this.currentModalType = "free_rooms";
      this.currentModalTarget = "Dostępność sal";
      this._updateBackButton();
      if (this.elements && this.elements.weekNav) this.elements.weekNav.innerHTML = "";

      this.openModal("Dostępność sal", "🔎 Wolne sale", `<div class="spinner" style="margin: 2rem auto;"></div><p style="text-align:center;">Sprawdzanie dostępności sal...</p>`);

      const data = await this._ensureData();
      if (!data) {
        this.openModal("Dostępność sal", "🔎 Wolne sale", `<p class="placeholder-text" style="text-align:center; padding: 2rem; color: #ef4444;">Nie udało się załadować danych.</p>`);
        return;
      }

      const warsawToday = getWarsawTimeParts(new Date());
      const dateISO = customOptions.dateISO || this.freeRoomsState.dateISO || warsawToday.dateISO;
      const slot = customOptions.slot || this.freeRoomsState.slot || "NOW";
      const filterText = (customOptions.filterText !== undefined) ? customOptions.filterText : this.freeRoomsState.filterText;

      this.freeRoomsState.dateISO = dateISO;
      this.freeRoomsState.slot = slot;
      this.freeRoomsState.filterText = filterText;

      let queryRange;
      if (slot === "NOW") {
        const curMinutes = warsawToday.minutes;
        queryRange = { start: curMinutes, end: curMinutes + 1 };
      } else {
        const parts = slot.split(" - ");
        if (parts.length === 2) {
          queryRange = { start: parseMinutes(parts[0]), end: parseMinutes(parts[1]) };
        } else {
          queryRange = { start: 0, end: 1440 };
        }
      }

      const roomStatuses = Engine.findFreeRooms(data, {
        dateISO,
        queryRange,
        scheduleEngine: this.scheduleEngine,
        filterText
      });

      const totalRoomsCount = (data.room_list || []).length;
      const freeCount = roomStatuses.filter(r => r.isFree).length;

      // Wyznaczenie zamiany rektorskiej dla wybranej daty (jeśli występuje)
      let swapNoteHtml = "";
      if (this.scheduleEngine) {
        const effectiveDay = this.scheduleEngine.resolveBaseDay(dateISO);
        const [y, m, d] = dateISO.split("-").map(Number);
        const standardDay = ["ND", "PON", "WT", "ŚR", "CZW", "PT", "SOB"][new Date(y, m - 1, d).getDay()];
        if (effectiveDay && standardDay && effectiveDay !== standardDay) {
          swapNoteHtml = `<div style="margin-top: 0.5rem; font-size: 0.82rem; padding: 0.4rem 0.6rem; border-radius: 6px; background: rgba(59, 130, 246, 0.1); color: var(--brand-primary); font-weight: 600;">🔄 Zarządzenie rektorskie: Ten dzień realizuje plan ze środy (${DNI_PELNE[effectiveDay] || effectiveDay})</div>`;
        }
      }

      let html = `
        <div class="free-rooms-controls">
          <div class="free-rooms-control-group">
            <label for="fr-date-input">Data zajęć:</label>
            <div style="display:flex; gap:0.4rem; align-items:center;">
              <input type="date" id="fr-date-input" value="${escapeHtml(dateISO)}" style="padding:0.45rem 0.6rem; border-radius:6px; border:1px solid var(--border-strong); background:var(--bg-card); color:var(--text-primary); font-family:inherit; font-size:0.88rem; flex:1;" />
              <button type="button" id="fr-today-btn" class="btn-today" style="font-size:0.78rem; padding:0.45rem 0.65rem;">Dziś</button>
              <button type="button" id="fr-tomorrow-btn" class="btn-today" style="font-size:0.78rem; padding:0.45rem 0.65rem;">Jutro</button>
            </div>
          </div>
          <div class="free-rooms-control-group">
            <label for="fr-slot-select">Przedział godzinowy:</label>
            <select id="fr-slot-select">
              <option value="NOW" ${slot === "NOW" ? "selected" : ""}>Teraz (bieżący czas)</option>
              ${STANDARD_SLOTS.map(s => `<option value="${s.label}" ${s.label === slot ? "selected" : ""}>${s.label}</option>`).join("")}
            </select>
          </div>
          <div class="free-rooms-control-group" style="min-width: 160px;">
            <label for="fr-search-input">Filtruj sale:</label>
            <input type="text" id="fr-search-input" placeholder="np. 114, aula, P..." value="${escapeHtml(filterText)}" style="padding:0.45rem 0.6rem; border-radius:6px; border:1px solid var(--border-strong); background:var(--bg-card); color:var(--text-primary); font-family:inherit; font-size:0.88rem;" />
          </div>
        </div>

        ${swapNoteHtml}

        <div class="free-rooms-summary-banner">
          <span id="fr-summary-text">Dostępne sale: <strong style="color: var(--color-success);">${freeCount}</strong> z ${roomStatuses.length}</span>
          <span style="font-size: 0.8rem; color: var(--text-muted);">Kliknij salę, aby sprawdzić jej plan</span>
        </div>

        <div class="free-rooms-grid" id="fr-rooms-grid">
      `;

      for (const st of roomStatuses) {
        if (st.isFree) {
          let subtext = "Wolna do końca dnia";
          if (st.nextClass && st.nextClass.hours) {
            const nextStart = st.nextClass.hours.split(" - ")[0];
            subtext = `Wolna do ${nextStart}`;
          }
          html += `
            <div class="free-room-card status-free" data-room="${escapeHtml(st.room)}">
              <div class="free-room-header">
                <span class="free-room-name">Sala ${escapeHtml(st.room)}</span>
                <span class="free-room-badge">WOLNA</span>
              </div>
              <div class="free-room-detail" style="color: var(--color-success); font-weight: 600;">${escapeHtml(subtext)}</div>
            </div>
          `;
        } else {
          const cls = st.occupyingClass || {};
          html += `
            <div class="free-room-card status-busy" data-room="${escapeHtml(st.room)}">
              <div class="free-room-header">
                <span class="free-room-name">Sala ${escapeHtml(st.room)}</span>
                <span class="free-room-badge">ZAJĘTA</span>
              </div>
              <div class="free-room-detail" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${escapeHtml(cls.subject || "Zajęcia")} (${escapeHtml(cls.hours || "")})
              </div>
            </div>
          `;
        }
      }

      html += `</div>`;

      this.openModal("Dostępność sal", "🔎 Wolne sale", html);

      // Podpięcie zdarzeń kontrolek (w środowisku przeglądarkowym)
      if (typeof document !== "undefined") {
        const dateInput = document.getElementById("fr-date-input");
        const todayBtn = document.getElementById("fr-today-btn");
        const tomorrowBtn = document.getElementById("fr-tomorrow-btn");
        const slotSelect = document.getElementById("fr-slot-select");
        const filterInput = document.getElementById("fr-search-input");
        const roomsGrid = document.getElementById("fr-rooms-grid");
        const summaryText = document.getElementById("fr-summary-text");

        if (dateInput) {
          dateInput.addEventListener("change", () => {
            this.openFreeRooms({ dateISO: dateInput.value, slot: slotSelect ? slotSelect.value : slot });
          });
        }

        if (todayBtn) {
          todayBtn.addEventListener("click", () => {
            const nowParts = getWarsawTimeParts(new Date());
            this.openFreeRooms({ dateISO: nowParts.dateISO, slot: slotSelect ? slotSelect.value : slot });
          });
        }

        if (tomorrowBtn) {
          tomorrowBtn.addEventListener("click", () => {
            const tomDate = new Date();
            tomDate.setDate(tomDate.getDate() + 1);
            const tomParts = getWarsawTimeParts(tomDate);
            this.openFreeRooms({ dateISO: tomParts.dateISO, slot: slotSelect ? slotSelect.value : slot });
          });
        }

        if (slotSelect) {
          slotSelect.addEventListener("change", () => {
            this.openFreeRooms({ dateISO: dateInput ? dateInput.value : dateISO, slot: slotSelect.value });
          });
        }

        // Szybkie filtrowanie sal na żywo (od 1 znaku)
        if (filterInput && roomsGrid) {
          filterInput.addEventListener("input", (e) => {
            const val = normalizeQuery(e.target.value.trim());
            this.freeRoomsState.filterText = e.target.value;
            const cards = roomsGrid.querySelectorAll(".free-room-card");
            let visibleCount = 0;
            let visibleFree = 0;

            cards.forEach(card => {
              const r = normalizeQuery(card.dataset.room || "");
              const matches = val.length === 0 || r.includes(val);
              card.style.display = matches ? "" : "none";
              if (matches) {
                visibleCount++;
                if (card.classList.contains("status-free")) visibleFree++;
              }
            });

            if (summaryText) {
              summaryText.innerHTML = `Dostępne sale: <strong style="color: var(--color-success);">${visibleFree}</strong> z ${visibleCount}`;
            }
          });
        }
      }

      // Kliknięcie w kafelek sali otwiera jej tygodniowy plan
      if (this.elements && this.elements.body && typeof this.elements.body.querySelectorAll === "function") {
        this.elements.body.querySelectorAll(".free-room-card").forEach(card => {
          card.addEventListener("click", () => {
            const r = card.dataset.room;
            if (r) this.openRoom(r);
          });
        });
      }
    },

    _bindModalActionLinks() {
      if (!this.elements || !this.elements.body || typeof this.elements.body.querySelectorAll !== "function") return;

      this.elements.body.querySelectorAll(".lesson-teacher-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const t = btn.dataset.teacher;
          if (t) this.openTeacher(t);
        });
      });

      this.elements.body.querySelectorAll(".lesson-room-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const r = btn.dataset.room;
          if (r) this.openRoom(r);
        });
      });
    },

    async handleSearch(query) {
      const resultsContainer = this.elements.searchResults;
      const clearBtn = this.elements.clearSearchBtn;

      if (!query || query.trim().length < 2) {
        if (resultsContainer) {
          resultsContainer.innerHTML = "";
          resultsContainer.classList.add("hidden");
        }
        if (clearBtn) clearBtn.classList.add("hidden");
        return;
      }

      if (clearBtn) clearBtn.classList.remove("hidden");

      const data = await this._ensureData();
      if (!data) return;

      const searchRes = Engine.search(data, query, 5);
      const totalResults = searchRes.teachers.length + searchRes.rooms.length + searchRes.subjects.length;

      if (totalResults === 0) {
        if (resultsContainer) {
          resultsContainer.innerHTML = `<div class="search-no-results">Brak wyników dla "${escapeHtml(query)}"</div>`;
          resultsContainer.classList.remove("hidden");
        }
        return;
      }

      let html = "";
      if (searchRes.teachers.length > 0) {
        html += `<div class="search-group-header">👨‍🏫 Wykładowcy</div>`;
        for (const t of searchRes.teachers) {
          html += `
            <button class="search-result-item" data-type="teacher" data-id="${escapeHtml(t.name)}">
              <div class="search-result-main">
                <span class="search-result-title">${escapeHtml(t.name)}</span>
                <span class="search-result-subtitle">${t.classCount} zajęć w tygodniu</span>
              </div>
              <span class="search-result-badge">Plan</span>
            </button>
          `;
        }
      }

      if (searchRes.rooms.length > 0) {
        html += `<div class="search-group-header">🚪 Sale</div>`;
        for (const r of searchRes.rooms) {
          html += `
            <button class="search-result-item" data-type="room" data-id="${escapeHtml(r.room)}">
              <div class="search-result-main">
                <span class="search-result-title">Sala ${escapeHtml(r.room)}</span>
                <span class="search-result-subtitle">Dostępność i zajęcia</span>
              </div>
              <span class="search-result-badge">Sala</span>
            </button>
          `;
        }
      }

      if (searchRes.subjects.length > 0) {
        html += `<div class="search-group-header">📚 Przedmioty</div>`;
        for (const s of searchRes.subjects) {
          const teachersStr = (s.teachers || []).slice(0, 2).join(", ");
          html += `
            <button class="search-result-item" data-type="subject" data-id="${escapeHtml(s.name)}">
              <div class="search-result-main">
                <span class="search-result-title">${escapeHtml(s.name)}</span>
                <span class="search-result-subtitle">${escapeHtml(teachersStr || "Szczegóły przedmiotu")}</span>
              </div>
              <span class="search-result-badge">Przedmiot</span>
            </button>
          `;
        }
      }

      if (resultsContainer) {
        resultsContainer.innerHTML = html;
        resultsContainer.classList.remove("hidden");

        resultsContainer.querySelectorAll(".search-result-item").forEach(item => {
          item.addEventListener("click", () => {
            const type = item.dataset.type;
            const id = item.dataset.id;
            if (type === "teacher") this.openTeacher(id);
            else if (type === "room") this.openRoom(id);
            else if (type === "subject") this.openSubject(id);
          });
        });
      }
    },

    clearSearch() {
      if (this.elements.searchInput) {
        this.elements.searchInput.value = "";
      }
      if (this.elements.searchResults) {
        this.elements.searchResults.innerHTML = "";
        this.elements.searchResults.classList.add("hidden");
      }
      if (this.elements.clearSearchBtn) {
        this.elements.clearSearchBtn.classList.add("hidden");
      }
    }
  };

  return {
    Engine,
    DataService,
    UI
  };
});
