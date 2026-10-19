/**
 * Lesson Hiding Module (modules/lesson-hiding.js)
 * Zarządza ukrywaniem podgrup i fakultetów w harmonogramie.
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

  function isHideableLesson(lesson) {
    if (!lesson) return false;
    // Kontrakt v1: flaga hideable ustawiona przez adapter
    if (lesson.hideable === true) return true;

    // Reguła legacy UMG: symulatory manewrowe (MS / sym-man) poza aulą
    const p = (lesson.przedmiot || "").toLowerCase();
    const rawP = (lesson.raw_przedmiot || "").toLowerCase();
    const room = (lesson.sala || "").toLowerCase();

    const isManeuvering = (
      p.includes("manewrowani") ||
      rawP.includes("manewrowani") ||
      rawP === "ms" ||
      p.includes("sym-man") ||
      rawP.includes("sym-man")
    );
    if (!isManeuvering) return false;

    if (room.includes("aula") || room.includes("audytorium")) {
      return false;
    }
    return true;
  }

  function getSafeGroupName(group) {
    return group ? String(group).replace(/[^\w-]/g, "_") : "";
  }

  function getLessonSlotKey(lesson, day = null) {
    if (!lesson) return "";
    // Kontrakt v1: jeśli lekcja ma stałe ID wyliczone deterministycznie
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
    formatHiddenCount
  };
});
