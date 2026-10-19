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

    renderSlotCard(item, type = "room") {
      if (!item) return "";

      let cycleBadges = "";
      if (item.polowa_sem) {
        cycleBadges += `<span class="lesson-sem-badge">${escapeHtml(item.polowa_sem)}. poł. sem.</span>`;
      }
      if (item.co_ile === 2) {
        const odStr = item.od_tyg === 2 ? "od 2 tyg" : "od 1 tyg";
        cycleBadges += `<span class="lesson-cycle-badge">co 2 tyg (${odStr})</span>`;
      }

      const isPhys = item.room && item.room.toUpperCase() !== "OL";
      const roomBtn = item.room
        ? (isPhys
          ? `<button class="lesson-room-btn" data-room="${escapeHtml(item.room)}">🚪 Sala ${escapeHtml(item.room)}</button>`
          : `<span class="lesson-room-badge">${escapeHtml(item.room)}</span>`)
        : "";

      const teacherHtml = item.teacher && item.teacher !== "Brak danych prowadzącego"
        ? `<button class="lesson-teacher-btn" data-teacher="${escapeHtml(item.teacher)}">👨‍🏫 ${escapeHtml(item.teacher)}</button>`
        : (item.teacher ? `<span style="font-style: italic; font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(item.teacher)}</span>` : "");

      const groupsHtml = (item.groups || []).map(g => `<span class="modal-group-chip">${escapeHtml(g)}</span>`).join("");
      const planNameHtml = item.plan_name ? `<div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(item.plan_name)}</div>` : "";

      return `
        <div class="modal-slot-item">
          <div class="modal-slot-header">
            <span class="modal-slot-time">${escapeHtml(item.hours || "")}</span>
            <div style="display:flex; gap:0.35rem; align-items:center;">
              ${cycleBadges}
              ${type === "room" ? `<span class="free-room-badge" style="background: rgba(239, 68, 68, 0.15); color: #ef4444;">Zajęta</span>` : roomBtn}
            </div>
          </div>
          <div class="modal-slot-subject">${escapeHtml(item.subject || "")}</div>
          <div class="modal-slot-meta">
            ${type === "room" ? teacherHtml : (type === "teacher" ? `<span>Grupy:</span>` : "")}
            <div class="modal-groups-chips">${groupsHtml}</div>
          </div>
          ${planNameHtml}
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
          this.closeModal();
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
            this.closeModal();
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

    async openTeacher(teacherName) {
      if (this.onBeforeOpen) this.onBeforeOpen();

      this.openModal(teacherName, "👨‍🏫 Wykładowca", `<div class="spinner" style="margin: 2rem auto;"></div><p style="text-align:center;">Wczytywanie planu...</p>`);

      const data = await this._ensureData();
      if (!data) {
        this.openModal(teacherName, "👨‍🏫 Wykładowca", `<p class="placeholder-text" style="text-align:center; padding: 2rem; color: #ef4444;">Nie udało się załadować danych.</p>`);
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
        this.openModal(teacherName, "👨‍🏫 Wykładowca", `<p class="placeholder-text" style="text-align:center; padding: 2rem;">Brak zaplanowanych zajęć w bazie dla ${escapeHtml(teacherName)}.</p>`);
        return;
      }

      const byDay = {};
      for (const day of DNI_TYGODNIA) byDay[day] = [];
      for (const entry of entries) {
        if (!byDay[entry.day]) byDay[entry.day] = [];
        byDay[entry.day].push(entry);
      }

      let html = `<div class="modal-schedule-section">`;
      html += `<p style="margin-bottom: 0.5rem; color: var(--text-secondary);">Łącznie zajęć w tygodniu: <strong>${entries.length}</strong></p>`;

      for (const day of DNI_TYGODNIA) {
        const dayEntries = byDay[day] || [];
        if (dayEntries.length === 0) continue;

        html += `
          <div class="modal-day-group">
            <div class="modal-day-title">
              <span>${DNI_PELNE[day] || day}</span>
              <span>${dayEntries.length} ${dayEntries.length === 1 ? 'zajęcia' : 'zajęć'}</span>
            </div>
            <div class="modal-slots-list">
        `;

        for (const e of dayEntries) {
          html += Engine.renderSlotCard(e, "teacher");
        }

        html += `</div></div>`;
      }

      html += `</div>`;
      this.openModal(teacherName, "👨‍🏫 Wykładowca", html);
      this._bindModalActionLinks();
    },

    async openRoom(roomName) {
      if (this.onBeforeOpen) this.onBeforeOpen();

      this.openModal(`Sala ${roomName}`, "🚪 Sala", `<div class="spinner" style="margin: 2rem auto;"></div><p style="text-align:center;">Wczytywanie obłożenia sali...</p>`);

      const data = await this._ensureData();
      if (!data) {
        this.openModal(`Sala ${roomName}`, "🚪 Sala", `<p class="placeholder-text" style="text-align:center; padding: 2rem; color: #ef4444;">Nie udało się załadować danych.</p>`);
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

      let totalBooked = 0;
      for (const d of Object.values(roomDays)) totalBooked += d.length;

      let html = `<div class="modal-schedule-section">`;
      html += `<p style="margin-bottom: 0.5rem; color: var(--text-secondary);">Tygodniowe obłożenie sali: <strong>${totalBooked}</strong> bloków zajęciowych.</p>`;

      for (const day of DNI_TYGODNIA) {
        const dayEntries = roomDays[day] || [];
        html += `
          <div class="modal-day-group">
            <div class="modal-day-title">
              <span>${DNI_PELNE[day] || day}</span>
              <span>${dayEntries.length > 0 ? `${dayEntries.length} zajęć` : 'Wolna cały dzień'}</span>
            </div>
            <div class="modal-slots-list">
        `;

        if (dayEntries.length === 0) {
          html += `<p style="padding: 0.75rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">Brak zajęć w tym dniu (sala wolna)</p>`;
        } else {
          for (const e of dayEntries) {
            html += Engine.renderSlotCard(e, "room");
          }
        }

        html += `</div></div>`;
      }

      html += `</div>`;
      this.openModal(`Sala ${roomName}`, "🚪 Sala", html);
      this._bindModalActionLinks();
    },

    async openSubject(subjectName) {
      if (this.onBeforeOpen) this.onBeforeOpen();

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
