/**
 * ScheduleEngine — Czysty silnik reguł dziedzinowych kalendarza akademickiego i planu zajęć
 * 
 * Zgodny ze specyfikacją: docs/specs/schedule-engine-refactor.md
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

  const now = options.now ? new Date(options.now) : new Date();

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

  function resolveBaseDay(dateISO, options = {}) {
    if (!dateISO || typeof dateISO !== "string") return null;
    const parts = dateISO.split("-").map(Number);
    if (parts.length !== 3) return null;
    const [year, month, day] = parts;
    const d = new Date(year, month - 1, day);
    if (isNaN(d.getTime())) return null;

    const isNst = options.isNst === true || options.studyMode === "niestacjonarne";
    if (!isNst && cal.daySwaps && cal.daySwaps[dateISO]) {
      return cal.daySwaps[dateISO].replaceWith;
    }
    return DNI_MAP_SUNDAY_FIRST[d.getDay()];
  }

  function getLessonSemesterPeriod(lesson) {
    if (!lesson || !lesson.data_start || !cal.periods) return null;
    const startIso = lesson.data_start;
    const teachingPeriods = cal.periods.filter(p => p.type === "teaching");
    if (!teachingPeriods.length) return null;

    if (typeof lesson.semestr === "number") {
      const isSummer = lesson.semestr % 2 === 0;
      return teachingPeriods.find(
        p => isSummer ? p.name.includes("letni") : p.name.includes("zimowy")
      ) || null;
    }

    const directMatch = teachingPeriods.find(p => p.start <= startIso && p.end >= startIso);
    if (directMatch) return directMatch;

    if (startIso <= "2027-02-21") {
      return teachingPeriods.find(p => p.name.includes("zimowy")) || teachingPeriods[0];
    }
    return teachingPeriods.find(p => p.name.includes("letni")) || teachingPeriods[1];
  }

  function getLessonMeetingInfo(lesson, baseDay, targetMonday, targetDate = null) {
    if (!lesson || !lesson.data_start) {
      return { active: true, meetingNum: 1, total: (lesson && lesson.tygodnie) || 15 };
    }

    try {
      let [year, month, day] = lesson.data_start.split("-").map(Number);
      let startDate = new Date(year, month - 1, day);
      if (isNaN(startDate.getTime())) {
        return { active: true, meetingNum: 1, total: lesson.tygodnie || 15 };
      }

      const halfSem = lesson.half_semester || lesson.polowa_sem;
      if (halfSem === 2 && cal.half_boundaries && cal.half_boundaries.half_2_start) {
        const [hy, hm, hd] = cal.half_boundaries.half_2_start.split("-").map(Number);
        const h2Date = new Date(hy, hm - 1, hd);
        if (!isNaN(h2Date.getTime()) && startDate < h2Date) {
          startDate = h2Date;
        }
      }

      const startMonday = getMonday(startDate);
      const totalWeeks = lesson.tygodnie || 15;

      // Hard semester end: days outside teaching periods, holidays, or exam sessions cannot have active classes
      if (targetDate && !isTeachingDay(targetDate)) {
        return { active: false, meetingNum: 0, total: totalWeeks };
      }

      // Semester boundaries
      const semPeriod = getLessonSemesterPeriod(lesson);
      if (semPeriod) {
        if (targetDate && (targetDate < semPeriod.start || targetDate > semPeriod.end)) {
          return { active: false, meetingNum: 0, total: totalWeeks };
        }
        if (!targetDate) {
          const monIso = formatDateISO(targetMonday);
          const sun = new Date(targetMonday);
          sun.setDate(sun.getDate() + 6);
          const sunIso = formatDateISO(sun);
          if (sunIso < semPeriod.start || monIso > semPeriod.end) {
            return { active: false, meetingNum: 0, total: totalWeeks };
          }
        }
      }

      if (targetDate && targetDate < formatDateISO(startDate)) {
        return { active: false, meetingNum: 0, total: totalWeeks };
      }
      if (!targetDate && targetMonday < startMonday) {
        return { active: false, meetingNum: 0, total: totalWeeks };
      }

      // Guard: if baseDay is not a recognised weekday name, avoid iterating
      if (!DNI_MAP_SUNDAY_FIRST.includes(baseDay)) {
        return { active: true, meetingNum: 1, total: totalWeeks };
      }

      let currentMon = new Date(startMonday);
      currentMon.setHours(0, 0, 0, 0);
      let meetingCount = 0;
      let targetMeetingNum = null;
      let targetActive = false;

      const MAX_ITER = 200;
      let safetyCount = 0;

      while ((currentMon <= targetMonday || meetingCount < totalWeeks) && safetyCount++ < MAX_ITER) {
        const diffTime = currentMon.getTime() - startMonday.getTime();
        const diffWeeks = Math.round(diffTime / (1000 * 60 * 60 * 24 * 7));

        const isCycleWeek = (lesson.co_ile !== 2) || (diffWeeks % 2 === 0);

        if (isCycleWeek) {
          for (let i = 0; i < 7; i++) {
            const dayDate = new Date(currentMon);
            dayDate.setDate(currentMon.getDate() + i);
            dayDate.setHours(0, 0, 0, 0);
            const iso = formatDateISO(dayDate);

            if (iso < lesson.data_start) continue;
            if (semPeriod && (iso < semPeriod.start || iso > semPeriod.end)) continue;
            if (!isTeachingDay(iso)) continue;

            let effectiveDay = DNI_MAP_SUNDAY_FIRST[dayDate.getDay()];
            if (cal.daySwaps && cal.daySwaps[iso]) {
              effectiveDay = cal.daySwaps[iso].replaceWith;
            }

            if (effectiveDay === baseDay) {
              meetingCount++;

              if (targetDate) {
                if (iso === targetDate) {
                  targetMeetingNum = meetingCount;
                  targetActive = meetingCount <= totalWeeks;
                }
              } else if (currentMon.getTime() === targetMonday.getTime()) {
                targetMeetingNum = meetingCount;
                targetActive = meetingCount <= totalWeeks;
              }
            }
          }
        }

        if (currentMon.getTime() === targetMonday.getTime() && targetMeetingNum === null) {
          targetActive = false;
          targetMeetingNum = meetingCount;
        }

        if (currentMon > targetMonday && meetingCount >= totalWeeks) break;
        currentMon.setDate(currentMon.getDate() + 7);
        currentMon.setHours(0, 0, 0, 0);
      }

      return {
        active: targetActive,
        meetingNum: targetMeetingNum !== null ? targetMeetingNum : meetingCount,
        total: totalWeeks
      };
    } catch (e) {
      return { active: true, meetingNum: 1, total: (lesson && lesson.tygodnie) || 15 };
    }
  }

  function getLessonProgress(lesson, baseDay, targetMonday, targetDate = null) {
    if (!lesson || !lesson.tygodnie) return null;
    if (!lesson.data_start) {
      return { text: `${lesson.tygodnie}`, title: `Liczba spotkań: ${lesson.tygodnie}`, isFinal: false };
    }

    try {
      const info = getLessonMeetingInfo(lesson, baseDay, targetMonday, targetDate);
      if (!info.meetingNum || info.meetingNum < 1) {
        return { text: `${lesson.tygodnie}`, title: `Liczba spotkań: ${lesson.tygodnie}`, isFinal: false };
      }

      const total = info.total || lesson.tygodnie;
      const isFinal = info.meetingNum >= total;

      if (isFinal) {
        return {
          text: "Ostatnie zajęcia",
          title: `Ostatnie zajęcia (${info.meetingNum} z ${total})`,
          isFinal: true
        };
      }

      const text = total > 1 ? `${info.meetingNum}/${total}` : `${info.meetingNum}`;
      const title = total > 1 ? `Spotkanie ${info.meetingNum} z ${total}` : `Spotkanie ${info.meetingNum}`;

      return { text, title, isFinal: false };
    } catch (e) {
      return { text: `${lesson.tygodnie}`, title: `Liczba spotkań: ${lesson.tygodnie}`, isFinal: false };
    }
  }

  function getRoomOccupancyAt(daySchedule, queryRange, targetDateIso, baseDay) {
    if (!daySchedule || !daySchedule.length) {
      return { isFree: true, occupyingClass: null, nextClass: null };
    }

    if (!isTeachingDay(targetDateIso)) {
      return { isFree: true, occupyingClass: null, nextClass: null };
    }

    const qStart = queryRange.start;
    const qEnd = queryRange.end;

    let occupyingClass = null;
    let nextClass = null;

    const [y, m, d] = targetDateIso.split("-").map(Number);
    const targetDateObj = new Date(y, m - 1, d);
    const targetMonday = getMonday(targetDateObj);

    for (const entry of daySchedule) {
      if (!entry.hours || !entry.hours.includes(" - ")) continue;
      const [startStr, endStr] = entry.hours.split(" - ");
      const [sh, sm] = startStr.trim().split(":").map(Number);
      const [eh, em] = endStr.trim().split(":").map(Number);
      const cStart = sh * 60 + sm;
      const cEnd = eh * 60 + em;

      const lessonDesc = {
        przedmiot: entry.subject || entry.przedmiot,
        data_start: entry.data_start,
        tygodnie: entry.weeks || entry.tygodnie || 15,
        co_ile: entry.co_ile || 1,
        polowa_sem: entry.polowa_sem
      };

      const meetingInfo = getLessonMeetingInfo(lessonDesc, baseDay, targetMonday, targetDateIso);
      if (!meetingInfo.active) {
        continue;
      }

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
      for (const [dayCode, daySlots] of Object.entries(plan)) {
        if (!daySlots || typeof daySlots !== "object") continue;
        const slotsArray = Array.isArray(daySlots) ? daySlots : Object.values(daySlots);
        for (const lesson of slotsArray) {
          if (!lesson || !lesson.sala) continue;
          const roomName = String(lesson.sala).trim();
          if (!roomName || roomName.toUpperCase() === "OL") continue;

          if (!index[roomName]) index[roomName] = {};
          if (!index[roomName][dayCode]) index[roomName][dayCode] = [];

          index[roomName][dayCode].push({
            hours: lesson.godziny || lesson.hours || "",
            subject: lesson.przedmiot || lesson.subject || "",
            data_start: lesson.data_start,
            weeks: lesson.tygodnie || lesson.weeks || 15,
            co_ile: lesson.co_ile || 1,
            polowa_sem: lesson.polowa_sem,
            groups: lesson.grupy || (lesson.grupa ? [lesson.grupa] : []),
            planId: planId
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
      (rawSchedule && Object.keys(rawSchedule).some(k => /^\d{4}-\d{2}-\d{2}$/.test(k)));

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

      // Lekcje dla dnia
      let lessons = [];
      let baseDayPreview = null;

      // Jeśli status to holiday, break lub exam -> lessons jest zawsze [] (zgodnie z D3)
      if (status === "normal" || status === "daySwap") {
        // 0. Sprawdź format Contract v1: lista lessons z wyliczonymi occurrences
        if (rawSchedule && Array.isArray(rawSchedule.lessons)) {
          for (const lesson of rawSchedule.lessons) {
            if (!lesson) continue;
            let occ = null;
            if (Array.isArray(lesson.occurrences)) {
              occ = lesson.occurrences.find(o => o.date === dateISO);
            }
            if (occ || scheduleOptions.includeInactive) {
              const mNum = occ ? (occ.index != null ? occ.index : (occ.number != null ? occ.number : 1)) : 0;
              const total = occ ? (occ.total != null ? occ.total : (occ.of != null ? occ.of : 15)) : 15;
              const isFin = mNum >= total;

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
                sourceDay: day,
                lessonDate: dateISO,
                przedmiot: lesson.subject,
                raw_przedmiot: lesson.raw_subject || lesson.subject,
                godziny: `${lesson.start_time} - ${lesson.end_time}`,
                sala: lesson.room || "brak sali",
                forma: lesson.type || lesson.form || "",
                prowadzacy: Array.isArray(lesson.teachers) ? lesson.teachers.join(", ") : (lesson.teacher || "")
              });
            }
          }
        } else if (rawSchedule && Array.isArray(rawSchedule[dateISO])) {
          // 1. Sprawdź format niestacjonarny: bezpośredni klucz dateISO (np. "2026-10-03")
          const nstLessons = rawSchedule[dateISO];
          for (let idx = 0; idx < nstLessons.length; idx++) {
            const lesson = nstLessons[idx];
            if (!lesson) continue;
            lessons.push({
              ...lesson,
              slot: idx + 1,
              isActive: true,
              meetingNumber: null,
              totalMeetings: null,
              isFinalMeeting: false,
              sourceDay: day,
              lessonDate: dateISO
            });
          }
        } else {
          // 2. Format stacjonarny: kluczowanie dniami tygodnia
          const sourceDay = status === "daySwap" ? swapReplaceWith : day;
          const daySlots = (rawSchedule && rawSchedule[sourceDay]) || {};
          const entries = Array.isArray(daySlots)
            ? daySlots.map((item, idx) => [idx, item])
            : Object.entries(daySlots);

          for (const [slotKey, lesson] of entries) {
            if (!lesson) continue;
            const meetingInfo = getLessonMeetingInfo(lesson, sourceDay, mon, dateISO);
            const isAct = meetingInfo.active;

            if (isAct || scheduleOptions.includeInactive) {
              const total = meetingInfo.total || lesson.tygodnie || 15;
              const mNum = isAct ? meetingInfo.meetingNum : 0;
              const isFin = mNum >= total;

              lessons.push({
                ...lesson,
                slot: parseInt(slotKey) || 0,
                isActive: isAct,
                meetingNumber: mNum,
                totalMeetings: total,
                isFinalMeeting: isFin,
                sourceDay: sourceDay,
                lessonDate: dateISO
              });
            }
          }
        }
        lessons.sort((a, b) => a.slot - b.slot);

        // Obsługa baseDayPreview w dniu zamiany dnia
        if (status === "daySwap") {
          if (rawSchedule && Array.isArray(rawSchedule.lessons)) {
            const DOW_PL_TO_EN = { PON: "MON", WT: "TUE", ŚR: "WED", CZW: "THU", PT: "FRI", SOB: "SAT", ND: "SUN" };
            const targetDowEn = DOW_PL_TO_EN[day] || day;
            baseDayPreview = [];
            for (const lesson of rawSchedule.lessons) {
              if (lesson.day_of_week === targetDowEn || lesson.day_of_week === day) {
                let slotNum = 0;
                if (lesson.start_time) {
                  const [sh, sm] = lesson.start_time.split(":").map(Number);
                  slotNum = (sh - 7) * 12 + Math.floor(sm / 5);
                }
                baseDayPreview.push({
                  ...lesson,
                  slot: slotNum,
                  isActive: true,
                  meetingNumber: null,
                  totalMeetings: 15,
                  isFinalMeeting: false,
                  sourceDay: day,
                  lessonDate: dateISO,
                  przedmiot: lesson.subject,
                  godziny: `${lesson.start_time} - ${lesson.end_time}`,
                  sala: lesson.room || "brak sali",
                  forma: lesson.type || lesson.form || "",
                  prowadzacy: Array.isArray(lesson.teachers) ? lesson.teachers.join(", ") : (lesson.teacher || "")
                });
              }
            }
          } else {
            const originalDaySlots = (rawSchedule && rawSchedule[day]) || {};
            const originalEntries = Array.isArray(originalDaySlots)
              ? originalDaySlots.map((item, idx) => [idx, item])
              : Object.entries(originalDaySlots);

            baseDayPreview = [];
            for (const [slotKey, lesson] of originalEntries) {
              if (!lesson) continue;
              baseDayPreview.push({
                ...lesson,
                slot: parseInt(slotKey) || 0,
                isActive: true,
                meetingNumber: null, // semantyka D5: podgląd nie liczy spotkań
                totalMeetings: lesson.tygodnie || 15,
                isFinalMeeting: false,
                sourceDay: day,
                lessonDate: dateISO
              });
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
    getLessonMeetingInfo,
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
