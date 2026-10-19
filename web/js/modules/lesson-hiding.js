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

  function getHiddenSlotsStorageKey(planId, group) {
    const safeGroup = getSafeGroupName(group);
    return `planwn_hidden_slots_${planId}_${safeGroup}`;
  }

  function loadHiddenLessonSlots(planId, group) {
    if (!planId || !group || typeof localStorage === "undefined") return new Set();
    try {
      const raw = localStorage.getItem(getHiddenSlotsStorageKey(planId, group));
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? new Set(arr) : new Set();
    } catch (e) {
      console.error("Błąd odczytu ukrytych slotów:", e);
      return new Set();
    }
  }

  function saveHiddenLessonSlots(planId, group, slotsSet) {
    if (!planId || !group || typeof localStorage === "undefined") return;
    try {
      const key = getHiddenSlotsStorageKey(planId, group);
      if (!slotsSet || slotsSet.size === 0) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, JSON.stringify(Array.from(slotsSet)));
      }
    } catch (e) {
      console.error("Błąd zapisu ukrytych slotów:", e);
    }
  }

  function toggleLessonSlotHidden(lesson, day = null, forceState = null, appState = null) {
    if (!lesson || !isHideableLesson(lesson)) return false;
    const targetState = appState || (typeof window !== "undefined" && window.AppState ? window.AppState.get() : {});
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
    saveHiddenLessonSlots(targetState.selectedPlanId, targetState.selectedGroup, targetState.hiddenLessonSlots);
    return shouldHide;
  }

  function restoreAllHiddenLessonSlots(planId, group, appState = null, onRefresh = null) {
    const targetState = appState || (typeof window !== "undefined" && window.AppState ? window.AppState.get() : {});
    if (targetState.hiddenLessonSlots) {
      targetState.hiddenLessonSlots.clear();
    } else {
      targetState.hiddenLessonSlots = new Set();
    }
    targetState.previewHiddenLessons = false;
    saveHiddenLessonSlots(planId, group, targetState.hiddenLessonSlots);
    if (typeof onRefresh === "function") {
      onRefresh();
    }
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
    loadHiddenLessonSlots,
    saveHiddenLessonSlots,
    toggleLessonSlotHidden,
    restoreAllHiddenLessonSlots,
    formatHiddenCount
  };
});
