/**
 * Render Module (web/js/render.js)
 * Renderowanie kart zajęć, widoku siatki planu, zakładek dni, powiadomień kalendarza i modala PWA.
 * Zgodny z UMD: działa w przeglądarce i środowisku Node.js.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ScheduleRender = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DNI_TYGODNIA = ["PON", "WT", "ŚR", "CZW", "PT", "SOB", "ND"];
  const DNI_PELNE = {
    "PON": "Poniedziałek",
    "WT": "Wtorek",
    "ŚR": "Środa",
    "CZW": "Czwartek",
    "PT": "Piątek",
    "SOB": "Sobota",
    "ND": "Niedziela"
  };

  const DNI_DOPELNIACZ = {
    "PON": "poniedziałku",
    "WT": "wtorku",
    "ŚR": "środy",
    "CZW": "czwartku",
    "PT": "piątku",
    "SOB": "soboty",
    "ND": "niedzieli"
  };

  const DNI_MIEJSCOWNIK = {
    "PON": "poniedziałek",
    "WT": "wtorek",
    "ŚR": "środę",
    "CZW": "czwartek",
    "PT": "piątek",
    "SOB": "sobotę",
    "ND": "niedzielę"
  };

  const DNI_PRZYMIOTNIK = {
    "PON": "poniedziałkowym",
    "WT": "wtorkowym",
    "ŚR": "środowym",
    "CZW": "czwartkowym",
    "PT": "piątkowym",
    "SOB": "sobotnim",
    "ND": "niedzielnym"
  };

  const DNI_PRZYIMEK = {
    "PON": "w",
    "WT": "we",
    "ŚR": "w",
    "CZW": "w",
    "PT": "w",
    "SOB": "w",
    "ND": "w"
  };

  function escapeHtml(str) {
    if (typeof document !== "undefined" && document.createElement) {
      const div = document.createElement("div");
      div.textContent = str;
      return div.innerHTML;
    }
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function icon(name, extraClass = "", style = "") {
    const cls = extraClass ? `icon ${extraClass}` : "icon";
    const styleAttr = style ? ` style="${style}"` : "";
    return `<svg class="${cls}"${styleAttr} aria-hidden="true"><use href="#icon-${name}"></use></svg>`;
  }

  function renderLessonCard(
    lesson,
    targetMonday = null,
    day = null,
    options = {}
  ) {
    if (!lesson) return "";

    const getProgressFn = options.getLessonProgress || (typeof window !== "undefined" && window.getLessonProgress);
    const isHideableFn = options.isHideableLesson || (typeof window !== "undefined" && window.isHideableLesson) || (typeof window !== "undefined" && window.LessonHiding && window.LessonHiding.isHideableLesson);
    const getSlotKeyFn = options.getLessonSlotKey || (typeof window !== "undefined" && window.getLessonSlotKey) || (typeof window !== "undefined" && window.LessonHiding && window.LessonHiding.getLessonSlotKey);
    const hiddenSlots = options.hiddenLessonSlots || (typeof window !== "undefined" && window.state && window.state.hiddenLessonSlots);

    const safeTitle = escapeHtml(lesson.przedmiot || lesson.subject || "Zajęcia");
    const safeTime = escapeHtml(lesson.godziny || `${lesson.start_time || ''} - ${lesson.end_time || ''}`);
    const rawRoom = (lesson.sala || lesson.room || "").trim();
    const safeRoom = escapeHtml(rawRoom || "OL");
    const rawTeacher = (lesson.prowadzacy || lesson.teacher || "").trim();
    const safeTeacher = escapeHtml(rawTeacher);

    const baseDay = day || lesson.sourceDay || lesson.day || "PON";
    const slotKey = getSlotKeyFn ? getSlotKeyFn(lesson, baseDay) : (lesson.id || "");
    const isHidden = Boolean(lesson._isHidden);
    const isHiddenClass = isHidden ? " is-hidden-lesson" : "";

    const canHide = isHideableFn ? isHideableFn(lesson) : false;
    const isSlotInSet = Boolean(hiddenSlots && hiddenSlots.has(slotKey));
    const hideBtnIcon = (isHidden || isSlotInSet) ? "#icon-visibility" : "#icon-visibility_off";
    const hideBtnTitle = (isHidden || isSlotInSet) ? "Przywróć ten termin zajęć" : "Ukryj ten termin zajęć";
    const hideBtnAria = (isHidden || isSlotInSet) ? "Przywróć zajęcia" : "Ukryj zajęcia";

    const hideBtnHtml = canHide ? `
    <button type="button" class="btn-hide-lesson" data-slot-key="${escapeHtml(slotKey)}" data-day="${escapeHtml(baseDay)}" title="${hideBtnTitle}" aria-label="${hideBtnAria}">
      <svg class="icon" aria-hidden="true"><use href="${hideBtnIcon}"></use></svg>
    </button>
  ` : "";

    const hiddenBadge = isHidden
      ? `<span class="hidden-lesson-badge" title="Ten termin zajęć jest ukryty w Twoim widoku">Ukryty</span>`
      : "";

    const prog = getProgressFn ? getProgressFn(lesson, lesson.sourceDay || baseDay, targetMonday, lesson.lessonDate || null) : null;

    const isPhysicalRoom = rawRoom && rawRoom.toUpperCase() !== "OL";
    const roomHtml = isPhysicalRoom
      ? `<button class="lesson-room-btn" data-room="${escapeHtml(rawRoom)}" title="Sprawdź plan i dostępność sali ${safeRoom}">${safeRoom}</button>`
      : `<span class="lesson-room-badge">${safeRoom}</span>`;

    const teacherHtml = rawTeacher && rawTeacher !== "Brak danych prowadzącego"
      ? `<button class="lesson-teacher-btn" data-teacher="${escapeHtml(rawTeacher)}" title="Zobacz pełny plan wykładowcy ${safeTeacher}">${safeTeacher}</button>`
      : `<span class="lesson-teacher">${safeTeacher || "Brak danych prowadzącego"}</span>`;

    const weeksHtml = prog
      ? `<span class="lesson-weeks ${prog.isFinal ? 'final-week' : ''}" title="${escapeHtml(prog.title || 'Spotkanie')}">${escapeHtml(prog.text)}</span>`
      : "";

    let badgeHtml = "";
    if (lesson.co_ile === 2) {
      badgeHtml += `<span class="lesson-cycle-badge" title="Zajęcia odbywają się co 2 tygodnie">co 2 tyg.</span>`;
    }
    if (lesson.polowa_sem === 1) {
      badgeHtml += `<span class="lesson-sem-badge" title="Zajęcia w 1. połowie semestru">1. poł. sem.</span>`;
    } else if (lesson.polowa_sem === 2) {
      badgeHtml += `<span class="lesson-sem-badge" title="Zajęcia w 2. połowie semestru">2. poł. sem.</span>`;
    }
    if (lesson._proposalOverlay) {
      badgeHtml += `<span class="lesson-proposal-badge" title="Propozycja społeczności (głosy: ${escapeHtml(String(lesson._proposalOverlay.votesCount || 0))})">★ Propozycja społeczności</span>`;
    }

    const formVal = lesson.forma || lesson.form || "";
    const formClass = formVal ? ` form-${escapeHtml(formVal)}` : "";

    return `
    <div class="lesson-card${formClass}${isHiddenClass}" data-slot-key="${escapeHtml(slotKey)}" data-day="${escapeHtml(baseDay)}">
      <div class="lesson-header-row">
        <div class="lesson-title">${safeTitle}</div>
        ${(canHide || hiddenBadge) ? `
        <div class="lesson-card-actions">
          ${hiddenBadge}
          ${hideBtnHtml}
        </div>` : ""}
      </div>
      <div class="lesson-time">${safeTime}</div>
      <div class="lesson-room-wrapper">${roomHtml}${badgeHtml}</div>
      <div class="lesson-footer">
        ${teacherHtml}
        ${weeksHtml}
      </div>
    </div>
  `;
  }

  function populatePlanSelect(state, elements, helpers = {}) {
    if (!elements || !elements.planSelect) return;
    elements.planSelect.innerHTML = '<option value="">Wybierz kierunek studiów...</option>';
    if (!state || !state.plansData || !state.plansData.plans) return;

    const comparePlansFn = helpers.comparePlans || (typeof window !== "undefined" && window.Timeline && window.Timeline.comparePlans);
    const parsePlanInfoFn = helpers.parsePlanInfo || (typeof window !== "undefined" && window.Timeline && window.Timeline.parsePlanInfo);

    const currentMode = state.studyMode || "stacjonarne";
    const sortedEntries = Object.entries(state.plansData.plans)
      .filter(([, plan]) => {
        const planMode = plan.mode || (plan.name && /niestacjonarne/i.test(plan.name) ? "niestacjonarne" : "stacjonarne");
        return planMode === currentMode;
      })
      .sort(([, a], [, b]) => comparePlansFn ? comparePlansFn(a, b) : 0);

    const nameCounts = {};
    for (const [, plan] of sortedEntries) {
      const info = parsePlanInfoFn ? parsePlanInfoFn(plan.clean_name || plan.name) : { cleanName: plan.clean_name || plan.name };
      nameCounts[info.cleanName] = (nameCounts[info.cleanName] || 0) + 1;
    }

    for (const [id, plan] of sortedEntries) {
      const opt = document.createElement("option");
      opt.value = id;
      const planInfo = parsePlanInfoFn ? parsePlanInfoFn(plan.clean_name || plan.name) : { cleanName: plan.clean_name || plan.name, version: plan.version };
      const isDuplicate = (nameCounts[planInfo.cleanName] || 0) > 1;
      if (isDuplicate) {
        const ver = plan.version || planInfo.version;
        opt.textContent = ver ? `${planInfo.cleanName} (${ver})` : `${planInfo.cleanName} (inna wersja)`;
      } else {
        opt.textContent = planInfo.cleanName;
      }
      elements.planSelect.appendChild(opt);
    }
  }

  function updateCalendarNotice(academicInfo, state, elements, helpers = {}) {
    if (!elements || !elements.calendarNotice) return;

    const getAcademicInfoFn = helpers.getAcademicInfoForWeek;
    const getWeekMondayFn = helpers.getWeekMonday;
    const getDuplicatePlanInfoFn = helpers.getDuplicatePlanInfo;
    const getPlanModificationInfoFn = helpers.getPlanModificationInfo;

    if (!academicInfo && typeof getAcademicInfoFn === "function" && typeof getWeekMondayFn === "function") {
      academicInfo = getAcademicInfoFn(getWeekMondayFn(state.weekOffset));
    }

    if (academicInfo && (academicInfo.periodType === "break" || academicInfo.periodType === "exam")) {
      elements.calendarNotice.classList.add("hidden");
      elements.calendarNotice.innerHTML = "";
      return;
    }

    const notices = [];
    const isNst = state && state.studyMode === "niestacjonarne";

    const dupInfo = getDuplicatePlanInfoFn ? getDuplicatePlanInfoFn(state.selectedPlanId) : null;
    if (dupInfo) {
      const currentVerDesc = dupInfo.currentVersion
        ? ` (wybrana: ${dupInfo.currentVersion}${dupInfo.currentPublishedAt ? ` z ${dupInfo.currentPublishedAt}` : ""})`
        : "";
      const switchButtons = dupInfo.alternatives.map(alt => {
        const altLabel = alt.version
          ? `Przełącz na ${alt.version}${alt.publishedAt ? ` (z ${alt.publishedAt})` : ""}`
          : `Przełącz na inną wersję${alt.publishedAt ? ` (z ${alt.publishedAt})` : ""}`;
        return `<button type="button" class="btn-notice-switch" data-switch-plan="${escapeHtml(alt.id)}">${escapeHtml(altLabel)}</button>`;
      }).join("");

      notices.push(`
        <div class="calendar-notice-item notice-duplicate-plan">
          <div class="notice-main">
            ${icon("warning", "notice-icon")}
            <div class="notice-text">
              <strong>Uwaga:</strong> Dla tego kierunku uczelnia opublikowała dwie wersje planu${escapeHtml(currentVerDesc)}.
            </div>
            <button type="button" class="btn-notice-dismiss" data-dismiss-plan="${escapeHtml(dupInfo.cleanName)}" aria-label="Zamknij powiadomienie" title="Zamknij powiadomienie">✕</button>
          </div>
          <div class="notice-actions">
            ${switchButtons}
          </div>
        </div>
      `);
    }

    const modInfo = getPlanModificationInfoFn ? getPlanModificationInfoFn(state.selectedPlanId) : null;
    if (modInfo) {
      const curVer = modInfo.currentVersion ? ` (${modInfo.currentVersion})` : "";
      const draftVer = modInfo.draftVersion ? ` (${modInfo.draftVersion})` : "";
      notices.push(`
        <div class="calendar-notice-item notice-plan-modifying">
          <div class="notice-main">
            ${icon("warning", "notice-icon")}
            <div class="notice-text">
              <strong>Plan w trakcie modyfikacji przez uczelnię:</strong> Wyświetlamy ostatnią dostępną wersję${escapeHtml(curVer)}. Nowa wersja${escapeHtml(draftVer)} pojawi się automatycznie po zakończeniu prac przez dziekanat.
            </div>
            <button type="button" class="btn-notice-dismiss" data-dismiss-modification="${escapeHtml(modInfo.cleanName)}" aria-label="Zamknij powiadomienie" title="Zamknij powiadomienie">✕</button>
          </div>
        </div>
      `);
    }

    if (academicInfo) {
      if (!isNst && academicInfo.daySwaps && academicInfo.daySwaps.length > 0) {
        for (const swap of academicInfo.daySwaps) {
          const cleanNote = (swap.note || "").replace(/\s*\(zarządzenie rektora\)/gi, "").trim();
          notices.push(`
            <div class="calendar-notice-item">
              ${icon("warning", "notice-icon")}
              <span class="notice-text"><strong>Zamiana dnia:</strong> ${escapeHtml(cleanNote)}</span>
            </div>
          `);
        }
      }

      if (academicInfo.announcements && academicInfo.announcements.length > 0) {
        for (const ann of academicInfo.announcements) {
          notices.push(`
            <div class="calendar-notice-item">
              ${icon("info", "notice-icon")}
              <span class="notice-text"><strong>Komunikat:</strong> ${escapeHtml(ann)}</span>
            </div>
          `);
        }
      }
    }

    if (notices.length > 0) {
      elements.calendarNotice.innerHTML = notices.join("");
      elements.calendarNotice.className = "calendar-notice";
      elements.calendarNotice.classList.remove("hidden");
    } else {
      elements.calendarNotice.classList.add("hidden");
      elements.calendarNotice.innerHTML = "";
    }
  }

  function updateWeekDisplay(state, elements, helpers = {}) {
    if (!elements || !elements.currentWeekLabel) return;
    const getWeekMondayFn = helpers.getWeekMonday;
    const getAcademicInfoFn = helpers.getAcademicInfoForWeek;
    const updateNoticeFn = helpers.updateCalendarNotice;

    const targetMonday = getWeekMondayFn ? getWeekMondayFn(state.weekOffset) : new Date();
    const targetSunday = new Date(targetMonday);
    targetSunday.setDate(targetMonday.getDate() + 6);

    const formatShort = (date) => {
      return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}`;
    };

    const monYear = targetMonday.getFullYear();
    const sunYear = targetSunday.getFullYear();
    const yearHtml = monYear === sunYear
      ? `<span class="week-year">.${sunYear}</span>`
      : `<span class="week-year">.${sunYear}</span>`;
    const datesHtml = `${formatShort(targetMonday)} – ${formatShort(targetSunday)}${yearHtml}`;
    const academicInfo = getAcademicInfoFn ? getAcademicInfoFn(targetMonday) : {};

    let prefix = "";
    if (academicInfo.weekNum) {
      prefix = `Tydzień ${academicInfo.weekNum}`;
    } else if (academicInfo.periodName) {
      prefix = academicInfo.periodName;
    }

    let htmlContent = "";
    if (prefix && state.weekOffset === 0) {
      htmlContent = `<span class="week-prefix-long">Bieżący tydzień • </span>${escapeHtml(prefix)} (${datesHtml})`;
    } else if (prefix) {
      htmlContent = `${escapeHtml(prefix)} (${datesHtml})`;
    } else if (state.weekOffset === 0) {
      htmlContent = `Bieżący tydzień (${datesHtml})`;
    } else {
      htmlContent = `Tydzień (${datesHtml})`;
    }

    elements.currentWeekLabel.innerHTML = `<span style="font-size: 0.9em; opacity: 0.8; flex-shrink: 0;">📅</span> <span class="week-label-text">${htmlContent}</span>`;

    if (typeof updateNoticeFn === "function") {
      updateNoticeFn(academicInfo);
    }
  }

  function updateDayTabsUI(filteredSchedule, state, elements, helpers = {}) {
    if (!elements || !elements.dayTabs) return;
    const getWeekMondayFn = helpers.getWeekMonday;
    const formatDateISOFn = helpers.formatDateISO;
    const isLessonInWeekFn = helpers.isLessonInWeek;
    const parsePlanInfoFn = helpers.parsePlanInfo;
    const academicCalendar = helpers.academicCalendar || { daySwaps: {}, holidays: {} };
    const eventsService = helpers.eventsService;

    let schedule = filteredSchedule;
    const targetMonday = getWeekMondayFn ? getWeekMondayFn(state.weekOffset) : new Date();
    if (!schedule && state.scheduleData) {
      schedule = {};
      for (let dIdx = 0; dIdx < DNI_TYGODNIA.length; dIdx++) {
        const day = DNI_TYGODNIA[dIdx];
        const dayDate = new Date(targetMonday);
        dayDate.setDate(targetMonday.getDate() + dIdx);
        const dateKey = formatDateISOFn ? formatDateISOFn(dayDate) : "";

        let sourceDay = day;
        const isNst = state.studyMode === "niestacjonarne";
        if (!isNst && academicCalendar.daySwaps && academicCalendar.daySwaps[dateKey]) {
          sourceDay = academicCalendar.daySwaps[dateKey].replaceWith;
        }
        const holiday = (academicCalendar.holidays && academicCalendar.holidays[dateKey]) || null;

        let hasLessons = false;
        if (!holiday) {
          if (Array.isArray(state.scheduleData.lessons)) {
            hasLessons = state.scheduleData.lessons.some(l => l.occurrences && l.occurrences.some(o => o.date === dateKey));
          } else if (Array.isArray(state.scheduleData[dateKey])) {
            hasLessons = state.scheduleData[dateKey].length > 0;
          } else {
            const daySlots = state.scheduleData[sourceDay] || {};
            for (const lessonInfo of Object.values(daySlots)) {
              if (isLessonInWeekFn && isLessonInWeekFn(lessonInfo, sourceDay, targetMonday)) {
                hasLessons = true;
                break;
              }
            }
          }
        }
        schedule[day] = { hasLessons, dateKey };
      }
    }

    const planObj = state.plansData && state.plansData.plans && state.selectedPlanId ? state.plansData.plans[state.selectedPlanId] : null;
    const planInfo = planObj && parsePlanInfoFn ? parsePlanInfoFn(planObj.clean_name || planObj.name) : null;
    const eventContext = {
      studyMode: state.studyMode || "stacjonarne",
      degree: planInfo && planInfo.isSecondDegree ? 2 : 1
    };

    elements.dayTabs.querySelectorAll(".day-tab").forEach((tab) => {
      const day = tab.dataset.day;
      if (day === "ALL") {
        tab.classList.toggle("active", state.selectedDayTab === "ALL");
        return;
      }

      const dIdx = DNI_TYGODNIA.indexOf(day);
      let dateKey = (schedule && schedule[day] && schedule[day].dateKey) || null;
      if (!dateKey && dIdx !== -1) {
        const dayDate = new Date(targetMonday);
        dayDate.setDate(targetMonday.getDate() + dIdx);
        dateKey = formatDateISOFn ? formatDateISOFn(dayDate) : "";
      }

      const matchingEvents = (dateKey && eventsService && typeof eventsService.getEventsForDate === "function")
        ? eventsService.getEventsForDate(dateKey, eventContext)
        : [];

      let shouldShow = true;
      if (state.daysView === "workdays") {
        shouldShow = day !== "SOB" && day !== "ND";
      } else if (state.daysView === "active_only") {
        const hasClasses = schedule && schedule[day]
          ? (schedule[day].lessons ? schedule[day].lessons.length > 0 : Boolean(schedule[day].hasLessons))
          : false;
        shouldShow = hasClasses || matchingEvents.length > 0;
      } else if (state.daysView === "all") {
        shouldShow = true;
      }

      tab.classList.toggle("hidden", !shouldShow);
      tab.classList.toggle("active", day === state.selectedDayTab);

      let indicator = tab.querySelector(".day-tab-indicator");
      if (matchingEvents.length > 0) {
        const topEvent = matchingEvents[0];
        const themeDetails = (eventsService && typeof eventsService.getThemeDetails === "function")
          ? eventsService.getThemeDetails(topEvent)
          : { color: "#d97706" };
        const dotColor = themeDetails.color || "#d97706";
        const eventTitles = matchingEvents.map(e => e.title).filter(Boolean).join(", ");
        const accessibleLabel = eventTitles
          ? `Wydarzenie: ${eventTitles}`
          : "Wydarzenie zaplanowane na ten dzień";

        if (!indicator) {
          indicator = document.createElement("span");
          indicator.className = "day-tab-indicator";
          tab.appendChild(indicator);
        }
        indicator.style.backgroundColor = dotColor;
        indicator.setAttribute("role", "status");
        indicator.setAttribute("aria-label", accessibleLabel);
        indicator.title = accessibleLabel;
      } else if (indicator) {
        indicator.remove();
      }
    });

    if (state.selectedDayTab !== "ALL") {
      const activeTab = elements.dayTabs.querySelector(`.day-tab[data-day="${state.selectedDayTab}"]`);
      if (activeTab && activeTab.classList.contains("hidden")) {
        state.selectedDayTab = "ALL";
        const allTab = elements.dayTabs.querySelector('.day-tab[data-day="ALL"]');
        if (allTab) allTab.classList.add("active");
      }
    }
  }

  function renderSchedule(state, elements, helpers = {}) {
    if (!state || !state.scheduleData) return;

    const getWeekMondayFn = helpers.getWeekMonday;
    const getTodayCodeFn = helpers.getTodayCode;
    const formatDateISOFn = helpers.formatDateISO;
    const getAcademicInfoFn = helpers.getAcademicInfoForWeek;
    const resolveInitialWeekOffsetFn = helpers.resolveInitialWeekOffset;
    const updateWeekDisplayFn = helpers.updateWeekDisplay;
    const updateDayTabsUIFn = helpers.updateDayTabsUI;
    const updateHiddenBannerFn = helpers.updateHiddenLessonsBannerUI;
    const getLessonSlotKeyFn = helpers.getLessonSlotKey;
    const isHideableLessonFn = helpers.isHideableLesson;
    const renderLessonCardFn = helpers.renderLessonCard || renderLessonCard;
    const parsePlanInfoFn = helpers.parsePlanInfo;
    const engine = helpers.engine;
    const eventsService = helpers.eventsService;

    const targetMonday = getWeekMondayFn ? getWeekMondayFn(state.weekOffset) : new Date();
    const todayCode = getTodayCodeFn ? getTodayCodeFn() : "PON";

    const filteredSchedule = {};
    let totalLessonsInWeek = 0;

    const isNst = state.studyMode === "niestacjonarne";
    const scheduleOptions = { isNst, studyMode: state.studyMode };
    const weekResolution = engine ? engine.resolveWeekSchedule(targetMonday, state.scheduleData, scheduleOptions) : {};
    for (const day of DNI_TYGODNIA) {
      const dayStatus = weekResolution[day] || { lessons: [] };
      const rawLessons = dayStatus.lessons || [];
      const processedLessons = [];

      for (const l of rawLessons) {
        const baseDay = l.sourceDay || day;
        const slotKey = getLessonSlotKeyFn ? getLessonSlotKeyFn(l, baseDay) : "";
        const isSlotHidden = Boolean(isHideableLessonFn && isHideableLessonFn(l) && state.hiddenLessonSlots && state.hiddenLessonSlots.has(slotKey));

        if (isSlotHidden) {
          if (state.previewHiddenLessons) {
            l._isHidden = true;
            processedLessons.push(l);
          }
        } else {
          l._isHidden = false;
          processedLessons.push(l);
        }
      }

      filteredSchedule[day] = {
        lessons: processedLessons,
        swap: dayStatus.status === "daySwap" ? { replaceWith: dayStatus.swapReplaceWith, note: dayStatus.swapNote } : null,
        holiday: dayStatus.status === "holiday" ? dayStatus.message : null,
        date: dayStatus.dateObj,
        dateKey: dayStatus.dateISO,
        status: dayStatus.status,
        message: dayStatus.message,
        baseDayPreview: dayStatus.baseDayPreview
      };
      totalLessonsInWeek += processedLessons.length;
    }

    if (typeof updateDayTabsUIFn === "function") updateDayTabsUIFn(filteredSchedule);
    if (typeof updateHiddenBannerFn === "function") updateHiddenBannerFn();

    const iconEl = typeof document !== "undefined" ? document.getElementById("no-classes-icon") : null;
    const titleEl = typeof document !== "undefined" ? document.getElementById("no-classes-title") : null;
    const descEl = typeof document !== "undefined" ? document.getElementById("no-classes-desc") : null;

    const planObj = state.plansData && state.plansData.plans && state.selectedPlanId ? state.plansData.plans[state.selectedPlanId] : null;
    const planInfo = planObj && parsePlanInfoFn ? parsePlanInfoFn(planObj.clean_name || planObj.name) : null;
    const eventContext = {
      studyMode: state.studyMode || "stacjonarne",
      degree: planInfo && planInfo.isSecondDegree ? 2 : 1
    };

    let weekHasEvents = false;
    if (eventsService && typeof eventsService.hasEventOnDate === "function") {
      for (const day of DNI_TYGODNIA) {
        const dKey = filteredSchedule[day] && filteredSchedule[day].dateKey;
        if (dKey && eventsService.hasEventOnDate(dKey, eventContext)) {
          weekHasEvents = true;
          break;
        }
      }
    }

    if (totalLessonsInWeek === 0 && !weekHasEvents) {
      if (elements.scheduleContent) elements.scheduleContent.classList.add("hidden");
      if (elements.noClassesState) elements.noClassesState.classList.remove("hidden");

      let minStartDate = null;
      if (Array.isArray(state.scheduleData.lessons)) {
        for (const l of state.scheduleData.lessons) {
          const sDate = l.start_date || (l.occurrences && l.occurrences[0] && l.occurrences[0].date);
          if (sDate) {
            if (!minStartDate || sDate < minStartDate) minStartDate = sDate;
          }
        }
      } else {
        for (const d of Object.values(state.scheduleData)) {
          for (const l of Object.values(d)) {
            if (l && l.data_start) {
              if (!minStartDate || l.data_start < minStartDate) minStartDate = l.data_start;
            }
          }
        }
      }

      const academicInfo = getAcademicInfoFn ? getAcademicInfoFn(targetMonday) : {};

      if (minStartDate && formatDateISOFn && formatDateISOFn(targetMonday) < minStartDate) {
        if (iconEl) iconEl.innerHTML = icon("event_upcoming", "", "width: 3rem; height: 3rem; color: var(--brand-primary);");
        if (titleEl) titleEl.textContent = "Przed rozpoczęciem zajęć";
        if (descEl) {
          descEl.innerHTML = `W tym tygodniu nie masz zaplanowanych zajęć (przed rozpoczęciem semestru).<br><button id="jump-to-first-btn" class="btn-primary" style="margin-top: 1rem; font-size: 0.85rem; padding: 0.5rem 1rem; width: 100%; justify-content: center;">Przejdź do pierwszego tygodnia zajęć</button>`;
          const jumpBtn = typeof document !== "undefined" ? document.getElementById("jump-to-first-btn") : null;
          if (jumpBtn) {
            jumpBtn.onclick = () => {
              if (resolveInitialWeekOffsetFn) resolveInitialWeekOffsetFn(state.scheduleData);
              if (updateWeekDisplayFn) updateWeekDisplayFn();
              renderSchedule(state, elements, helpers);
            };
          }
        }
      } else if (academicInfo.periodType === "break") {
        if (iconEl) iconEl.innerHTML = icon("beach_access", "", "width: 3rem; height: 3rem; color: #3b82f6;");
        if (titleEl) titleEl.textContent = academicInfo.periodName;
        if (descEl) descEl.textContent = "W tym tygodniu trwa przerwa wolna od zajęć dydaktycznych.";
      } else if (academicInfo.periodType === "exam") {
        if (iconEl) iconEl.innerHTML = icon("school", "", "width: 3rem; height: 3rem; color: #8b5cf6;");
        if (titleEl) titleEl.textContent = academicInfo.periodName;
        if (descEl) descEl.textContent = "Trwa sesja egzaminacyjna – brak regularnych zajęć w siatce.";
      } else {
        if (iconEl) iconEl.textContent = "🎉";
        if (titleEl) titleEl.textContent = "Brak zajęć";
        if (descEl) descEl.textContent = "W tym tygodniu nie masz żadnych zaplanowanych zajęć.";
      }
      return;
    }

    if (elements.noClassesState) elements.noClassesState.classList.add("hidden");
    if (elements.scheduleContent) elements.scheduleContent.classList.remove("hidden");

    let multiDays = DNI_TYGODNIA;
    if (state.daysView === "workdays") {
      multiDays = DNI_TYGODNIA.slice(0, 5);
    } else if (state.daysView === "active_only") {
      const activeDays = DNI_TYGODNIA.filter(day => filteredSchedule[day] && filteredSchedule[day].lessons.length > 0);
      multiDays = activeDays.length > 0 ? activeDays : DNI_TYGODNIA.slice(0, 5);
    } else {
      multiDays = DNI_TYGODNIA;
    }

    let daysToDisplay = multiDays;
    if (state.selectedDayTab !== "ALL") {
      daysToDisplay = [state.selectedDayTab];
    }

    let html = "";

    if (daysToDisplay.length === 1) {
      const day = daysToDisplay[0];
      const dayData = filteredSchedule[day] || { lessons: [] };
      const lessons = dayData.lessons;

      const prep = DNI_PRZYIMEK[day] || "w";
      const dayAcc = DNI_MIEJSCOWNIK[day] || day;
      const dayDateFormatted = dayData.date ? `${String(dayData.date.getDate()).padStart(2, "0")}.${String(dayData.date.getMonth() + 1).padStart(2, "0")}` : "";

      const eventsForDay = (eventsService && typeof eventsService.getEventsForDate === "function")
        ? eventsService.getEventsForDate(dayData.dateKey, eventContext)
        : [];
      const eventsHtml = (eventsService && typeof eventsService.renderEventsSection === "function")
        ? eventsService.renderEventsSection(eventsForDay)
        : "";

      if (lessons.length === 0 && eventsForDay.length === 0) {
        if (elements.scheduleContent) elements.scheduleContent.classList.add("hidden");
        if (elements.noClassesState) elements.noClassesState.classList.remove("hidden");

        if (dayData.swap) {
          const targetDayGen = DNI_DOPELNIACZ[dayData.swap.replaceWith] || dayData.swap.replaceWith;
          if (iconEl) iconEl.innerHTML = icon("swap_horiz", "", "width: 3rem; height: 3rem; color: #d97706;");
          if (titleEl) titleEl.textContent = `Zamiana dnia (plan z ${targetDayGen})`;
          if (descEl) {
            descEl.innerHTML = `${prep.charAt(0).toUpperCase() + prep.slice(1)} ${dayAcc} (${dayDateFormatted}) zajęcia odbywają się według planu z <strong>${targetDayGen}</strong>.<br>Twoja grupa nie ma zaplanowanych zajęć w tym planie.`;
          }
        } else if (dayData.holiday) {
          if (iconEl) iconEl.innerHTML = icon("celebration", "", "width: 3rem; height: 3rem; color: #0284c7;");
          if (titleEl) titleEl.textContent = dayData.holiday;
          if (descEl) {
            descEl.textContent = `${prep.charAt(0).toUpperCase() + prep.slice(1)} ${dayAcc} (${dayDateFormatted}) jest dniem wolnym od zajęć dydaktycznych.`;
          }
        } else {
          if (iconEl) iconEl.textContent = "🎉";
          if (titleEl) titleEl.textContent = "Brak zajęć";
          if (descEl) descEl.textContent = `Brak zajęć ${prep} ${dayAcc}. Czas na odpoczynek!`;
        }
        return;
      }

      const headerTitle = dayDateFormatted ? `${DNI_PELNE[day]} <span style="font-size: 0.85em; font-weight: normal; opacity: 0.8;">(${dayDateFormatted})</span>` : DNI_PELNE[day];

      let swapBadge = "";
      if (dayData.swap) {
        const targetDayGen = DNI_DOPELNIACZ[dayData.swap.replaceWith] || dayData.swap.replaceWith;
        const cleanNote = (dayData.swap.note || "").replace(/\s*\(zarządzenie rektora\)/gi, "").trim();
        swapBadge = `<div class="day-swap-badge" title="${escapeHtml(cleanNote)}">${icon("swap_horiz", "", "width: 1.1em; height: 1.1em; vertical-align: middle;")} Plan z ${targetDayGen}</div>`;
      }

      let emptyLessonsNotice = "";
      if (lessons.length === 0) {
        if (dayData.swap) {
          const targetDayGen = DNI_DOPELNIACZ[dayData.swap.replaceWith] || dayData.swap.replaceWith;
          emptyLessonsNotice = `<p class="placeholder-text" style="text-align:center; padding: 1.25rem 1rem; color: var(--text-secondary); font-size: 0.9rem;">Dzień realizowany według planu z ${targetDayGen}. Brak zaplanowanych zajęć.</p>`;
        } else if (dayData.holiday) {
          emptyLessonsNotice = `<p class="placeholder-text" style="text-align:center; padding: 1.25rem 1rem; color: var(--text-secondary); font-size: 0.9rem;">${escapeHtml(dayData.holiday)} – brak zajęć dydaktycznych.</p>`;
        } else {
          emptyLessonsNotice = `<p class="placeholder-text" style="text-align:center; padding: 1.25rem 1rem; color: var(--text-secondary); font-size: 0.9rem;">Brak zaplanowanych zajęć dydaktycznych w tym dniu.</p>`;
        }
      }

      html += `<div class="day-group">
        <div class="day-header">
          <span class="day-header-title">${headerTitle}</span>
          ${swapBadge}
        </div>
        <div class="lessons-list">
          ${lessons.length > 0 ? lessons.map((l) => renderLessonCardFn(l, targetMonday, day)).join("") : emptyLessonsNotice}
        </div>
        ${eventsHtml}
      </div>`;
    } else {
      html += `<div class="schedule-week-grid" style="--grid-cols: repeat(${multiDays.length}, 1fr);">`;
      for (const day of multiDays) {
        const dayData = filteredSchedule[day] || { lessons: [] };
        const lessons = dayData.lessons;
        const isToday = day === todayCode && state.weekOffset === 0;
        const dayDateFormatted = dayData.date ? `${String(dayData.date.getDate()).padStart(2, "0")}.${String(dayData.date.getMonth() + 1).padStart(2, "0")}` : "";

        const colEvents = (eventsService && typeof eventsService.getEventsForDate === "function")
          ? eventsService.getEventsForDate(dayData.dateKey, eventContext)
          : [];
        const colEventsHtml = (eventsService && typeof eventsService.renderEventsSection === "function")
          ? eventsService.renderEventsSection(colEvents)
          : "";

        let swapBadge = "";
        if (dayData.swap) {
          const targetDayGen = DNI_DOPELNIACZ[dayData.swap.replaceWith] || dayData.swap.replaceWith;
          const cleanNote = (dayData.swap.note || "").replace(/\s*\(zarządzenie rektora\)/gi, "").trim();
          swapBadge = `<div class="grid-day-swap-badge" title="${escapeHtml(cleanNote)}">${icon("swap_horiz", "", "width: 1.1em; height: 1.1em; vertical-align: middle;")} Plan z ${targetDayGen}</div>`;
        }

        let emptyDayContent = `<p class="placeholder-text" style="text-align:center; padding: 1rem;">Brak zajęć</p>`;
        if (dayData.swap) {
          const targetDayAdj = DNI_PRZYMIOTNIK[dayData.swap.replaceWith] || "zamiennym";
          emptyDayContent = `
            <div class="grid-day-empty-state">
              ${icon("swap_horiz", "grid-empty-icon")}
              <span class="grid-empty-text">Brak zajęć w planie ${targetDayAdj}</span>
            </div>
          `;
        } else if (dayData.holiday) {
          emptyDayContent = `
            <div class="lesson-card holiday-card">
              <div class="holiday-card-content">
                ${icon("celebration", "holiday-card-icon")}
                <span class="holiday-card-text">${escapeHtml(dayData.holiday)}</span>
              </div>
            </div>
          `;
        }

        html += `<div class="grid-day-col">
          <div class="grid-day-header ${isToday ? 'today' : ''}">
            <span class="grid-day-header-title">${DNI_PELNE[day]} <span style="font-size: 0.8em; font-weight: normal; opacity: 0.75;">${dayDateFormatted}</span> ${isToday ? '• Dziś' : ''}</span>
            ${swapBadge}
          </div>
          <div class="grid-lessons-list">
            ${lessons.length > 0
            ? lessons.map((l) => renderLessonCardFn(l, targetMonday, day)).join("")
            : emptyDayContent
          }
          </div>
          ${colEventsHtml}
        </div>`;
      }
      html += `</div>`;
    }

    if (elements.scheduleContent) elements.scheduleContent.innerHTML = html;
  }

  function isAppStandalone() {
    const isMatchMedia = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches;
    const isStandaloneProp = typeof window !== "undefined" && window.navigator && window.navigator.standalone === true;
    return Boolean(isMatchMedia || isStandaloneProp);
  }

  function isIosDevice() {
    const ua = ((typeof window !== "undefined" && window.navigator && window.navigator.userAgent) ||
      (typeof navigator !== "undefined" && navigator.userAgent) || "").toLowerCase();
    return /iphone|ipad|ipod/.test(ua);
  }

  function openPwaModal(platform = "android", elements = {}, closeIosModal = () => {}, tenantConfig = null) {
    const modal = elements && elements.iosInstallModal;
    const title = typeof document !== "undefined" ? document.getElementById("pwa-install-title") : null;
    const body = typeof document !== "undefined" ? document.getElementById("pwa-install-body") : null;
    if (!modal) return;

    const appName = (tenantConfig && tenantConfig.short_title) || "Plan zajęć";
    const appLogo = (tenantConfig && tenantConfig.logo) || "📅";

    if (platform === "ios" || isIosDevice()) {
      if (title) title.textContent = "Dodaj do ekranu początkowego (iOS)";
      if (body) {
        body.innerHTML = `
          <p>Zainstaluj ${escapeHtml(appName)} na swoim urządzeniu Apple (Safari), aby mieć błyskawiczny dostęp jak do natywnej aplikacji:</p>
          <ol class="ios-install-steps">
            <li>
              <span class="step-num">1</span>
              <div class="step-desc">
                Kliknij ikonę <strong>Udostępnij</strong> (${icon("ios_share", "ios-step-icon")}) na pasku Safari.
              </div>
            </li>
            <li>
              <span class="step-num">2</span>
              <div class="step-desc">
                Przewiń w dół i wybierz <strong>„Do ekranu początkowego”</strong> (${icon("add_box", "ios-step-icon")}).
              </div>
            </li>
            <li>
              <span class="step-num">3</span>
              <div class="step-desc">
                Potwierdź klikając <strong>„Dodaj”</strong> w prawym górnym rogu.
              </div>
            </li>
          </ol>
          <button id="close-ios-modal-btn" class="btn-primary" style="width: 100%; justify-content: center; margin-top: 1.25rem;">Rozumiem</button>
        `;
        const btn = body.querySelector("#close-ios-modal-btn");
        if (btn) btn.onclick = closeIosModal;
      }
    } else {
      if (title) title.textContent = "Zainstaluj aplikację (Android / Chrome)";
      if (body) {
        body.innerHTML = `
          <p>Zainstaluj ${escapeHtml(appName)} jako aplikację na telefonie, aby korzystać z planu również offline i bez pasków przeglądarki:</p>
          <ol class="ios-install-steps">
            <li>
              <span class="step-num">1</span>
              <div class="step-desc">
                Kliknij menu z trzema kropkami (<strong>⋮</strong>) w prawym górnym rogu przeglądarki Chrome.
              </div>
            </li>
            <li>
              <span class="step-num">2</span>
              <div class="step-desc">
                Wybierz <strong>„Zainstaluj aplikację”</strong> lub <strong>„Dodaj do ekranu głównego”</strong> (${icon("install_mobile", "ios-step-icon")}).
              </div>
            </li>
            <li>
              <span class="step-num">3</span>
              <div class="step-desc">
                Potwierdź klikając <strong>„Zainstaluj”</strong>. Aplikacja z ikoną ${escapeHtml(appLogo)} pojawi się na Twoim pulpicie.
              </div>
            </li>
          </ol>
          <button id="close-ios-modal-btn" class="btn-primary" style="width: 100%; justify-content: center; margin-top: 1.25rem;">Rozumiem</button>
        `;
        const btn = body.querySelector("#close-ios-modal-btn");
        if (btn) btn.onclick = closeIosModal;
      }
    }

    if (typeof modal.showModal === "function") {
      modal.showModal();
    } else {
      modal.classList.remove("hidden");
    }
  }

  function closeIosModal(elements = {}) {
    if (elements && elements.iosInstallModal) {
      if (typeof elements.iosInstallModal.close === "function") {
        elements.iosInstallModal.close();
      } else {
        elements.iosInstallModal.classList.add("hidden");
      }
    }
  }

  return {
    escapeHtml,
    icon,
    renderLessonCard,
    populatePlanSelect,
    updateCalendarNotice,
    updateWeekDisplay,
    updateDayTabsUI,
    renderSchedule,
    isAppStandalone,
    isIosDevice,
    openPwaModal,
    closeIosModal
  };
});
