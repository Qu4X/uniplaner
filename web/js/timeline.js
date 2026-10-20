/**
 * Timeline & Plan Metadata Module (web/js/timeline.js)
 * Obliczenia kalendarzowe, tygodnie akademickie, deklinacje dni tygodnia oraz parsowanie i sortowanie planów.
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

  const DNI_TYGODNIA = ["PON", "WT", "ŚR", "CZW", "PT", "SOB", "ND"];
  const DNI_MAP_SUNDAY_FIRST = ["ND", "PON", "WT", "ŚR", "CZW", "PT", "SOB"];

  const DNI_PELNE = {
    PON: "Poniedziałek",
    WT: "Wtorek",
    ŚR: "Środa",
    CZW: "Czwartek",
    PT: "Piątek",
    SOB: "Sobota",
    ND: "Niedziela"
  };

  const DNI_DOPELNIACZ = {
    PON: "poniedziałku",
    WT: "wtorku",
    ŚR: "środy",
    CZW: "czwartku",
    PT: "piątku",
    SOB: "soboty",
    ND: "niedzieli"
  };

  const DNI_MIEJSCOWNIK = {
    PON: "poniedziałek",
    WT: "wtorek",
    ŚR: "środę",
    CZW: "czwartek",
    PT: "piątek",
    SOB: "sobotę",
    ND: "niedzielę"
  };

  const DNI_PRZYMIOTNIK = {
    PON: "poniedziałkowym",
    WT: "wtorkowym",
    ŚR: "środowym",
    CZW: "czwartkowym",
    PT: "piątkowym",
    SOB: "sobotnim",
    ND: "niedzielnym"
  };

  const DNI_PRZYIMEK = {
    PON: "w",
    WT: "we",
    ŚR: "w",
    CZW: "w",
    PT: "w",
    SOB: "w",
    ND: "w"
  };

  const _engineModule =
    typeof module === "object" && module.exports
      ? require("./schedule-engine.js")
      : typeof window !== "undefined" && window.ScheduleEngine
      ? window.ScheduleEngine
      : null;
  const _defaultEngine = _engineModule ? _engineModule.create({}) : null;

  function loadDefaultCalendar() {
    return { daySwaps: {}, holidays: {}, periods: [] };
  }

  function getTodayCode(respectMode = false, daysView = "workdays") {
    const dayIdx = new Date().getDay();
    const code = DNI_MAP_SUNDAY_FIRST[dayIdx];
    if (respectMode && daysView === "workdays" && (code === "SOB" || code === "ND")) {
      return "PON";
    }
    return code;
  }

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

  function normalizePlansData(raw) {
    if (!raw || typeof raw !== "object") return { plans: {} };
    if (Array.isArray(raw.plans)) {
      const map = {};
      for (const entry of raw.plans) {
        if (!entry || !entry.id) continue;
        map[String(entry.id)] = {
          ...entry,
          name: entry.name || entry.id,
          clean_name: entry.clean_name || entry.name || entry.id,
          version: entry.version || (entry.version_token && /^(?:wer\.?|v(?:er)?\.?)\s*\d+/i.test(entry.version_token) ? entry.version_token.replace(/\s*\[.*?\]\s*/g, "").trim() : null),
          mode: entry.mode || (entry.study_mode === "part_time" ? "niestacjonarne" : "stacjonarne"),
          groups: Array.isArray(entry.groups) ? entry.groups : []
        };
      }
      return {
        ...raw,
        last_updated: raw.last_updated || (raw.generated_at ? String(raw.generated_at).slice(0, 16).replace("T", " ") : ""),
        plans_list: raw.plans,
        plans: map
      };
    }
    return raw;
  }

  function parsePlanInfo(rawName) {
    if (!rawName) return { cleanName: "", publishedAt: null, version: null, isSecondDegree: false };

    const dateMatch = rawName.match(/\[(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2})?)\]/);
    const publishedAt = dateMatch ? dateMatch[1] : null;

    const verMatch = rawName.match(/\b(?:wer\.?|wersja)\s*(\d+)\b/i);
    const version = verMatch ? `wer. ${verMatch[1]}` : null;

    const isSecondDegree = /drugiego\s+stopnia|II\s+st/i.test(rawName);

    let clean = rawName.replace(/^\[[^\]]+\]\s*/, "");
    clean = clean.replace(/\s*\[modyfikowany\]\s*/gi, " ");
    clean = clean.replace(/\s*\[\d{4}-\d{2}-\d{2}[^\]]*\]\s*(?:wer\.?\s*\d+)?/gi, "");
    clean = clean.replace(/\s*\b(?:wer\.?|wersja)\s*\d+\b/gi, "");
    clean = clean.replace(/\s*(?:pierwszego|drugiego)\s+stopnia\s*/gi, " ");
    clean = clean.replace(/\s*(?:I|II)\s+stopnia\s*/gi, " ");
    clean = clean.replace(/\s+/g, " ").trim();

    if (isSecondDegree && !clean.includes("II st")) {
      clean += " (II st.)";
    }

    return {
      cleanName: clean || rawName,
      publishedAt,
      version,
      isSecondDegree
    };
  }

  function getShortPlanCode(planName, planObj = null) {
    if (!planName && !planObj) return "";
    const raw = planName || (planObj && planObj.name) || "";
    const prefixMatch = raw.match(/^\[([^\]]+)\]/);
    if (prefixMatch) {
      return prefixMatch[1].trim();
    }
    const info = parsePlanInfo(raw);
    const majorWords = info.cleanName
      .replace(/\bsem\.?\s*\d+.*$/i, "")
      .replace(/\([^)]*\)/g, "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    let major = "";
    if (majorWords.length === 1) {
      major = majorWords[0].slice(0, 3).toUpperCase();
    } else if (majorWords.length > 1) {
      major = majorWords
        .map((w) => (/^(i|w|z|na|do)$/i.test(w) ? w.toLowerCase() : w[0].toUpperCase()))
        .join("");
    } else if (planObj && planObj.faculty) {
      major = planObj.faculty;
    }

    const semMatch = raw.match(/sem\.?\s*(\d+)/i);
    const semNum = semMatch ? semMatch[1] : (planObj && planObj.semester_number ? String(planObj.semester_number) : "");
    const sem = semNum ? `Sem ${semNum}` : "";

    return [major, sem].filter(Boolean).join(" ");
  }

  function getPlanSortKey(planObj) {
    const name = (planObj && (planObj.clean_name || planObj.name)) || "";
    const planInfo = parsePlanInfo(name);
    const cleanName = planInfo.cleanName || name;

    const semMatch = cleanName.match(/\bsem\.?\s*(\d+)\b/i);
    const semNum = semMatch ? parseInt(semMatch[1], 10) : (planObj && planObj.semester_number ? Number(planObj.semester_number) : 0);

    const isSecondDegree = Boolean(planInfo.isSecondDegree || /\bII\s+st/i.test(cleanName) || /drugiego\s+stopnia/i.test(name));
    const degreeOrder = isSecondDegree ? 2 : 1;

    const major = cleanName
      .replace(/\bsem\.?\s*\d+\b/gi, "")
      .replace(/\(II\s+st\.?\)/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    return {
      major,
      degreeOrder,
      semNum,
      cleanName
    };
  }

  function comparePlans(planA, planB) {
    const keyA = getPlanSortKey(planA);
    const keyB = getPlanSortKey(planB);

    const majorCmp = keyA.major.localeCompare(keyB.major, "pl", { sensitivity: "base" });
    if (majorCmp !== 0) return majorCmp;

    if (keyA.degreeOrder !== keyB.degreeOrder) {
      return keyA.degreeOrder - keyB.degreeOrder;
    }

    if (keyA.semNum !== keyB.semNum) {
      return keyA.semNum - keyB.semNum;
    }

    const cleanCmp = keyA.cleanName.localeCompare(keyB.cleanName, "pl", { sensitivity: "base" });
    if (cleanCmp !== 0) return cleanCmp;

    const verA = planA.version || "";
    const verB = planB.version || "";
    return verA.localeCompare(verB, "pl", { numeric: true });
  }

  function getDuplicatePlanInfo(planId, state) {
    if (!planId || !state || !state.plansData || !state.plansData.plans || !state.plansData.plans[planId]) {
      return null;
    }

    const currentPlan = state.plansData.plans[planId];
    const currentInfo = parsePlanInfo(currentPlan.clean_name || currentPlan.name);
    const cleanName = currentInfo.cleanName;
    if (!cleanName) return null;

    if (state.dismissedDuplicatePlans && state.dismissedDuplicatePlans.has(cleanName)) {
      return null;
    }

    const currentMode = state.studyMode || "stacjonarne";
    const alternatives = [];

    for (const [id, plan] of Object.entries(state.plansData.plans)) {
      if (id === String(planId)) continue;
      const planMode = plan.mode || (plan.name && /niestacjonarne/i.test(plan.name) ? "niestacjonarne" : "stacjonarne");
      if (planMode !== currentMode) continue;

      const info = parsePlanInfo(plan.clean_name || plan.name);
      if (info.cleanName === cleanName) {
        alternatives.push({
          id,
          version: plan.version || info.version,
          publishedAt: plan.published_at || info.publishedAt,
          name: plan.name,
          cleanName: info.cleanName
        });
      }
    }

    if (alternatives.length === 0) return null;

    return {
      planId,
      cleanName,
      currentVersion: currentPlan.version || currentInfo.version,
      currentPublishedAt: currentPlan.published_at || currentInfo.publishedAt,
      alternatives
    };
  }

  function getPlanModificationInfo(planId, state) {
    if (!planId || !state || !state.plansData || !state.plansData.plans || !state.plansData.plans[planId]) {
      return null;
    }

    const plan = state.plansData.plans[planId];
    if (!plan.modification || !plan.modification.is_modifying) {
      return null;
    }

    const planInfo = parsePlanInfo(plan.clean_name || plan.name);
    const cleanName = planInfo.cleanName;
    if (!cleanName) return null;

    if (state.dismissedModificationPlans && state.dismissedModificationPlans.has(cleanName)) {
      return null;
    }

    return {
      planId,
      cleanName,
      currentVersion: plan.version || planInfo.version,
      draftVersion: plan.modification.draft_version,
      draftDate: plan.modification.draft_date
    };
  }

  return {
    DNI_TYGODNIA,
    DNI_MAP_SUNDAY_FIRST,
    DNI_PELNE,
    DNI_DOPELNIACZ,
    DNI_MIEJSCOWNIK,
    DNI_PRZYMIOTNIK,
    DNI_PRZYIMEK,
    loadDefaultCalendar,
    getTodayCode,
    formatDateISO,
    getMonday,
    getWeekMonday,
    getAcademicInfoForWeek,
    resolveInitialWeekOffset,
    normalizePlansData,
    parsePlanInfo,
    getShortPlanCode,
    getPlanSortKey,
    comparePlans,
    getDuplicatePlanInfo,
    getPlanModificationInfo
  };
});
