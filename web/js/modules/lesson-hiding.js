/**
 * Lesson Hiding Module (modules/lesson-hiding.js)
 * Zarządza ukrywaniem podgrup i fakultetów w harmonogramie oraz modalem masowego wyboru fakultetów (#electives-dialog).
 * Zgodny z UMD: działa w przeglądarce i środowisku Node.js.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.LessonHiding = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function isHideableLesson(lesson) {
    if (!lesson) return false;
    return lesson.hideable === true;
  }

  function getSafeGroupName(group) {
    return group ? String(group).replace(/[^\w-]/g, "_") : "";
  }

  function getLessonSlotKey(lesson, day = null) {
    if (!lesson) return "";
    if (lesson.id && typeof lesson.id === "string") {
      return lesson.id;
    }
    const baseDay = day || lesson.sourceDay || lesson.day || "PON";
    const p = (lesson.przedmiot || "").trim();
    const g = (lesson.godziny || "").trim();
    const s = (lesson.sala || "").trim();
    const w = (lesson.prowadzacy || "").trim();
    const d = (lesson.data_start || "").trim();
    return `${baseDay}__${p}__${g}__${s}__${w}__${d}`;
  }

  function _resolveTenantId(tenantId = null, appState = null) {
    if (tenantId) return tenantId;
    const s = appState || (typeof window !== "undefined" && window.AppState ? window.AppState.get() : null);
    if (s && s.tenantConfig && s.tenantConfig.id) return s.tenantConfig.id;
    if (s && s.tenantId) return s.tenantId;
    return "umg_wn";
  }

  function getHiddenSlotsStorageKey(planId, group, tenantId = null) {
    const tid = _resolveTenantId(tenantId);
    const safeGroup = getSafeGroupName(group);
    return `${tid}_hidden_slots_${planId}_${safeGroup}`;
  }

  function getLegacyHiddenSlotsStorageKey(planId, group) {
    const safeGroup = getSafeGroupName(group);
    return `planwn_hidden_slots_${planId}_${safeGroup}`;
  }

  function loadHiddenLessonSlots(planId, group, tenantId = null) {
    if (!planId || !group || typeof localStorage === "undefined") return new Set();
    const tid = _resolveTenantId(tenantId);
    const scopedKey = getHiddenSlotsStorageKey(planId, group, tid);
    const legacyKey = getLegacyHiddenSlotsStorageKey(planId, group);
    try {
      let raw = localStorage.getItem(scopedKey);
      if (!raw && tid === "umg_wn") {
        raw = localStorage.getItem(legacyKey);
        if (raw) {
          localStorage.setItem(scopedKey, raw);
        }
      }
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? new Set(arr) : new Set();
    } catch (e) {
      console.error("Błąd odczytu ukrytych slotów:", e);
      return new Set();
    }
  }

  function saveHiddenLessonSlots(planId, group, slotsSet, tenantId = null) {
    if (!planId || !group || typeof localStorage === "undefined") return;
    const tid = _resolveTenantId(tenantId);
    const scopedKey = getHiddenSlotsStorageKey(planId, group, tid);
    const legacyKey = getLegacyHiddenSlotsStorageKey(planId, group);
    try {
      if (!slotsSet || slotsSet.size === 0) {
        localStorage.removeItem(scopedKey);
        if (tid === "umg_wn") {
          localStorage.removeItem(legacyKey);
        }
      } else {
        const serialized = JSON.stringify(Array.from(slotsSet));
        localStorage.setItem(scopedKey, serialized);
        if (tid === "umg_wn") {
          localStorage.setItem(legacyKey, serialized);
        }
      }
    } catch (e) {
      console.error("Błąd zapisu ukrytych slotów:", e);
    }
  }

  function toggleLessonSlotHidden(lesson, day = null, forceState = null, appState = null) {
    if (!lesson || !isHideableLesson(lesson)) return false;
    const targetState = appState || (typeof window !== "undefined" && window.AppState ? window.AppState.get() : {});
    const tid = _resolveTenantId(null, targetState);
    const slotKey = getLessonSlotKey(lesson, day);
    if (!targetState.hiddenLessonSlots) {
      targetState.hiddenLessonSlots = new Set();
    }
    const shouldHide = forceState !== null ? forceState : !targetState.hiddenLessonSlots.has(slotKey);
    if (shouldHide) {
      targetState.hiddenLessonSlots.add(slotKey);
    } else {
      targetState.hiddenLessonSlots.delete(slotKey);
    }
    saveHiddenLessonSlots(targetState.selectedPlanId, targetState.selectedGroup, targetState.hiddenLessonSlots, tid);
    return shouldHide;
  }

  function restoreAllHiddenLessonSlots(planId, group, appState = null, onRefresh = null) {
    const targetState = appState || (typeof window !== "undefined" && window.AppState ? window.AppState.get() : {});
    const tid = _resolveTenantId(null, targetState);
    if (targetState.hiddenLessonSlots) {
      targetState.hiddenLessonSlots.clear();
    } else {
      targetState.hiddenLessonSlots = new Set();
    }
    targetState.previewHiddenLessons = false;
    saveHiddenLessonSlots(planId, group, targetState.hiddenLessonSlots, tid);
    if (typeof onRefresh === "function") {
      onRefresh();
    }
  }

  function getElectiveLessons(scheduleData) {
    if (!scheduleData) return [];
    if (Array.isArray(scheduleData.lessons)) {
      return scheduleData.lessons.filter((l) => l && (l.form === "elective" || l.hideable === true));
    }
    const result = [];
    for (const [day, daySlots] of Object.entries(scheduleData)) {
      if (!daySlots || typeof daySlots !== "object") continue;
      for (const lesson of Object.values(daySlots)) {
        if (lesson && isHideableLesson(lesson)) {
          result.push({ ...lesson, sourceDay: day });
        }
      }
    }
    return result;
  }

  function applyBulkElectivesSelection(scheduleData, visibleSlotKeysSet, appState = null) {
    const targetState = appState || (typeof window !== "undefined" && window.AppState ? window.AppState.get() : {});
    const tid = _resolveTenantId(null, targetState);
    const electives = getElectiveLessons(scheduleData);
    const visibleSet = visibleSlotKeysSet instanceof Set ? visibleSlotKeysSet : new Set(visibleSlotKeysSet || []);
    if (!targetState.hiddenLessonSlots) {
      targetState.hiddenLessonSlots = new Set();
    }
    for (const lesson of electives) {
      const key = getLessonSlotKey(lesson, lesson.day_of_week || lesson.sourceDay || "PON");
      if (visibleSet.has(key)) {
        targetState.hiddenLessonSlots.delete(key);
      } else {
        targetState.hiddenLessonSlots.add(key);
      }
    }
    saveHiddenLessonSlots(targetState.selectedPlanId, targetState.selectedGroup, targetState.hiddenLessonSlots, tid);
    return targetState.hiddenLessonSlots;
  }

  function formatHiddenCount(count) {
    if (count === 1) return "1 ukryty termin zajęć";
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
      return `${count} ukryte terminy zajęć`;
    }
    return `${count} ukrytych terminów zajęć`;
  }

  function renderElectivesModalList(elements, appState) {
    const listEl = elements && elements.electivesList;
    if (!listEl) return;
    const electives = getElectiveLessons(appState && appState.scheduleData);
    if (electives.length === 0) {
      listEl.innerHTML = `<p class="subtext" style="text-align: center; padding: 1.25rem 0;">W aktualnie wybranym planie grupy brak przedmiotów oznaczonych jako fakultety lub podgrupy do ukrycia.</p>`;
      return;
    }

    const hiddenSet = (appState && appState.hiddenLessonSlots) || new Set();
    const dayLabels = { MON: "Pon", TUE: "Wt", WED: "Śr", THU: "Czw", FRI: "Pt", SAT: "Sob", SUN: "Nd" };
    listEl.innerHTML = electives
      .map((l) => {
        const key = getLessonSlotKey(l, l.day_of_week || l.sourceDay || "PON");
        const isChecked = !hiddenSet.has(key);
        const subj = escapeHtml(l.subject || l.przedmiot || "Zajęcia");
        const dayStr = escapeHtml(dayLabels[l.day_of_week] || l.day_of_week || l.sourceDay || "");
        const timeStr = escapeHtml(l.godziny || `${l.start_time || ""} - ${l.end_time || ""}`);
        const roomStr = l.room || l.sala ? ` • ${escapeHtml(l.room || l.sala)}` : "";
        return `
          <div class="elective-item">
            <label>
              <input type="checkbox" class="elective-checkbox" data-slot-key="${escapeHtml(key)}" ${isChecked ? "checked" : ""}>
              <div>
                <strong>${subj}</strong>
                <div class="subtext" style="font-size: 0.78rem;">${dayStr} ${timeStr}${roomStr}</div>
              </div>
            </label>
          </div>
        `;
      })
      .join("");
  }

  function openElectivesModal(elements, appState) {
    const dialog = elements && elements.electivesDialog;
    if (!dialog) return;
    renderElectivesModalList(elements, appState);
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.classList.remove("hidden");
    }
  }

  function closeElectivesModal(elements) {
    const dialog = elements && elements.electivesDialog;
    if (!dialog) return;
    if (typeof dialog.close === "function") {
      dialog.close();
    } else {
      dialog.classList.add("hidden");
    }
  }

  return {
    isHideableLesson,
    getLessonSlotKey,
    getSafeGroupName,
    getHiddenSlotsStorageKey,
    getLegacyHiddenSlotsStorageKey,
    loadHiddenLessonSlots,
    saveHiddenLessonSlots,
    toggleLessonSlotHidden,
    restoreAllHiddenLessonSlots,
    getElectiveLessons,
    applyBulkElectivesSelection,
    formatHiddenCount,
    renderElectivesModalList,
    openElectivesModal,
    closeElectivesModal
  };
});
