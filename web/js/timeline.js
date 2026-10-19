/**
 * Timeline Module (web/js/timeline.js)
 * Obliczenia kalendarzowe, tygodnie akademickie i strefy czasowe.
 * Zgodny z UMD: działa w przeglądarce i środowisku Node.js.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.Timeline = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const _engineModule =
    typeof module === "object" && module.exports
      ? require("./schedule-engine.js")
      : typeof window !== "undefined" && window.ScheduleEngine
      ? window.ScheduleEngine
      : null;
  const _defaultEngine = _engineModule ? _engineModule.create({}) : null;

  function formatDateISO(date) {
    if (_defaultEngine) return _defaultEngine.formatDateISO(date);
    if (!date) return "";
    const d = new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function getMonday(d) {
    if (_defaultEngine) return _defaultEngine.getMonday(d);
    const target = new Date(d);
    const day = target.getDay();
    const diff = target.getDate() - day + (day === 0 ? -6 : 1);
    target.setDate(diff);
    target.setHours(0, 0, 0, 0);
    return target;
  }

  function getWeekMonday(offsetWeeks = 0) {
    const now = new Date();
    const baseMonday = getMonday(now);
    baseMonday.setDate(baseMonday.getDate() + offsetWeeks * 7);
    return baseMonday;
  }

  function getAcademicInfoForWeek(targetMonday, calendarData, options = {}) {
    const cal = calendarData || (typeof window !== "undefined" && window.ACADEMIC_CALENDAR) || { periods: [] };
    const isNst = Boolean(options.isNst);
    const targetSunday = new Date(targetMonday);
    targetSunday.setDate(targetMonday.getDate() + 6);

    const monISO = formatDateISO(targetMonday);
    const sunISO = formatDateISO(targetSunday);

    let periodName = "";
    let periodType = "";
    let weekNum = null;

    for (const period of cal.periods || []) {
      if (period.start <= sunISO && period.end >= monISO) {
        periodName = period.name;
        periodType = period.type;

        if (period.type === "teaching") {
          const [sy, sm, sd] = period.start.split("-").map(Number);
          const semStartMon = getMonday(new Date(sy, sm - 1, sd));
          const diffWeeks = Math.floor((targetMonday.getTime() - semStartMon.getTime()) / (7 * 24 * 60 * 60 * 1000));
          const w = diffWeeks + 1;
          if (w >= 1 && w <= 16) {
            weekNum = w;
          }
        }
        break;
      }
    }
    const daySwaps = [];
    const holidays = [];
    const dniPelne = {
      0: "Poniedziałek", 1: "Wtorek", 2: "Środa", 3: "Czwartek",
      4: "Piątek", 5: "Sobota", 6: "Niedziela"
    };

    for (let i = 0; i < 7; i++) {
      const d = new Date(targetMonday);
      d.setDate(targetMonday.getDate() + i);
      const dISO = formatDateISO(d);

      if (!isNst && cal.daySwaps && cal.daySwaps[dISO]) {
        daySwaps.push({ date: dISO, ...cal.daySwaps[dISO] });
      }
      if (cal.holidays && cal.holidays[dISO]) {
        const dayFormatted = `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
        const dayName = dniPelne[i] || "";
        holidays.push(`${dayFormatted} (${dayName}): ${cal.holidays[dISO]}`);
      }
    }

    return { periodName, periodType, weekNum, daySwaps, holidays };
  }

  function resolveInitialWeekOffset(scheduleData) {
    if (!scheduleData) return 0;

    let earliestMonday = null;
    let latestMonday = null;

    // Obsługa formatu legacy oraz kontraktu v1 (lessons list)
    if (Array.isArray(scheduleData.lessons)) {
      for (const lesson of scheduleData.lessons) {
        const occs = lesson.occurrences || [];
        for (const occ of occs) {
          if (occ.date) {
            const [y, m, d] = occ.date.split("-").map(Number);
            const mon = getMonday(new Date(y, m - 1, d));
            if (!earliestMonday || mon < earliestMonday) earliestMonday = mon;
            if (!latestMonday || mon > latestMonday) latestMonday = mon;
          }
        }
      }
    } else {
      for (const daySlots of Object.values(scheduleData)) {
        if (!daySlots) continue;
        const list = Array.isArray(daySlots) ? daySlots : Object.values(daySlots);
        for (const lesson of list) {
          if (lesson && lesson.data_start) {
            const [y, m, d] = lesson.data_start.split("-").map(Number);
            const startDate = new Date(y, m - 1, d);
            const mon = getMonday(startDate);
            const totalWeeks = lesson.tygodnie || 15;
            const endMon = new Date(mon);
            endMon.setDate(mon.getDate() + (totalWeeks - 1) * 7);

            if (!earliestMonday || mon < earliestMonday) earliestMonday = mon;
            if (!latestMonday || endMon > latestMonday) latestMonday = endMon;
          }
        }
      }
    }

    if (!earliestMonday) return 0;

    const nowMonday = getMonday(new Date());
    if (nowMonday < earliestMonday) {
      return Math.round((earliestMonday.getTime() - nowMonday.getTime()) / (7 * 24 * 60 * 60 * 1000));
    } else if (latestMonday && nowMonday > latestMonday) {
      return Math.round((latestMonday.getTime() - nowMonday.getTime()) / (7 * 24 * 60 * 60 * 1000));
    }
    return 0;
  }

  return {
    formatDateISO,
    getMonday,
    getWeekMonday,
    getAcademicInfoForWeek,
    resolveInitialWeekOffset
  };
});
