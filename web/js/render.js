/**
 * Render Module (web/js/render.js)
 * Renderowanie kart zajęć, badge'y form i bezpieczne formatowanie HTML.
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

  return {
    escapeHtml,
    renderLessonCard
  };
});
