/**
 * ScheduleEngine — Czysty silnik reguł dziedzinowych kalendarza akademickiego i planu zajęć (Contract v1)
 *
 * Konsumuje gotowe tablice occurrences[] wyliczone na etapie buildu przez core/expand.py
 * oraz tablice dates[] w indeksie cross_reference.json.
 */

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.ScheduleEngine = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  const DNI_TYGODNIA = ["PON", "WT", "ŚR", "CZW", "PT", "SOB", "ND"];
  const DNI_MAP_SUNDAY_FIRST = ["ND", "PON", "WT", "ŚR", "CZW", "PT", "SOB"];
  const DOW_EN_TO_PL = { MON: "PON", TUE: "WT", WED: "ŚR", THU: "CZW", FRI: "PT", SAT: "SOB", SUN: "ND" };
  const DOW_PL_TO_EN = { PON: "MON", WT: "TUE", ŚR: "WED", CZW: "THU", PT: "FRI", SOB: "SAT", ND: "SUN" };

  function formatDateISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function getMonday(d) {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    date.setDate(diff);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function create(academicCalendar, options = {}) {
    // Izolacja wejścia przez głęboką kopię (brak mutacji wejścia)
    const cal = academicCalendar ? structuredClone(academicCalendar) : { daySwaps: {}, holidays: {}, periods: [] };
    if (!cal.daySwaps) cal.daySwaps = {};
    if (!cal.holidays) cal.holidays = {};
    if (!cal.periods) cal.periods = [];

    function isTeachingDay(iso) {
      if (cal.holidays && cal.holidays[iso]) return false;
      if (cal.periods) {
        const isNonTeaching = cal.periods.some(
          p => (p.type === "break" || p.type === "exam") && p.start <= iso && p.end >= iso
        );
        if (isNonTeaching) return false;
      }
      return true;
    }

    function resolveBaseDay(dateISO, resolveOptions = {}) {
      if (!dateISO || typeof dateISO !== "string") return null;
      const parts = dateISO.split("-").map(Number);
      if (parts.length !== 3) return null;
      const [year, month, day] = parts;
      const d = new Date(year, month - 1, day);
      if (isNaN(d.getTime())) return null;

      const isNst = resolveOptions.isNst === true || resolveOptions.studyMode === "niestacjonarne";
      if (!isNst && cal.daySwaps && cal.daySwaps[dateISO]) {
        return cal.daySwaps[dateISO].replaceWith;
      }
      return DNI_MAP_SUNDAY_FIRST[d.getDay()];
    }

    function getLessonProgress(lesson, baseDay, targetMonday, targetDate = null) {
      if (!lesson) return null;

      let mNum = lesson.meetingNumber;
      let total = lesson.totalMeetings;

      if ((mNum == null || total == null) && Array.isArray(lesson.occurrences)) {
        let occ = null;
        if (targetDate) {
          occ = lesson.occurrences.find(o => o.date === targetDate);
        } else if (targetMonday) {
          const mon = getMonday(targetMonday);
          const monIso = formatDateISO(mon);
          const sun = new Date(mon);
          sun.setDate(sun.getDate() + 6);
          const sunIso = formatDateISO(sun);
          occ = lesson.occurrences.find(o => o.date >= monIso && o.date <= sunIso);
        }
        if (occ) {
          mNum = occ.meeting != null ? occ.meeting : (occ.index != null ? occ.index : (occ.number != null ? occ.number : 1));
          total = occ.total != null ? occ.total : (occ.of != null ? occ.of : lesson.occurrences.length);
        }
      }

      if (!mNum || mNum < 1) return null;
      total = total || mNum;
      const isFinal = mNum >= total;

      if (isFinal) {
        return {
          text: "Ostatnie zajęcia",
          title: `Ostatnie zajęcia (${mNum} z ${total})`,
          isFinal: true
        };
      }

      const text = total > 1 ? `${mNum}/${total}` : `${mNum}`;
      const title = total > 1 ? `Spotkanie ${mNum} z ${total}` : `Spotkanie ${mNum}`;
      return { text, title, isFinal: false };
    }

    function getRoomOccupancyAt(daySchedule, queryRange, targetDateIso) {
      if (!daySchedule || !daySchedule.length) {
        return { isFree: true, occupyingClass: null, overlappingClass: null, nextClass: null };
      }

      if (!isTeachingDay(targetDateIso)) {
        return { isFree: true, occupyingClass: null, overlappingClass: null, nextClass: null };
      }

      const qStart = queryRange.start;
      const qEnd = queryRange.end;

      let occupyingClass = null;
      let nextClass = null;

      for (const entry of daySchedule) {
        if (!entry || !entry.hours || !entry.hours.includes(" - ")) continue;

        // Weryfikacja daty realizacji z tablicy dates[] (Contract v1 cross_reference.json)
        if (Array.isArray(entry.dates) && !entry.dates.includes(targetDateIso)) {
          continue;
        }

        const [startStr, endStr] = entry.hours.split(" - ");
        const [sh, sm] = startStr.trim().split(":").map(Number);
        const [eh, em] = endStr.trim().split(":").map(Number);
        const cStart = sh * 60 + sm;
        const cEnd = eh * 60 + em;

        if (cStart < qEnd && cEnd > qStart) {
          occupyingClass = entry;
          break;
        }
        if (cStart >= qEnd) {
          if (!nextClass) {
            nextClass = entry;
          } else {
            const [nsh, nsm] = nextClass.hours.split(" - ")[0].trim().split(":").map(Number);
            if (cStart < nsh * 60 + nsm) {
              nextClass = entry;
            }
          }
        }
      }

      return {
        isFree: !occupyingClass,
        occupyingClass,
        overlappingClass: occupyingClass,
        nextClass
      };
    }

    function buildScheduleIndex(plansMap) {
      const index = {};
      if (!plansMap) return index;

      for (const [planId, plan] of Object.entries(plansMap)) {
        if (!plan || typeof plan !== "object") continue;

        if (Array.isArray(plan.lessons)) {
          for (const lesson of plan.lessons) {
            if (!lesson || !lesson.room || lesson.remote) continue;
            const roomName = String(lesson.room).trim();
            if (!roomName || roomName.toUpperCase() === "OL") continue;

            const dayCode = DOW_EN_TO_PL[lesson.day_of_week] || lesson.day_of_week || "PON";
            if (!index[roomName]) index[roomName] = {};
            if (!index[roomName][dayCode]) index[roomName][dayCode] = [];

            const dates = Array.isArray(lesson.occurrences)
              ? lesson.occurrences.map(o => o.date).filter(Boolean)
              : [];

            index[roomName][dayCode].push({
              hours: `${lesson.start_time} - ${lesson.end_time}`,
              subject: lesson.subject || "",
              dates,
              groups: lesson.groups || (plan.group ? [plan.group] : []),
              planId
            });
          }
        }
      }
      return index;
    }

    function resolveWeekSchedule(targetMonday, rawSchedule, scheduleOptions = {}) {
      const result = {};
      const mon = new Date(targetMonday);
      mon.setHours(0, 0, 0, 0);

      const isNstSchedule = scheduleOptions.isNst === true ||
        scheduleOptions.studyMode === "niestacjonarne" ||
        scheduleOptions.studyMode === "part_time";

      for (let dIdx = 0; dIdx < DNI_TYGODNIA.length; dIdx++) {
        const day = DNI_TYGODNIA[dIdx];
        const dayDate = new Date(mon);
        dayDate.setDate(mon.getDate() + dIdx);
        dayDate.setHours(0, 0, 0, 0);
        const dateISO = formatDateISO(dayDate);

        // Tabela priorytetów D4:
        // 1. Data w academicCalendar.holidays -> "holiday"
        // 2. Data w academicCalendar.daySwaps (tylko studia stacjonarne) -> "daySwap"
        // 3. Data objęta periodem type: "break" -> "break"
        // 4. Data objęta periodem type: "exam" -> "exam"
        // 5. Domyślny -> "normal"

        let status = "normal";
        let message = null;
        let swapNote = null;
        let swapReplaceWith = null;

        if (cal.holidays && cal.holidays[dateISO]) {
          status = "holiday";
          message = cal.holidays[dateISO];
        } else if (!isNstSchedule && cal.daySwaps && cal.daySwaps[dateISO]) {
          status = "daySwap";
          swapNote = cal.daySwaps[dateISO].note || null;
          swapReplaceWith = cal.daySwaps[dateISO].replaceWith || null;
          message = swapNote;
        } else if (cal.periods) {
          const breakPeriod = cal.periods.find(p => p.type === "break" && p.start <= dateISO && p.end >= dateISO);
          if (breakPeriod) {
            status = "break";
            message = breakPeriod.name;
          } else {
            const examPeriod = cal.periods.find(p => p.type === "exam" && p.start <= dateISO && p.end >= dateISO);
            if (examPeriod) {
              status = "exam";
              message = examPeriod.name;
            }
          }
        }

        let lessons = [];
        let baseDayPreview = null;

        // Jeśli status to holiday, break lub exam -> lessons jest zawsze [] (zgodnie z D3)
        if (status === "normal" || status === "daySwap") {
          if (rawSchedule && Array.isArray(rawSchedule.lessons)) {
            for (const lesson of rawSchedule.lessons) {
              if (!lesson) continue;
              const occs = Array.isArray(lesson.occurrences) ? lesson.occurrences : [];
              const occ = occs.find(o => o && o.date === dateISO) || null;

              const targetDowEn = DOW_PL_TO_EN[day] || day;
              const matchesDayForInactive = scheduleOptions.includeInactive &&
                (lesson.day_of_week === targetDowEn || lesson.day_of_week === day);

              if (occ || matchesDayForInactive) {
                const mNum = occ ? (occ.meeting != null ? occ.meeting : (occ.index != null ? occ.index : (occ.number != null ? occ.number : 1))) : 0;
                const total = occ
                  ? (occ.total != null ? occ.total : (occ.of != null ? occ.of : occs.length || 15))
                  : (occs.length || 15);
                const isFin = Boolean(occ) && (occ.is_final === true || mNum >= total);

                let slotNum = 0;
                if (lesson.start_time) {
                  const [sh, sm] = lesson.start_time.split(":").map(Number);
                  slotNum = (sh - 7) * 12 + Math.floor(sm / 5);
                }

                lessons.push({
                  ...lesson,
                  slot: slotNum,
                  isActive: Boolean(occ),
                  meetingNumber: mNum,
                  totalMeetings: total,
                  isFinalMeeting: isFin,
                  progress: {
                    text: isFin ? "Ostatnie zajęcia" : `${mNum}/${total}`,
                    isFinal: isFin
                  },
                  sourceDay: status === "daySwap" ? (swapReplaceWith || day) : day,
                  lessonDate: dateISO,
                  przedmiot: lesson.subject || lesson.przedmiot,
                  raw_przedmiot: lesson.raw_subject || lesson.subject || lesson.przedmiot,
                  godziny: lesson.godziny || `${lesson.start_time} - ${lesson.end_time}`,
                  sala: lesson.room || lesson.sala || "brak sali",
                  forma: lesson.type || lesson.form || lesson.forma || "",
                  prowadzacy: Array.isArray(lesson.teachers)
                    ? lesson.teachers.join(", ")
                    : (lesson.teacher || lesson.prowadzacy || "")
                });
              }
            }
          }

          lessons.sort((a, b) => a.slot - b.slot);

          // Obsługa baseDayPreview w dniu zamiany dnia (D5: podgląd zajęć z zastępowanego dnia tygodnia)
          if (status === "daySwap") {
            baseDayPreview = [];
            if (rawSchedule && Array.isArray(rawSchedule.lessons)) {
              const targetDowEn = DOW_PL_TO_EN[day] || day;
              for (const lesson of rawSchedule.lessons) {
                if (!lesson) continue;
                if (lesson.day_of_week === targetDowEn || lesson.day_of_week === day) {
                  let slotNum = 0;
                  if (lesson.start_time) {
                    const [sh, sm] = lesson.start_time.split(":").map(Number);
                    slotNum = (sh - 7) * 12 + Math.floor(sm / 5);
                  }
                  const occs = Array.isArray(lesson.occurrences) ? lesson.occurrences : [];
                  baseDayPreview.push({
                    ...lesson,
                    slot: slotNum,
                    isActive: true,
                    meetingNumber: null,
                    totalMeetings: occs.length || 15,
                    isFinalMeeting: false,
                    sourceDay: day,
                    lessonDate: dateISO,
                    przedmiot: lesson.subject || lesson.przedmiot,
                    godziny: lesson.godziny || `${lesson.start_time} - ${lesson.end_time}`,
                    sala: lesson.room || lesson.sala || "brak sali",
                    forma: lesson.type || lesson.form || lesson.forma || "",
                    prowadzacy: Array.isArray(lesson.teachers)
                      ? lesson.teachers.join(", ")
                      : (lesson.teacher || lesson.prowadzacy || "")
                  });
                }
              }
            }
            baseDayPreview.sort((a, b) => a.slot - b.slot);
          }
        }

        result[day] = {
          status,
          message,
          swapNote,
          swapReplaceWith,
          dateISO,
          dateObj: dayDate,
          lessons,
          baseDayPreview
        };
      }

      return result;
    }

    return {
      resolveWeekSchedule,
      getLessonProgress,
      getRoomOccupancyAt,
      buildScheduleIndex,
      isTeachingDay,
      resolveBaseDay,
      getMonday,
      formatDateISO
    };
  }

  return {
    create,
    DNI_TYGODNIA,
    DNI_MAP_SUNDAY_FIRST,
    formatDateISO,
    getMonday
  };
});
