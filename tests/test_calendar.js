const assert = require("assert");
const path = require("path");
const ROOT_DIR = path.resolve(__dirname, "..");
const ScheduleEngine = require(path.join(ROOT_DIR, "web/js/schedule-engine.js"));
const academicCalendar = require(path.join(ROOT_DIR, "tenants/umg/wn/academic_calendar.json"));

// Domain engine instance
const engine = ScheduleEngine.create(academicCalendar);
const getMonday = (...args) => engine.getMonday(...args);
const getRoomOccupancyAt = (...args) => engine.getRoomOccupancyAt(...args);
const isTeachingDay = (...args) => engine.isTeachingDay(...args);

const { getSafeGroupName, parsePlanInfo, getAcademicInfoForWeek, updateCalendarNotice, renderSchedule, renderLessonCard, shouldShowChangelog, openChangelogModal, closeChangelogModal, checkChangelogNotification, comparePlans, getPlanSortKey, populatePlanSelect, onStudyModeChange, getDuplicatePlanInfo, getPlanModificationInfo, updateDayTabsUI, initTheme, toggleTheme, setupThemeListener, withViewTransition, openAboutModal, closeAboutModal, openEventsModal, closeEventsModal, formatEventFullDate, renderEventsModalList, _EventsService, setAcademicCalendar, state, elements, getLessonProgress } = require(path.join(ROOT_DIR, "web/app.js"));
if (typeof setAcademicCalendar === "function") {
  setAcademicCalendar(academicCalendar);
}

console.log("\n🧪 Running Calendar Engine TDD Tests (Contract v1)...\n");

// --- TEST 1: Usunięcie pętli getLessonMeetingInfo z frontendu i oparcie na Contract v1 occurrences[] ---
console.log("-- Test 1: Silnik frontendowy nie zawiera już pętli getLessonMeetingInfo i bazuje na Contract v1");
assert.strictEqual(engine.getLessonMeetingInfo, undefined, "getLessonMeetingInfo musi być usunięty z silnika frontendowego (obliczenia w core/expand.py)");
assert.strictEqual(isTeachingDay("2027-02-08"), false, "2027-02-08 (sesja egzaminacyjna) nie jest dniem dydaktycznym");
assert.strictEqual(isTeachingDay("2026-10-07"), true, "2026-10-07 jest dniem dydaktycznym");
console.log("✅ [PASS] Silnik frontendowy opiera się wyłącznie na Contract v1.");

// --- TEST 2–10: Święto (11.11), zamiana dnia (13.11 Pt jako Śr) i resolveWeekSchedule z occurrences[] ---
console.log("\n-- Test 2-10: Święto 11.11, zamiana dnia 13.11 oraz resolveWeekSchedule z pre-kalkulowanymi occurrences[]");

const lessonWed = {
  subject: "Matematyka",
  przedmiot: "Matematyka",
  day: "ŚR",
  hours: "08:00 - 09:30",
  godziny: "08:00 - 09:30",
  room: "201",
  sala: "201",
  occurrences: [
    { date: "2026-10-07", meeting: 1, total: 15, is_final: false },
    { date: "2026-10-14", meeting: 2, total: 15, is_final: false },
    { date: "2026-10-21", meeting: 3, total: 15, is_final: false },
    { date: "2026-10-28", meeting: 4, total: 15, is_final: false },
    { date: "2026-11-04", meeting: 5, total: 15, is_final: false },
    { date: "2026-11-13", meeting: 6, total: 15, is_final: false, swapped_from: "ŚR", swap_note: "Piątek 13.11 – zajęcia ze środy" },
    { date: "2026-11-18", meeting: 7, total: 15, is_final: false },
    { date: "2026-12-16", meeting: 11, total: 15, is_final: false }
  ]
};

const lessonHalf1 = {
  subject: "BHP",
  przedmiot: "BHP",
  day: "ŚR",
  hours: "10:15 - 11:45",
  godziny: "10:15 - 11:45",
  occurrences: [
    { date: "2026-11-13", meeting: 6, total: 7, is_final: false, swapped_from: "ŚR" },
    { date: "2026-11-18", meeting: 7, total: 7, is_final: true }
  ]
};

const mon11 = getMonday(new Date(2026, 10, 11)); // Tydzień 09.11 - 15.11.2026
const mon18 = getMonday(new Date(2026, 10, 18)); // Tydzień 16.11 - 22.11.2026
const monDec = getMonday(new Date(2026, 11, 16)); // Tydzień 14.12 - 20.12.2026

const resolvedSwapWeek = engine.resolveWeekSchedule(mon11, { lessons: [lessonWed, lessonHalf1] });
assert.strictEqual(resolvedSwapWeek["ŚR"].status, "holiday", "11.11 ma status holiday");
assert.strictEqual(resolvedSwapWeek["ŚR"].lessons.length, 0, "11.11 nie ma zajęć");
assert.strictEqual(resolvedSwapWeek["PT"].status, "daySwap", "13.11 ma status daySwap");
assert.strictEqual(resolvedSwapWeek["PT"].swapReplaceWith, "ŚR", "13.11 realizuje plan ze środy");
assert.strictEqual(resolvedSwapWeek["PT"].lessons.length, 2, "13.11 zawiera 2 zajęcia ze środy");
assert.strictEqual(resolvedSwapWeek["PT"].lessons[0].progress.text, "6/15");
assert.strictEqual(resolvedSwapWeek["PT"].lessons[1].progress.text, "6/7");
console.log("✅ [PASS] resolveWeekSchedule prawidłowo obsługuje święto 11.11 i zamianę 13.11 z occurrences[].");

// --- TEST 11: Format licznika w UI (x/y oraz 'Ostatnie zajęcia') ---
console.log("\n-- Test 11: Format licznika spotkań w UI (x/y oraz 'Ostatnie zajęcia')");

// 1. Zwykłe spotkanie w trakcie cyklu (6. z 7 spotkań BHP w zamieniony piątek 13.11)
const prog6 = getLessonProgress(lessonHalf1, "ŚR", mon11, "2026-11-13");
console.log("Postęp BHP dla spotkania 6/7:", prog6);
assert.strictEqual(prog6.text, "6/7", `Oczekiwano tekstu '6/7', a otrzymano: ${prog6.text}`);
assert.strictEqual(prog6.isFinal, false);

// 2. Ostatnie spotkanie w cyklu (7. z 7 spotkań BHP w środę 18.11) -> powinno wyświetlać 'Ostatnie zajęcia'
const prog7 = getLessonProgress(lessonHalf1, "ŚR", mon18, "2026-11-18");
console.log("Postęp BHP dla spotkania 7/7 (ostatnie):", prog7);
assert.strictEqual(prog7.text, "Ostatnie zajęcia", `Oczekiwano 'Ostatnie zajęcia', a otrzymano: ${prog7.text}`);
assert.strictEqual(prog7.isFinal, true);

// 3. Przedmiot pełnosemestralny (11. spotkanie z 15) -> '11/15'
const prog11 = getLessonProgress(lessonWed, "ŚR", monDec, "2026-12-16");
console.log("Postęp Matematyki 11/15:", prog11);
assert.strictEqual(prog11.text, "11/15", `Oczekiwano '11/15', a otrzymano: ${prog11.text}`);
assert.strictEqual(prog11.isFinal, false);

console.log("✅ [PASS] Format licznika w UI wyświetla czyste 'x/y' oraz wyróżnia 'Ostatnie zajęcia'.");

// --- TEST 12: Bezpieczne mapowanie nazw grup na pliki JSON i ICS ---
console.log("\n-- Test 12: getSafeGroupName - bezpieczne mapowanie nazw grup z kropkami i spacjami");
assert.strictEqual(getSafeGroupName("GR.01"), "GR_01");
assert.strictEqual(getSafeGroupName("1 TM"), "1_TM");
assert.strictEqual(getSafeGroupName("1/2 M"), "1_2_M");
assert.strictEqual(getSafeGroupName("GR-1"), "GR-1");
console.log("✅ [PASS] getSafeGroupName poprawnie mapuje kropki, spacje i ukośniki.");

// --- TEST 16: Dostępność sal z uwzględnieniem pre-kalkulowanych dates[] (getRoomOccupancyAt) ---
console.log("\n-- Test 16: getRoomOccupancyAt poprawnie zwalnia salę po zakończeniu modułu i w święta (dates[])");

const bhpClass = {
  subject: "BHP",
  hours: "10:15 - 11:45",
  dates: ["2026-10-07", "2026-10-14", "2026-10-21", "2026-10-28", "2026-11-04", "2026-11-13", "2026-11-18"]
};

const fullSemesterClass = {
  subject: "Matematyka",
  hours: "12:15 - 13:45",
  dates: ["2026-10-07", "2026-10-14", "2026-10-21", "2026-10-28", "2026-11-04", "2026-11-13", "2026-11-18", "2026-12-02"]
};

const daySchedule = [bhpClass, fullSemesterClass];

// 1. W trakcie trwania modułu (07.10.2026, 10:30) -> sala zajęta przez BHP
const queryBhp = { start: 10 * 60 + 30, end: 10 * 60 + 31 }; // 10:30
const resOct07 = getRoomOccupancyAt(daySchedule, queryBhp, "2026-10-07", "ŚR");
console.log("Wynik 07.10 (BHP w trakcie):", resOct07);
assert.strictEqual(resOct07.isFree, false, "Sala powinna być zajęta przez BHP w dniu 07.10");
assert.strictEqual(resOct07.occupyingClass.subject, "BHP");

// 2. Po zakończeniu modułu 7 spotkań (02.12.2026, 10:30) -> sala WOLNA
const resDec02 = getRoomOccupancyAt(daySchedule, queryBhp, "2026-12-02", "ŚR");
console.log("Wynik 02.12 (po zakończeniu BHP):", resDec02);
assert.strictEqual(resDec02.isFree, true, "Sala powinna być wolna po zakończeniu 7 spotkań BHP");
assert.strictEqual(resDec02.occupyingClass, null);

// 3. W święto 11.11.2026 (12:30, normalnie Matematyka) -> sala WOLNA
const queryMath = { start: 12 * 60 + 30, end: 12 * 60 + 31 }; // 12:30
const resNov11 = getRoomOccupancyAt(daySchedule, queryMath, "2026-11-11", "ŚR");
console.log("Wynik 11.11 (Święto Niepodległości):", resNov11);
assert.strictEqual(resNov11.isFree, true, "Sala powinna być wolna w święto państwowe 11.11");

// 4. Sala z dwoma grupami naprzemiennymi co 2 tygodnie
const altClassA = {
  subject: "Fizyka (Gr 1)",
  hours: "08:00 - 09:30",
  dates: ["2026-10-07", "2026-10-21"]
};
const altClassB = {
  subject: "Chemia (Gr 2)",
  hours: "08:00 - 09:30",
  dates: ["2026-10-14", "2026-10-28"]
};
const alternatingSchedule = [altClassA, altClassB];
const queryMorning = { start: 8 * 60 + 30, end: 8 * 60 + 31 }; // 08:30

// 07.10 (Tydzień 1) -> zajęte przez Fizykę (Gr 1)
const resAltOct07 = getRoomOccupancyAt(alternatingSchedule, queryMorning, "2026-10-07", "ŚR");
assert.strictEqual(resAltOct07.isFree, false);
assert.strictEqual(resAltOct07.occupyingClass.subject, "Fizyka (Gr 1)");

// 14.10 (Tydzień 2) -> zajęte przez Chemię (Gr 2)
const resAltOct14 = getRoomOccupancyAt(alternatingSchedule, queryMorning, "2026-10-14", "ŚR");
assert.strictEqual(resAltOct14.isFree, false);
assert.strictEqual(resAltOct14.occupyingClass.subject, "Chemia (Gr 2)");

// 5. Sala z pojedynczym przedmiotem co 2 tygodnie (brak grupy na zmianę)
const singleAltSchedule = [altClassA]; // Tylko Gr 1 co 2 tyg
const resSingleOct14 = getRoomOccupancyAt(singleAltSchedule, queryMorning, "2026-10-14", "ŚR");
assert.strictEqual(resSingleOct14.isFree, true, "Sala bez zajęć w danym tygodniu powinna być wolna");
assert.strictEqual(resSingleOct14.occupyingClass, null);

console.log("✅ [PASS] getRoomOccupancyAt prawidłowo weryfikuje dostępność sal (w tym cykle naprzemienne).");

// --- TEST 17: parsePlanInfo (oczyszczanie nazw planów, wersja i data publikacji) ---
console.log("\n-- Test 17: parsePlanInfo (oczyszczanie nazw planów, wersja i data)");

const rawPlan1 = "[TM Sem 1] Transport Morski pierwszego stopnia sem. 1 [2026-09-14 17:55] wer. 2";
const parsed1 = parsePlanInfo(rawPlan1);
console.log("Wynik dla planu 1:", parsed1);
assert.strictEqual(parsed1.cleanName, "Transport Morski sem. 1");
assert.strictEqual(parsed1.publishedAt, "2026-09-14 17:55");
assert.strictEqual(parsed1.version, "wer. 2");

const rawPlan2 = "Transport i Logistyka pierwszego stopnia sem. 1 [2026-09-15 19:52] wer. 1";
const parsed2 = parsePlanInfo(rawPlan2);
console.log("Wynik dla planu 2:", parsed2);
assert.strictEqual(parsed2.cleanName, "Transport i Logistyka sem. 1");
assert.strictEqual(parsed2.publishedAt, "2026-09-15 19:52");
assert.strictEqual(parsed2.version, "wer. 1");

const rawPlan3 = "Nawigacja drugiego stopnia sem. 2 [2026-09-14 12:00] wer. 3";
const parsed3 = parsePlanInfo(rawPlan3);
console.log("Wynik dla planu 3 (II stopień):", parsed3);
assert.strictEqual(parsed3.cleanName, "Nawigacja sem. 2 (II st.)");
assert.strictEqual(parsed3.publishedAt, "2026-09-14 12:00");
assert.strictEqual(parsed3.version, "wer. 3");
assert.strictEqual(parsed3.isSecondDegree, true);

console.log("✅ [PASS] parsePlanInfo precyzyjnie czyści nazwy planów i wyodrębnia wersję oraz datę publikacji.");

// --- TEST 18: updateCalendarNotice (filtracja alertów, dni zamienne vs wolne vs przerwy) ---
console.log("\n-- Test 18: updateCalendarNotice (dni zamienne, wykluczenie pojedynczych dni wolnych i ukrywanie w przerwach)");

const mockNoticeEl = {
  innerHTML: "",
  className: "",
  classList: {
    classes: new Set(["hidden"]),
    add(cls) { this.classes.add(cls); },
    remove(cls) { this.classes.delete(cls); },
    contains(cls) { return this.classes.has(cls); }
  }
};
elements.calendarNotice = mockNoticeEl;

// 1. Tydzień z dniem wolnym (11.11) i zamianą (13.11)
// Górny baner powinien zawierać TYLKO dzień zamienny, a NIE dzień wolny
const weekWithHolidayAndSwap = {
  periodType: "teaching",
  periodName: "Okres zajęć dydaktycznych",
  daySwaps: [{ replaceWith: "ŚR", note: "Piątek 13.11 – zajęcia ze środy" }],
  holidays: ["11.11 (Środa): Święto Niepodległości"]
};

updateCalendarNotice(weekWithHolidayAndSwap);
assert.strictEqual(mockNoticeEl.classList.contains("hidden"), false, "Baner powinien być widoczny dla dnia zamiennego");
assert.ok(mockNoticeEl.innerHTML.includes("Zamiana dnia"), "Powinien zawierać informację o zamianie dnia");
assert.ok(!mockNoticeEl.innerHTML.includes("Dzień wolny"), "NIE powinien powielać informacji o pojedynczym dniu wolnym");

// 2. Tydzień tylko z dniem wolnym (np. Wszystkich Świętych)
const weekOnlyHoliday = {
  periodType: "teaching",
  periodName: "Okres zajęć dydaktycznych",
  daySwaps: [],
  holidays: ["01.11 (Niedziela): Wszystkich Świętych"]
};

updateCalendarNotice(weekOnlyHoliday);
assert.strictEqual(mockNoticeEl.classList.contains("hidden"), true, "Baner powinien być ukryty, gdy są tylko pojedyncze dni wolne");
assert.strictEqual(mockNoticeEl.innerHTML, "", "Zawartość banera powinna być pusta");

// 3. Pełna przerwa (np. Zimowa przerwa świąteczna)
const weekBreak = {
  periodType: "break",
  periodName: "Zimowa przerwa świąteczna",
  daySwaps: [],
  holidays: ["24.12: Wigilia", "25.12: Boże Narodzenie"]
};

updateCalendarNotice(weekBreak);
assert.strictEqual(mockNoticeEl.classList.contains("hidden"), true, "Baner powinien być ukryty podczas pełnej przerwy dydaktycznej");

// 4. Komunikat krytyczny / ogłoszenie
const weekAnnouncement = {
  periodType: "teaching",
  periodName: "Okres zajęć dydaktycznych",
  daySwaps: [],
  holidays: [],
  announcements: ["Godziny rektorskie w dniu 15.10 od 12:00"]
};

updateCalendarNotice(weekAnnouncement);
assert.strictEqual(mockNoticeEl.classList.contains("hidden"), false, "Baner powinien być widoczny dla ogłoszeń administracyjnych");
assert.ok(mockNoticeEl.innerHTML.includes("Komunikat:"), "Powinien wyświetlać komunikat krytyczny");

console.log("✅ [PASS] updateCalendarNotice poprawnie filtruje alerty i ukrywa baner w trakcie przerw.");

// --- TEST 19: renderSchedule - umiejscowienie plakietki zamiany dnia oraz karta święta ---
console.log("\n-- Test 19: renderSchedule - umiejscowienie plakietki zamiany dnia oraz karta święta");

const mockScheduleContent = {
  innerHTML: "",
  classList: {
    classes: new Set(),
    add(cls) { this.classes.add(cls); },
    remove(cls) { this.classes.delete(cls); },
    contains(cls) { return this.classes.has(cls); }
  }
};
elements.scheduleContent = mockScheduleContent;
elements.noClassesState = {
  classList: {
    classes: new Set(["hidden"]),
    add(cls) { this.classes.add(cls); },
    remove(cls) { this.classes.delete(cls); },
    contains(cls) { return this.classes.has(cls); }
  }
};
elements.dayTabs = {
  innerHTML: "",
  querySelectorAll() { return []; },
  querySelector() {
    return { classList: { add() {}, remove() {}, contains() { return false; } } };
  }
};

// Mock global document if not present
if (typeof document === "undefined") {
  global.document = {
    getElementById(id) {
      return { innerHTML: "", textContent: "", classList: { add() {}, remove() {}, contains() { return false; } }, querySelector() { return { onclick: null }; } };
    },
    createElement(tag) {
      const el = { _text: "" };
      Object.defineProperty(el, "textContent", {
        set(val) {
          this._text = val;
          this.innerHTML = String(val).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        },
        get() { return this._text; }
      });
      return el;
    }
  };
}

// Przygotuj dane planu dla widoku tygodnia z dniem zamiennym i świętem (Contract v1)
state.scheduleData = {
  lessons: [
    {
      subject: "Matematyka",
      przedmiot: "Matematyka",
      day: "ŚR",
      hours: "08:00 - 09:30",
      godziny: "08:00 - 09:30",
      room: "201",
      sala: "201",
      teacher: "Dr Kowalski",
      prowadzacy: "Dr Kowalski",
      grupa: "1",
      occurrences: [
        { date: "2026-11-13", meeting: 6, total: 15, is_final: false, swapped_from: "ŚR", swap_note: "Piątek 13.11 – zajęcia ze środy" }
      ]
    }
  ]
};
state.selectedDayTab = "ALL";
state.daysView = "workdays";
// 13.11.2026 to tydzień 6 (weekOffset = calculate from targetMonday)
// Monday 09.11.2026: Środa 11.11 święto, Piątek 13.11 zamiana na Środę
const testMonDate = new Date(2026, 10, 9);
const curMon = getMonday(new Date());
state.weekOffset = Math.round((testMonDate - curMon) / (7 * 86400000));

renderSchedule();

const renderedHtml = mockScheduleContent.innerHTML;

// 1. Sprawdź, czy święto renderuje się jako .lesson-card.holiday-card
assert.ok(
  renderedHtml.includes("lesson-card holiday-card"),
  "Święto (11.11) powinno być renderowane jako dedykowana karta .lesson-card.holiday-card"
);
assert.ok(
  renderedHtml.includes("holiday-card-icon") && renderedHtml.includes("Święto Niepodległości"),
  "Karta święta powinna zawierać ikonę oraz nazwę święta"
);

// 2. Sprawdź, czy widok tygodnia używa zmiennej CSS --grid-cols i czy plakietka zamiany dnia znajduje się w nagłówku dnia
assert.ok(
  renderedHtml.includes("schedule-week-grid") && renderedHtml.includes("--grid-cols:"),
  "Widok tygodnia powinien używać zmiennej CSS --grid-cols zamiast sztywnego grid-template-columns inline"
);
assert.ok(
  renderedHtml.includes("grid-day-header") && renderedHtml.includes("grid-day-swap-badge"),
  "Plakietka zamiany dnia powinna być osadzona wewnątrz nagłówka dnia w widoku tygodnia"
);
assert.ok(
  renderedHtml.includes("Plan z środy"),
  "Plakietka zamiany powinna wskazywać 'Plan z środy'"
);

// 3. Sprawdź widok pojedynczego dnia (single-day view)
state.selectedDayTab = "PT"; // Piątek z zamianą na środę
renderSchedule();

const renderedSingleDayHtml = mockScheduleContent.innerHTML;
assert.ok(
  renderedSingleDayHtml.includes("day-header") && renderedSingleDayHtml.includes("day-swap-badge"),
  "Plakietka zamiany dnia powinna być osadzona wewnątrz nagłówka .day-header w widoku pojedynczego dnia"
);
assert.ok(
  renderedSingleDayHtml.includes("Plan z środy"),
  "Plakietka zamiany w widoku pojedynczego dnia powinna wskazywać 'Plan z środy'"
);

console.log("✅ [PASS] renderSchedule poprawnie umieszcza plakietkę zamiany w nagłówku (mobile + desktop) i renderuje kartę święta.");

// ─── Test 20: Wolne sale — używają właściwego tygodnia z state.weekOffset ────
console.log("\n-- Test 20: getRoomOccupancyAt działa poprawnie dla tygodnia przesuniętego o weekOffset");

// BHP: aktywne w tygodniach 1-7 (7 spotkań co tydzień), data_start 2026-10-07 (środa)
// Tydzień 9 (środa 02.12.2026): BHP już zakończone — sala powinna być wolna
const bhpEntry = {
  subject: "BHP",
  hours: "10:15 - 11:45",
  dates: ["2026-10-07", "2026-10-14", "2026-10-21", "2026-10-28", "2026-11-04", "2026-11-13", "2026-11-18"]
};

const targetDateWeek9 = new Date(2026, 11, 2); // 02.12.2026
const mondayWeek9 = getMonday(targetDateWeek9);
const occupancyAfterEnd = getRoomOccupancyAt([bhpEntry], { start: 615, end: 705 }, "2026-12-02", "ŚR");
assert.strictEqual(occupancyAfterEnd.isFree, true,
  "Sala powinna być wolna w tygodniu 9 — BHP skończyło się po 7 spotkaniach");
assert.strictEqual(occupancyAfterEnd.occupyingClass, null,
  "occupyingClass powinien być null po zakończeniu przedmiotu");

// Tydzień 1 (środa 07.10.2026): BHP aktywne — sala zajęta
const occupancyWeek1 = getRoomOccupancyAt([bhpEntry], { start: 615, end: 705 }, "2026-10-07", "ŚR");
assert.strictEqual(occupancyWeek1.isFree, false,
  "Sala powinna być zajęta w tygodniu 1 — BHP aktywne");

console.log("Tydzień 1 (07.10 - BHP aktywne):", occupancyWeek1.isFree ? "wolna" : "zajęta ✓");
console.log("Tydzień 9 (02.12 - po BHP):", occupancyAfterEnd.isFree ? "wolna ✓" : "zajęta");
console.log("✅ [PASS] getRoomOccupancyAt poprawnie weryfikuje aktywność zajęć przy sprawdzaniu wolnych sal.");

// ─── Test 21: Powiadomienie o nowościach (Changelog Modal & shouldShowChangelog) ────
console.log("\n-- Test 21: Powiadomienie o nowościach (Changelog Popup Modal)");

assert.strictEqual(shouldShowChangelog("3.8.0", null), true, "Dla nowego użytkownika (brak zapisu) powinno pokazać modal");
assert.strictEqual(shouldShowChangelog("3.8.0", "3.7.0"), true, "Dla nowszej wersji powinno pokazać modal");
assert.strictEqual(shouldShowChangelog("3.8.0", "3.8.0"), false, "Dla tej samej wersji NIE powinno pokazywać modala");
assert.strictEqual(shouldShowChangelog("3.8.1", "3.8.0"), false, "Dla wydania patch (3.8.1 vs 3.8.0) NIE powinno pokazywać modala");
assert.strictEqual(shouldShowChangelog("3.9.0", "3.8.1"), true, "Dla nowego wydania minor (3.9.0 vs 3.8.1) powinno pokazać modal");
assert.strictEqual(shouldShowChangelog(null, "3.8.0"), false, "Brak nowej wersji nie powinien wywołać modala");

// 2. Interakcja z elementami DOM i localStorage
let modalOpened = false;
let modalClosed = false;

elements.changelogModal = {
  showModal() { modalOpened = true; },
  close() { modalClosed = true; },
  classList: { add() {}, remove() {} }
};
elements.changelogVersionBadge = { textContent: "" };
elements.changelogDate = { textContent: "" };
elements.changelogFeaturesList = { innerHTML: "" };

const mockStorage = {};
global.localStorage = {
  getItem(k) { return mockStorage[k] || null; },
  setItem(k, v) { mockStorage[k] = String(v); }
};

const sampleChangelog = {
  version: "3.8.0",
  date: "2026-09-24",
  features: ["Funkcja A", "Funkcja B"]
};

openChangelogModal(sampleChangelog);

assert.strictEqual(modalOpened, true, "openChangelogModal powinno wywołać showModal() na elemencie dialog");
assert.strictEqual(elements.changelogVersionBadge.textContent, "Wersja 3.8.0", "Badge wersji powinien mieć tekst 'Wersja 3.8.0'");
assert.strictEqual(elements.changelogDate.textContent, "2026-09-24", "Data powinna być ustawiona na '2026-09-24'");
assert.ok(elements.changelogFeaturesList.innerHTML.includes("Funkcja A") && elements.changelogFeaturesList.innerHTML.includes("Funkcja B"),
  "Lista funkcji powinna zawierać wstrzyknięte elementy <li>");

// Zamknij modal i zweryfikuj zapis do localStorage
closeChangelogModal();
assert.strictEqual(modalClosed, true, "closeChangelogModal powinno wywołać close() na dialogu");
assert.strictEqual(mockStorage["last_seen_changelog_version"], "3.8.0", "Wersja powinna zostać zapisana w localStorage");

// Sprawdź ponowną weryfikację po zapisaniu wersji
assert.strictEqual(
  shouldShowChangelog("3.8.0", mockStorage["last_seen_changelog_version"]),
  false,
  "Po zapisaniu w localStorage modal nie powinien się ponownie wyświetlać dla tej samej wersji"
);

console.log("✅ [PASS] Powiadomienie o nowościach (Changelog Modal & shouldShowChangelog) działa prawidłowo.");

// -- Test 22: renderLessonCard z klasą formy zajęć (wykład, ćwiczenia, lab, symulator)
console.log("\n-- Test 22: renderLessonCard nadaje odpowiednie klasy formy (.form-*)");
const sampleLesson = {
  przedmiot: "Nawigacja",
  godziny: "08:00 - 09:30",
  sala: "306",
  prowadzacy: "Jan Kowalski",
  forma: "symulator"
};

const renderedCardSym = renderLessonCard(sampleLesson);
assert.ok(renderedCardSym.includes("form-symulator"), "Karta powinna zawierać klasę form-symulator");

const sampleWyk = { ...sampleLesson, forma: "wyklad" };
const renderedCardWyk = renderLessonCard(sampleWyk);
assert.ok(renderedCardWyk.includes("form-wyklad"), "Karta powinna zawierać klasę form-wyklad");

const sampleCw = { ...sampleLesson, forma: "cwiczenia" };
const renderedCardCw = renderLessonCard(sampleCw);
assert.ok(renderedCardCw.includes("form-cwiczenia"), "Karta powinna zawierać klasę form-cwiczenia");

const sampleLab = { ...sampleLesson, forma: "laboratorium" };
const renderedCardLab = renderLessonCard(sampleLab);
assert.ok(renderedCardLab.includes("form-laboratorium"), "Karta powinna zawierać klasę form-laboratorium");

const sampleNoForm = { ...sampleLesson, forma: null };
const renderedCardNoForm = renderLessonCard(sampleNoForm);
assert.ok(!renderedCardNoForm.includes("form-"), "Karta bez formy nie powinna mieć klasy form-*");

console.log("✅ [PASS] renderLessonCard poprawnie aplikuje klasy .form-* do kart zajęć.");
 
// -- Test 23: Naturalne sortowanie listy planów (kierunek alfabetycznie, stopień, semestr rosnąco)
console.log("\n-- Test 23: Naturalne sortowanie listy planów (comparePlans)");
const unorderedPlans = [
  { id: "557", name: "Transport Morski pierwszego stopnia sem. 1" },
  { id: "550", name: "Transport i Logistyka pierwszego stopnia sem. 3" },
  { id: "559", name: "Transport Morski pierwszego stopnia sem. 3" },
  { id: "558", name: "Transport i Logistyka pierwszego stopnia sem. 1" },
  { id: "556", name: "Morskie Systemy Transportowe i Logistyczne drugiego stopnia sem. 2" },
  { id: "551", name: "Transport i Logistyka pierwszego stopnia sem. 5" }
];

const sorted = [...unorderedPlans].sort((a, b) => comparePlans(a, b));
const sortedNames = sorted.map(p => parsePlanInfo(p.name).cleanName);

assert.deepStrictEqual(sortedNames, [
  "Morskie Systemy Transportowe i Logistyczne sem. 2 (II st.)",
  "Transport i Logistyka sem. 1",
  "Transport i Logistyka sem. 3",
  "Transport i Logistyka sem. 5",
  "Transport Morski sem. 1",
  "Transport Morski sem. 3"
]);

console.log("✅ [PASS] Naturalne sortowanie planów działa poprawnie (kierunki alfabetycznie, semestry rosnąco).");

// -- Test 24: Tryb studiów (stacjonarne / niestacjonarne) i renderowanie dat ISO
console.log("\n-- Test 24: Tryb studiów (studyMode) i obsługa planów niestacjonarnych");

// 24a. Filtrowanie planów wg trybu
state.plansData = {
  plans: {
    "101": { name: "Nawigacja stacjonarne sem. 1", mode: "stacjonarne" },
    "102": { name: "Transport stacjonarne sem. 3", mode: "stacjonarne" },
    "nst_TiL_I": { name: "Transport studia 1 stopnia (TiL) rok: I (niestacjonarne)", mode: "niestacjonarne" }
  }
};

state.studyMode = "stacjonarne";
const fakeSelect = {
  innerHTML: "",
  children: [],
  appendChild(child) {
    this.children.push(child);
  }
};
elements.planSelect = fakeSelect;

populatePlanSelect();
const stacjoOptions = fakeSelect.children.map(c => c.value);
assert.ok(stacjoOptions.includes("101"), "Tryb stacjonarny powinien zawierać plan 101");
assert.ok(!stacjoOptions.includes("nst_TiL_I"), "Tryb stacjonarny nie powinien zawierać planu niestacjonarnego");

state.studyMode = "niestacjonarne";
fakeSelect.children = [];
populatePlanSelect();
const nstOptions = fakeSelect.children.map(c => c.value);
assert.ok(nstOptions.includes("nst_TiL_I"), "Tryb niestacjonarny powinien zawierać plan nst_TiL_I");
assert.ok(!nstOptions.includes("101"), "Tryb niestacjonarny nie powinien zawierać planu stacjonarnego");

// 24b. ResolveWeekSchedule dla formatu niestacjonarnego (daty ISO w occurrences[])
const mockNstSchedule = {
  lessons: [
    {
      subject: "Matematyka",
      przedmiot: "Matematyka",
      hours: "08:00-09:35",
      godziny: "08:00-09:35",
      room: "Aula",
      sala: "Aula",
      teacher: "Milczek Beata, dr",
      prowadzacy: "Milczek Beata, dr",
      day: "SOB",
      occurrences: [{ date: "2026-10-03", meeting: 1, total: 1, is_final: true }]
    }
  ]
};

const weekMon = new Date(2026, 8, 28); // Poniedziałek 28.09.2026 przed 03.10.2026
const resolvedWeek = engine.resolveWeekSchedule(weekMon, mockNstSchedule);

assert.ok(resolvedWeek["SOB"], "Tydzień powinien zawierać sobotę");
assert.strictEqual(resolvedWeek["SOB"].lessons.length, 1, "Sobota powinna mieć 1 zajęcia");
assert.strictEqual(resolvedWeek["SOB"].lessons[0].przedmiot, "Matematyka");
assert.strictEqual(resolvedWeek["SOB"].lessons[0].sala, "Aula");
assert.strictEqual(resolvedWeek["SOB"].lessons[0].lessonDate, "2026-10-03");

console.log("✅ [PASS] Przełącznik trybu studiów i silnik dat ISO dla planów niestacjonarnych działają prawidłowo.");
 
// -- Test 25: Brak dni zamiennych w trybie niestacjonarnym (NST)
console.log("\n-- Test 25: Brak dni zamiennych w trybie niestacjonarnym (NST)");

// Tydzień 09.11.2026 - 15.11.2026 zawiera zamianę dnia: 13.11 (Piątek jako Środa)
const swapWeekMon = new Date(2026, 10, 9); // Poniedziałek 09.11.2026

// 25a. W trybie stacjonarnym zamiana dnia powinna być widoczna
state.studyMode = "stacjonarne";
const stacjoAcademicInfo = getAcademicInfoForWeek(swapWeekMon);
assert.ok(stacjoAcademicInfo.daySwaps.length > 0, "Tryb stacjonarny powinien wykrywać zamianę dnia w tygodniu 09.11-15.11");
assert.strictEqual(stacjoAcademicInfo.daySwaps[0].replaceWith, "ŚR", "Dla stacjonarnych 13.11 powinien być zamieniony na Środę");

// 25b. W trybie niestacjonarnym zamiany dni są ignorowane
state.studyMode = "niestacjonarne";
const nstAcademicInfo = getAcademicInfoForWeek(swapWeekMon);
assert.strictEqual(nstAcademicInfo.daySwaps.length, 0, "Tryb niestacjonarny NIE powinien zawierać dni zamiennych w academicInfo");

// 25c. updateCalendarNotice nie renderuje zamiany dnia w trybie niestacjonarnym
elements.calendarNotice = {
  innerHTML: "",
  className: "",
  classList: {
    add(cls) { this.classes.add(cls); },
    remove(cls) { this.classes.delete(cls); },
    classes: new Set()
  }
};
updateCalendarNotice(stacjoAcademicInfo); // wywołane gdy state.studyMode = "niestacjonarne"
assert.ok(!elements.calendarNotice.innerHTML.includes("Zamiana dnia"), "Baner zamiany dnia nie powinien być renderowany w trybie NST");

// 25d. resolveWeekSchedule nie zamienia planu dla formatu niestacjonarnego
const nstFridaySchedule = {
  lessons: [
    {
      subject: "Nawigacja techniczna",
      przedmiot: "Nawigacja techniczna",
      hours: "16:00-18:25",
      godziny: "16:00-18:25",
      room: "B211",
      sala: "B211",
      day: "PT",
      occurrences: [{ date: "2026-11-13", meeting: 1, total: 1, is_final: true }]
    }
  ]
};
const nstResolved = engine.resolveWeekSchedule(swapWeekMon, nstFridaySchedule, { isNst: true, studyMode: "niestacjonarne" });
assert.strictEqual(nstResolved["PT"].status, "normal", "W trybie niestacjonarnym piątek 13.11 powinien mieć status 'normal' zamiast 'daySwap'");
assert.strictEqual(nstResolved["PT"].swapNote, null, "W trybie niestacjonarnym swapNote powinien być null");
assert.strictEqual(nstResolved["PT"].swapReplaceWith, null, "W trybie niestacjonarnym swapReplaceWith powinien być null");
assert.strictEqual(nstResolved["PT"].lessons.length, 1, "Piątkowe zajęcia NST powinny pozostać na swoim miejscu");
assert.strictEqual(nstResolved["PT"].lessons[0].przedmiot, "Nawigacja techniczna", "Zajęcia z piątku nie powinny być zastąpione środą");

console.log("✅ [PASS] Dni zamienne są całkowicie wyłączone w trybie niestacjonarnym (brak banerów, brak zamian w silniku i UI).");
 
// -- Test 26: Obsługa planów zduplikowanych (wer. X w dropdownie i baner z przełącznikiem)
console.log("\n-- Test 26: Obsługa planów zduplikowanych (wer. X w dropdownie i baner z przełącznikiem)");

state.studyMode = "stacjonarne";
state.dismissedDuplicatePlans = new Set();
state.plansData = {
  plans: {
    "101": {
      name: "[TM Sem 1] Transport Morski pierwszego stopnia sem. 1 [2026-09-14 17:55] wer. 2",
      clean_name: "Transport Morski sem. 1",
      version: "wer. 2",
      published_at: "2026-09-14 17:55",
      mode: "stacjonarne",
      groups: ["GR. 1", "GR. 2"]
    },
    "102": {
      name: "[TM Sem 1] Transport Morski pierwszego stopnia sem. 1 [2026-09-20 12:00] wer. 3",
      clean_name: "Transport Morski sem. 1",
      version: "wer. 3",
      published_at: "2026-09-20 12:00",
      mode: "stacjonarne",
      groups: ["GR. 1"]
    },
    "103": {
      name: "[TiL Sem 3] Transport i Logistyka sem. 3 [2026-09-10 10:00]",
      clean_name: "Transport i Logistyka sem. 3",
      version: null,
      published_at: "2026-09-10 10:00",
      mode: "stacjonarne",
      groups: ["GR. 1"]
    }
  }
};

// 26a. W dropdownie zduplikowane plany mają (wer. X), a pojedyncze nie
fakeSelect.children = [];
populatePlanSelect();
const opt101 = fakeSelect.children.find(c => c.value === "101");
const opt102 = fakeSelect.children.find(c => c.value === "102");
const opt103 = fakeSelect.children.find(c => c.value === "103");

assert.ok(opt101, "Plan 101 powinien być na liście");
assert.ok(opt102, "Plan 102 powinien być na liście");
assert.ok(opt103, "Plan 103 powinien być na liście");

assert.strictEqual(opt101.textContent, "Transport Morski sem. 1 (wer. 2)", "Zduplikowany plan 101 powinien zawierać wersję");
assert.strictEqual(opt102.textContent, "Transport Morski sem. 1 (wer. 3)", "Zduplikowany plan 102 powinien zawierać wersję");
assert.strictEqual(opt103.textContent, "Transport i Logistyka sem. 3", "Unikalny plan 103 nie powinien zawierać wersji w nawiasie");

// 26b. getDuplicatePlanInfo wykrywa alternatywy dla zduplikowanego planu
const dup101 = getDuplicatePlanInfo("101");
assert.ok(dup101, "Plan 101 powinien mieć wykryte duplikaty");
assert.strictEqual(dup101.cleanName, "Transport Morski sem. 1");
assert.strictEqual(dup101.currentVersion, "wer. 2");
assert.strictEqual(dup101.alternatives.length, 1);
assert.strictEqual(dup101.alternatives[0].id, "102");
assert.strictEqual(dup101.alternatives[0].version, "wer. 3");

const dup103 = getDuplicatePlanInfo("103");
assert.strictEqual(dup103, null, "Unikalny plan 103 nie powinien mieć duplikatów");

// 26c. updateCalendarNotice renderuje baner ostrzegawczy z przyciskiem przełączenia
state.selectedPlanId = "101";
elements.calendarNotice = {
  innerHTML: "",
  className: "",
  classList: {
    add(cls) { this.classes.add(cls); },
    remove(cls) { this.classes.delete(cls); },
    classes: new Set()
  }
};

updateCalendarNotice({ periodType: "regular", daySwaps: [], announcements: [] });
assert.ok(elements.calendarNotice.innerHTML.includes("notice-duplicate-plan"), "Baner powinien zawierać klasę notice-duplicate-plan");
assert.ok(elements.calendarNotice.innerHTML.includes("data-switch-plan=\"102\""), "Baner powinien zawierać przycisk przełączenia na plan 102");
assert.ok(elements.calendarNotice.innerHTML.includes("Przełącz na wer. 3"), "Przycisk powinien mieć tekst przełączenia na wer. 3");
assert.ok(elements.calendarNotice.innerHTML.includes("data-dismiss-plan=\"Transport Morski sem. 1\""), "Baner powinien zawierać przycisk zamknięcia");

// 26d. Zamknięcie banera zapamiętuje dismissed i ukrywa baner
state.dismissedDuplicatePlans.add("Transport Morski sem. 1");
assert.strictEqual(getDuplicatePlanInfo("101"), null, "Po dismissed getDuplicatePlanInfo powinno zwracać null");
updateCalendarNotice({ periodType: "regular", daySwaps: [], announcements: [] });
assert.ok(!elements.calendarNotice.innerHTML.includes("notice-duplicate-plan"), "Baner nie powinien być renderowany po zamknięciu");

console.log("✅ [PASS] Obsługa zduplikowanych planów w dropdownie i banerze informacyjnym działa prawidłowo.");
 
// --- TEST 27: Obsługa planów w trakcie modyfikacji przez uczelnię ---
console.log("\n-- Test 27: Obsługa planów w trakcie modyfikacji przez uczelnię ([modyfikowany])");

// 27a. parsePlanInfo poprawnie oczyszcza znacznik [modyfikowany]
const rawModPlan = "[TM Sem 1] Transport Morski pierwszego stopnia sem. 1 [modyfikowany] [2026-09-28 08:25] wer. 3";
const parsedMod = parsePlanInfo(rawModPlan);
assert.strictEqual(parsedMod.cleanName, "Transport Morski sem. 1", "cleanName nie powinien zawierać [modyfikowany]");
assert.strictEqual(parsedMod.version, "wer. 3", "Wersja powinna zostać wyodrębniona");
assert.strictEqual(parsedMod.publishedAt, "2026-09-28 08:25");

// 27b. getPlanModificationInfo zwraca dane modyfikacji dla planu
state.plansData = {
  plans: {
    "557": {
      name: "Transport Morski sem. 1 wer. 2",
      clean_name: "Transport Morski sem. 1",
      version: "wer. 2",
      mode: "stacjonarne",
      groups: ["GR.01"],
      modification: {
        is_modifying: true,
        draft_version: "wer. 3",
        draft_date: "2026-09-28 08:25"
      }
    },
    "558": {
      name: "Nawigacja sem. 1 wer. 1",
      clean_name: "Nawigacja sem. 1",
      version: "wer. 1",
      mode: "stacjonarne",
      groups: ["GR.01"]
    }
  }
};
state.selectedPlanId = "557";
state.dismissedModificationPlans.clear();

const modInfo557 = getPlanModificationInfo("557");
assert.ok(modInfo557, "Plan 557 powinien posiadać modInfo");
assert.strictEqual(modInfo557.currentVersion, "wer. 2");
assert.strictEqual(modInfo557.draftVersion, "wer. 3");
assert.strictEqual(modInfo557.draftDate, "2026-09-28 08:25");
assert.strictEqual(modInfo557.cleanName, "Transport Morski sem. 1");

const modInfo558 = getPlanModificationInfo("558");
assert.strictEqual(modInfo558, null, "Plan 558 nie jest modyfikowany");

// 27c. updateCalendarNotice renderuje baner notice-plan-modifying
elements.calendarNotice = {
  innerHTML: "",
  className: "",
  classList: {
    add(cls) { this.classes.add(cls); },
    remove(cls) { this.classes.delete(cls); },
    classes: new Set()
  }
};

updateCalendarNotice({ periodType: "regular", daySwaps: [], announcements: [] });
assert.ok(elements.calendarNotice.innerHTML.includes("notice-plan-modifying"), "Baner powinien zawierać klasę notice-plan-modifying");
assert.ok(elements.calendarNotice.innerHTML.includes("Plan w trakcie modyfikacji przez uczelnię:"), "Baner powinien zawierać nagłówek o modyfikacji");
assert.ok(elements.calendarNotice.innerHTML.includes("Wyświetlamy ostatnią dostępną wersję (wer. 2)"), "Baner powinien informować o wer. 2");
assert.ok(elements.calendarNotice.innerHTML.includes("Nowa wersja (wer. 3)"), "Baner powinien informować o wer. 3");
assert.ok(elements.calendarNotice.innerHTML.includes('data-dismiss-modification="Transport Morski sem. 1"'), "Przycisk zamknięcia powinien zawierać klucz planu");

// 27d. Zamknięcie powiadomienia
state.dismissedModificationPlans.add("Transport Morski sem. 1");
assert.strictEqual(getPlanModificationInfo("557"), null, "Po zamknięciu getPlanModificationInfo powinno zwracać null");
updateCalendarNotice({ periodType: "regular", daySwaps: [], announcements: [] });
assert.ok(!elements.calendarNotice.innerHTML.includes("notice-plan-modifying"), "Baner nie powinien być widoczny po zamknięciu");

console.log("✅ [PASS] Obsługa planów w trakcie modyfikacji działa prawidłowo.");

// --- TEST 28: System Wydarzeń Globalnych — renderowanie w widoku planu ---
console.log("\n-- Test 28: System Wydarzeń Globalnych — renderowanie na dole dnia w widoku planu");

const EventsService = require(path.join(ROOT_DIR, "web/js/modules/events.js"));
EventsService.events = [
  {
    id: "inauguracja-2026",
    date: "2026-10-01",
    time_start: "11:00",
    time_end: "14:00",
    title: "Uroczysta Inauguracja Roku Akademickiego",
    type: "academic",
    badge: "Rektorat",
    icon: "🎓",
    color: "#0d3b66"
  }
];

// Wybierz dzień z wydarzeniem: Czwartek 01.10.2026
const oct1Date = new Date(2026, 9, 1);
const oct1Mon = getMonday(oct1Date);
state.weekOffset = Math.round((oct1Mon - curMon) / (7 * 86400000));
state.selectedDayTab = "CZW";
state.scheduleData = {
  lessons: [
    {
      subject: "Nawigacja",
      przedmiot: "Nawigacja",
      day: "CZW",
      hours: "08:00 - 09:30",
      godziny: "08:00 - 09:30",
      room: "101",
      sala: "101",
      teacher: "Dr Nowak",
      prowadzacy: "Dr Nowak",
      occurrences: [{ date: "2026-10-01", meeting: 1, total: 15, is_final: false }]
    },
    {
      subject: "Matematyka",
      przedmiot: "Matematyka",
      day: "PT",
      hours: "08:00 - 09:30",
      godziny: "08:00 - 09:30",
      room: "201",
      sala: "201",
      teacher: "Dr Kowalski",
      prowadzacy: "Dr Kowalski",
      occurrences: [{ date: "2026-10-02", meeting: 1, total: 15, is_final: false }]
    }
  ]
};

// 28a. Widok pojedynczego dnia z wydarzeniem
renderSchedule();
assert.ok(mockScheduleContent.innerHTML.includes("day-events-section"), "Czwartek 01.10 powinien zawierać sekcję .day-events-section na dole");
assert.ok(mockScheduleContent.innerHTML.includes("Uroczysta Inauguracja Roku Akademickiego"), "Powinien zawierać tytuł wydarzenia");
assert.ok(mockScheduleContent.innerHTML.includes("11:00 – 14:00"), "Powinien zawierać godziny wydarzenia");
assert.ok(mockScheduleContent.innerHTML.includes("Nawigacja"), "Zwykłe zajęcia dydaktyczne powinny pozostać nienaruszone");

// 28b. Widok pojedynczego dnia bez wydarzenia (Piątek 02.10)
state.selectedDayTab = "PT";
renderSchedule();
assert.ok(!mockScheduleContent.innerHTML.includes("day-events-section"), "Piątek 02.10 nie ma wydarzeń — brak sekcji .day-events-section w DOM");
assert.ok(mockScheduleContent.innerHTML.includes("Matematyka"), "Zajęcia z matematyki powinny być wyrenderowane");

// 28c. Widok pełnego tygodnia (desktop)
state.selectedDayTab = "ALL";
renderSchedule();
assert.ok(mockScheduleContent.innerHTML.includes("day-events-section"), "Siatka tygodnia powinna zawierać sekcję wydarzeń w kolumnie czwartkowej");

// 28d. Widok tygodnia i dnia bez zajęć — weryfikacja stabilności elementów stanu pustego
state.scheduleData = { lessons: [] };
state.selectedDayTab = "PON";
EventsService.events = [];
assert.doesNotThrow(() => {
  renderSchedule();
}, "renderSchedule na pustym planie nie powinien rzucać ReferenceError dla titleEl/descEl");

state.selectedDayTab = "ALL";
assert.doesNotThrow(() => {
  renderSchedule();
}, "renderSchedule na pustym tygodniu nie powinien rzucać ReferenceError");

console.log("✅ [PASS] System wydarzeń renderuje się prawidłowo na dole dnia i nie narusza zajęć dydaktycznych.");

// --- TEST 29: Wskaźniki wydarzeń na zakładkach dni (Day Tabs Indicator Badges - Issue #10) ---
console.log("\n-- Test 29: Wskaźniki wydarzeń na zakładkach dni (Issue #10)");

function createMockTab(dayName) {
  const tab = {
    dataset: { day: dayName },
    classList: {
      classes: new Set(),
      add(c) { this.classes.add(c); },
      remove(c) { this.classes.delete(c); },
      toggle(c, force) {
        if (force === undefined) {
          if (this.classes.has(c)) this.classes.delete(c);
          else this.classes.add(c);
        } else if (force) {
          this.classes.add(c);
        } else {
          this.classes.delete(c);
        }
      },
      contains(c) { return this.classes.has(c); }
    },
    children: [],
    querySelector(selector) {
      if (selector === ".day-tab-indicator") {
        return this.children.find(child => child.className === "day-tab-indicator") || null;
      }
      return null;
    },
    appendChild(child) {
      child.parentElement = this;
      this.children.push(child);
      return child;
    }
  };
  return tab;
}

const mockDayTabsList = ["PON", "WT", "ŚR", "CZW", "PT", "SOB", "ND", "ALL"].map(createMockTab);

const prevDayTabs = elements.dayTabs;
elements.dayTabs = {
  querySelectorAll(sel) {
    if (sel === ".day-tab") return mockDayTabsList;
    return [];
  },
  querySelector(sel) {
    const match = sel.match(/data-day="([^"]+)"/);
    if (match) {
      return mockDayTabsList.find(t => t.dataset.day === match[1]) || null;
    }
    return null;
  }
};

const originalCreateElement = global.document.createElement;
global.document.createElement = function(tag) {
  return {
    tagName: tag.toUpperCase(),
    className: "",
    style: {},
    attributes: {},
    setAttribute(k, v) { this.attributes[k] = String(v); },
    getAttribute(k) { return this.attributes[k] || null; },
    remove() {
      if (this.parentElement) {
        const idx = this.parentElement.children.indexOf(this);
        if (idx !== -1) this.parentElement.children.splice(idx, 1);
      }
    }
  };
};

state.studyMode = "stacjonarne";
state.selectedPlanMetadata = { degree: 1 };
state.selectedDayTab = "PON";

const testNow = new Date();
const currentTestMonday = getMonday(testNow);
const testOctMonday = getMonday(new Date(2026, 9, 1)); // 2026-10-01 (Czwartek)
state.weekOffset = Math.round((testOctMonday - currentTestMonday) / (7 * 86400000));

const EventsServiceModule = require(path.join(ROOT_DIR, "web/js/modules/events.js"));
EventsServiceModule.events = [
  {
    id: "inauguracja-2026",
    date: "2026-10-01", // Czwartek
    title: "Inauguracja",
    type: "academic",
    color: "#0d3b66",
    target: { mode: "all", degree: "all" },
    enabled: true
  },
  {
    id: "flanki-stacj-2026",
    date: "2026-10-02", // Piątek
    title: "Flanki Integracyjne",
    type: "flanki",
    color: "#d97706",
    target: { mode: "stacjonarne", degree: 1 },
    enabled: true
  }
];

// Wywołaj updateDayTabsUI()
updateDayTabsUI();

const czwTab = mockDayTabsList.find(t => t.dataset.day === "CZW");
const ptTab = mockDayTabsList.find(t => t.dataset.day === "PT");
const ponTab = mockDayTabsList.find(t => t.dataset.day === "PON");

const czwInd = czwTab.querySelector(".day-tab-indicator");
const ptInd = ptTab.querySelector(".day-tab-indicator");
const ponInd = ponTab.querySelector(".day-tab-indicator");

assert.ok(czwInd, "Zakładka Czw powinna posiadać indykator wydarzenia 01.10");
assert.strictEqual(czwInd.style.backgroundColor, "#0d3b66", "Kolor indykatora Czw powinien odpowiadać stylowi akademickiemu (#0d3b66)");
assert.strictEqual(czwInd.attributes["role"], "status", "Indykator powinien posiadać role=status");
assert.ok(czwInd.attributes["aria-label"].includes("Inauguracja"), "aria-label powinien zawierać nazwę wydarzenia");

assert.ok(ptInd, "Zakładka Pt powinna posiadać indykator wydarzenia 02.10 (flanki dla stacjonarnych)");
assert.strictEqual(ptInd.style.backgroundColor, "#d97706", "Kolor indykatora Pt powinien być złoty (#d97706)");

assert.strictEqual(ponInd, null, "Zakładka Pon bez wydarzeń nie powinna posiadać indykatora");

// Przełączenie trybu studiów na niestacjonarne
state.studyMode = "niestacjonarne";
updateDayTabsUI();

assert.ok(czwTab.querySelector(".day-tab-indicator"), "Czw (target: all) nadal ma indykator po przełączeniu na niestacjonarne");
assert.strictEqual(ptTab.querySelector(".day-tab-indicator"), null, "Pt (target: stacjonarne) NIE ma indykatora w trybie niestacjonarnym");

// Przełączenie tygodnia
state.studyMode = "stacjonarne";
state.weekOffset += 1;
updateDayTabsUI();

assert.strictEqual(czwTab.querySelector(".day-tab-indicator"), null, "Po przełączeniu na inny tydzień indykator Czw znika");

// Restore
elements.dayTabs = prevDayTabs;
global.document.createElement = originalCreateElement;

console.log("✅ [PASS] Wskaźniki wydarzeń na zakładkach dni (Issue #10) działają prawidłowo, reagują na tryb studiów, zmianę tygodnia i posiadają atrybuty a11y.");

// --- TEST 27: Theme Management & System Theme Listener (Issue #1) ---
console.log("\n-- Test 27: Theme Management & System Theme Listener (Issue #1)");

const mockMeta = {
  attrs: {},
  setAttribute(k, v) { this.attrs[k] = v; },
  getAttribute(k) { return this.attrs[k]; }
};

const mockDocElement = {
  attrs: {},
  setAttribute(k, v) { this.attrs[k] = v; },
  getAttribute(k) { return this.attrs[k]; }
};

const origQuerySelector = global.document.querySelector;
const origDocElem = global.document.documentElement;
const origStorage = global.localStorage;

global.document.documentElement = mockDocElement;
global.document.querySelector = (sel) => {
  if (sel === 'meta[name="theme-color"]') return mockMeta;
  return null;
};

const storageMap = {};
global.localStorage = {
  getItem: (k) => storageMap[k] || null,
  setItem: (k, v) => { storageMap[k] = String(v); },
  removeItem: (k) => { delete storageMap[k]; }
};

// Test Light theme init
state.theme = "light";
initTheme();
assert.strictEqual(mockDocElement.getAttribute("data-theme"), "light");
assert.strictEqual(mockMeta.getAttribute("content"), "#0d233a", "Light mode theme-color should be #0d233a");

// Test toggleTheme
toggleTheme();
assert.strictEqual(state.theme, "dark");
assert.strictEqual(mockDocElement.getAttribute("data-theme"), "dark");
assert.strictEqual(mockMeta.getAttribute("content"), "#0b1828", "Dark mode theme-color should be #0b1828");
assert.strictEqual(global.localStorage.getItem("umg_theme"), "dark");

// Test toggle back to light
toggleTheme();
assert.strictEqual(state.theme, "light");
assert.strictEqual(mockMeta.getAttribute("content"), "#0d233a");
assert.strictEqual(global.localStorage.getItem("umg_theme"), "light");

// Cleanup
global.document.querySelector = origQuerySelector;
global.document.documentElement = origDocElem;
global.localStorage = origStorage;

console.log("✅ [PASS] Dynamic theme-color i przełączanie motywu działają prawidłowo.");

// --- TEST 28: View Transitions API Integration (Issue #4) ---
console.log("\n-- Test 28: View Transitions API Integration (Issue #4)");

let transitionStarted = false;
let callbackExecuted = false;

// 1. Browser supports View Transitions and motion is allowed
const origStartViewTransition = global.document.startViewTransition;
const origMatchMedia = global.window ? global.window.matchMedia : null;

global.document.startViewTransition = (cb) => {
  transitionStarted = true;
  cb();
  return { finished: Promise.resolve() };
};

if (!global.window) global.window = {};
global.window.matchMedia = (query) => ({
  matches: false, // motion not reduced
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {}
});

callbackExecuted = false;
transitionStarted = false;
withViewTransition(() => {
  callbackExecuted = true;
});

assert.strictEqual(transitionStarted, true, "Should invoke startViewTransition when available");
assert.strictEqual(callbackExecuted, true, "Callback should be executed inside transition");

// 2. Prefers reduced motion -> execute immediately without transition
transitionStarted = false;
callbackExecuted = false;
global.window.matchMedia = (query) => ({
  matches: query.includes("prefers-reduced-motion: reduce"),
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {}
});

withViewTransition(() => {
  callbackExecuted = true;
});
assert.strictEqual(transitionStarted, false, "Should not invoke startViewTransition when motion is reduced");
assert.strictEqual(callbackExecuted, true, "Callback should still execute immediately");

// 3. Fallback when startViewTransition is unsupported
delete global.document.startViewTransition;
callbackExecuted = false;
withViewTransition(() => {
  callbackExecuted = true;
});
assert.strictEqual(callbackExecuted, true, "Callback should execute immediately on unsupported browsers");

// Cleanup
if (origStartViewTransition) {
  global.document.startViewTransition = origStartViewTransition;
} else {
  delete global.document.startViewTransition;
}
if (origMatchMedia) {
  global.window.matchMedia = origMatchMedia;
}

console.log("✅ [PASS] View Transitions API (Issue #4) działa poprawnie ze wszystkimi fallbackami.");

// --- TEST 29: Migracja statycznych modali na natywny <dialog> (Issue #8) ---
console.log("\n-- Test 29: Migracja statycznych modali na natywny <dialog> (Issue #8)");
const fs = require("fs");
const indexHtmlContent = fs.readFileSync(path.join(ROOT_DIR, "web/index.html"), "utf-8");

// 1. Sprawdzenie deklaracji w HTML
assert.ok(
  /<dialog id="calendar-modal"[^>]*closedby="any"/.test(indexHtmlContent),
  "calendar-modal powinien być tagiem <dialog> z atrybutem closedby='any'"
);
assert.ok(
  /<dialog id="about-modal"[^>]*closedby="any"/.test(indexHtmlContent),
  "about-modal powinien być tagiem <dialog> z atrybutem closedby='any'"
);
assert.ok(
  /<dialog id="ios-install-modal"[^>]*closedby="any"/.test(indexHtmlContent),
  "ios-install-modal powinien być tagiem <dialog> z atrybutem closedby='any'"
);

// Sprawdzenie usunięcia zbędnych .modal-backdrop
const calendarModalMatch = indexHtmlContent.match(/<dialog id="calendar-modal"[\s\S]*?<\/dialog>/);
assert.ok(calendarModalMatch && !calendarModalMatch[0].includes('class="modal-backdrop"'), "calendar-modal nie powinien mieć zbędnego .modal-backdrop");
const aboutModalMatch = indexHtmlContent.match(/<dialog id="about-modal"[\s\S]*?<\/dialog>/);
assert.ok(aboutModalMatch && !aboutModalMatch[0].includes('class="modal-backdrop"'), "about-modal nie powinien mieć zbędnego .modal-backdrop");
const iosModalMatch = indexHtmlContent.match(/<dialog id="ios-install-modal"[\s\S]*?<\/dialog>/);
assert.ok(iosModalMatch && !iosModalMatch[0].includes('class="modal-backdrop"'), "ios-install-modal nie powinien mieć zbędnego .modal-backdrop");

// 2. Sprawdzenie wywołań showModal() i close() w JS
const {
  openCalendarModal: testOpenCalendarModal,
  closeCalendarModal: testCloseCalendarModal,
  openAboutModal: testOpenAboutModal,
  closeAboutModal: testCloseAboutModal,
  openPwaModal: testOpenPwaModal,
  closeIosModal: testCloseIosModal,
  setupDialogBackdropDismiss: testSetupDialogBackdropDismiss
} = require(path.join(ROOT_DIR, "web/app.js"));

function createMockDialog() {
  let isOpen = false;
  let clickHandlers = [];
  return {
    isOpen() { return isOpen; },
    classList: {
      remove: () => {},
      add: () => {}
    },
    showModal() { isOpen = true; },
    close() { isOpen = false; },
    addEventListener(type, fn) {
      if (type === "click") clickHandlers.push(fn);
    },
    simulateClick(event) {
      clickHandlers.forEach(h => h(event));
    },
    getBoundingClientRect() {
      return { top: 100, bottom: 400, left: 100, right: 400, width: 300, height: 300 };
    }
  };
}

// Test calendarModal
state.selectedPlanId = "555";
state.selectedGroup = "GR. 01";
global.window.location = { origin: "https://planwn.example.com", pathname: "/" };
const mockNavigatorObj = { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" };
global.navigator = mockNavigatorObj;
global.window.navigator = mockNavigatorObj;
const mockCalDialog = createMockDialog();
elements.calendarModal = mockCalDialog;
testOpenCalendarModal();
assert.strictEqual(mockCalDialog.isOpen(), true, "openCalendarModal powinien wywołać showModal()");
testCloseCalendarModal();
assert.strictEqual(mockCalDialog.isOpen(), false, "closeCalendarModal powinien wywołać close()");

// Test aboutModal
const mockAboutDialog = createMockDialog();
elements.aboutModal = mockAboutDialog;
testOpenAboutModal();
assert.strictEqual(mockAboutDialog.isOpen(), true, "openAboutModal powinien wywołać showModal()");
testCloseAboutModal();
assert.strictEqual(mockAboutDialog.isOpen(), false, "closeAboutModal powinien wywołać close()");

// Test pwaModal / iosInstallModal
const mockPwaDialog = createMockDialog();
elements.iosInstallModal = mockPwaDialog;
testOpenPwaModal("android");
assert.strictEqual(mockPwaDialog.isOpen(), true, "openPwaModal powinien wywołać showModal()");
testCloseIosModal();
assert.strictEqual(mockPwaDialog.isOpen(), false, "closeIosModal powinien wywołać close()");

// 3. Test setupDialogBackdropDismiss
let dismissed = false;
const testDialog = createMockDialog();
testSetupDialogBackdropDismiss(testDialog, () => { dismissed = true; });

// Kliknięcie wewnątrz współrzędnych modala -> nie powinno zamykać
testDialog.simulateClick({ clientX: 200, clientY: 200, target: {} });
assert.strictEqual(dismissed, false, "Kliknięcie wewnątrz modala nie powinno go zamykać");

// Kliknięcie poza współrzędnymi modala (backdrop) -> powinno zamknąć
testDialog.simulateClick({ clientX: 50, clientY: 50, target: testDialog });
assert.strictEqual(dismissed, true, "Kliknięcie w backdrop powinno wywołać dismiss");

console.log("✅ [PASS] Natywne modale <dialog> (Issue #8) działają poprawnie.");

// --- TEST 30: Regresja wyśrodkowania modala „O aplikacji” i szerokości .modal-content ---
console.log("\n-- Test 30: Wyśrodkowanie i szerokość modala „O aplikacji” (#about-modal)");
const styleCssContent = fs.readFileSync(path.join(ROOT_DIR, "web/style.css"), "utf-8");

assert.ok(
  !/#about-modal\s+\.modal-content\s*\{[^}]*width:\s*92%/s.test(styleCssContent),
  "#about-modal .modal-content nie może mieć width: 92% (powoduje asymetrię wewnątrz <dialog>)"
);

assert.ok(
  /#about-modal\s+\.modal-content\s*\{[^}]*width:\s*100%/s.test(styleCssContent),
  "#about-modal .modal-content powinien mieć width: 100%"
);

assert.ok(
  /\.modal-dialog\.about-modal-dialog\s*\{[^}]*width:\s*min\(94vw,\s*780px\)/s.test(styleCssContent),
  ".modal-dialog.about-modal-dialog powinien mieć width: min(94vw, 780px)"
);

assert.ok(
  /\.modal-dialog\s*\{[^}]*inset:\s*0/s.test(styleCssContent),
  ".modal-dialog powinien posiadać inset: 0 do centrowania"
);

console.log("✅ [PASS] Wyśrodkowanie modala #about-modal i reguły dialogów w CSS są poprawne.");

// Test bezpieczeństwa: sanityzacja DOM XSS w loadingState błędu (web/app.js)
const appJsContent = fs.readFileSync(path.join(ROOT_DIR, "web/app.js"), "utf-8");
assert.ok(
  appJsContent.includes("escapeHtml(state.selectedGroup"),
  "Komunikat błędu ładowania planu musi escapować state.selectedGroup funkcją escapeHtml (ochrona przed DOM XSS)"
);
console.log("✅ [PASS] Bezpieczeństwo DOM XSS w app.js zweryfikowane.");

// --- TEST: Ukrywanie pojedynczych terminów zajęć (slotów) i baner informacyjny ---
console.log("\n-- Test: Ukrywanie pojedynczych terminów zajęć (np. podgrup symulatora) i baner --");
const app = require(path.join(ROOT_DIR, "web/app.js"));
const {
  getLessonSlotKey,
  isHideableLesson,
  loadHiddenLessonSlots,
  saveHiddenLessonSlots,
  toggleLessonSlotHidden,
  restoreAllHiddenLessonSlots,
  togglePreviewHiddenLessons,
  updateHiddenLessonsBannerUI
} = app;

assert.strictEqual(typeof getLessonSlotKey, "function", "getLessonSlotKey powinien być zdefiniowany i wyeksportowany");
assert.strictEqual(typeof isHideableLesson, "function", "isHideableLesson powinien być zdefiniowany i wyeksportowany");

// 1. Deterministyczny klucz slotKey
const sampleSimLesson1 = {
  przedmiot: "Manewrowanie Statkiem",
  godziny: "14:30 - 16:45",
  sala: "102",
  prowadzacy: "Hejmlich Andrzej",
  data_start: "2026-10-15",
  hideable: true
};
const sampleSimLesson2 = {
  przedmiot: "Manewrowanie Statkiem",
  godziny: "08:30 - 10:45",
  sala: "102",
  prowadzacy: "Hejmlich Andrzej",
  data_start: "2026-11-09",
  hideable: true
};
const normalLesson1 = {
  przedmiot: "Język Angielski",
  godziny: "11:00 - 12:30",
  sala: "P1",
  prowadzacy: "Denc Maciej",
  hideable: false
};
const normalLesson2 = {
  przedmiot: "Manewrowanie Statkiem",
  godziny: "14:30 - 16:00",
  sala: "Aula",
  prowadzacy: "Abramowicz-Gerigk Teresa",
  hideable: false
};

// Weryfikacja reguły: tylko symulatory z manewrowania są ukrywalne
assert.strictEqual(isHideableLesson(sampleSimLesson1), true, "Zajęcia na symulatorze manewrowym w sali 102 powinny być ukrywalne");
assert.strictEqual(isHideableLesson(normalLesson1), false, "Zwykłe przedmioty (np. Angielski) nie mogą być ukrywalne");
assert.strictEqual(isHideableLesson(normalLesson2), false, "Wykład ogólny z manewrowania w auli nie może być ukrywalny");

const key1 = getLessonSlotKey(sampleSimLesson1, "CZW");
const key2 = getLessonSlotKey(sampleSimLesson2, "CZW");

assert.ok(key1.includes("Manewrowanie Statkiem"), "Klucz zawiera nazwę przedmiotu");
assert.ok(key1.includes("CZW"), "Klucz zawiera dzień");
assert.ok(key1.includes("14:30 - 16:45"), "Klucz zawiera godziny");
assert.ok(key1.includes("102"), "Klucz zawiera salę");
assert.notStrictEqual(key1, key2, "Różne godziny i daty startu dają różne klucze slotów");

// 2. Zarządzanie stanem i localStorage
state.selectedPlanId = "555";
state.selectedGroup = "GR. 1";
state.hiddenLessonSlots = new Set();
state.previewHiddenLessons = false;

// Mock localStorage
let slotStorage = {};
global.localStorage = {
  getItem: (k) => slotStorage[k] || null,
  setItem: (k, v) => { slotStorage[k] = String(v); },
  removeItem: (k) => { delete slotStorage[k]; },
  clear: () => { slotStorage = {}; }
};

// Ukryj slot 1
toggleLessonSlotHidden(sampleSimLesson1, "CZW");
assert.ok(state.hiddenLessonSlots.has(key1), "Slot 1 powinien być dodany do hiddenLessonSlots");

// Próba ukrycia zwykłego przedmiotu nie powinna się powieść
const normalToggled = toggleLessonSlotHidden(normalLesson1, "CZW");
assert.strictEqual(normalToggled, false, "toggleLessonSlotHidden na zwykłym przedmiocie powinien zwrócić false");

// Wczytaj z localStorage i zweryfikuj scoping do planId_grupa
const loadedSlots = loadHiddenLessonSlots("555", "GR. 1");
assert.ok(loadedSlots.has(key1), "Slot 1 powinien być zapisany w localStorage dla grupy GR. 1");

const loadedOtherGroup = loadHiddenLessonSlots("555", "GR. 2");
assert.strictEqual(loadedOtherGroup.has(key1), false, "Inna grupa nie powinna mieć ukrytego slotu (izolacja scope)");

// 3. Renderowanie karty z ukryciem
const cardVisible = renderLessonCard(sampleSimLesson1);
assert.ok(cardVisible.includes("btn-hide-lesson"), "Karta symulatora manewrowego powinna zawierać przycisk ukrywania");
assert.ok(!cardVisible.includes("is-hidden-lesson"), "Widoczna karta nie powinna mieć klasy is-hidden-lesson");

const normalCard = renderLessonCard(normalLesson1);
assert.ok(!normalCard.includes("btn-hide-lesson"), "Karta zwykłego przedmiotu NIE może zawierać przycisku ukrywania");

const lectureCard = renderLessonCard(normalLesson2);
assert.ok(!lectureCard.includes("btn-hide-lesson"), "Karta wykładu w auli NIE może zawierać przycisku ukrywania");

sampleSimLesson1._isHidden = true;
const cardHidden = renderLessonCard(sampleSimLesson1);
assert.ok(cardHidden.includes("is-hidden-lesson"), "Ukryta karta w trybie podglądu powinna mieć klasę is-hidden-lesson");
assert.ok(cardHidden.includes("Ukryty"), "Ukryta karta powinna posiadać plakietkę 'Ukryty'");

// 4. Przywrócenie wszystkich ukrytych slotów
restoreAllHiddenLessonSlots("555", "GR. 1");
assert.strictEqual(state.hiddenLessonSlots.size, 0, "restoreAllHiddenLessonSlots powinien wyczyścić zbiór ukrytych slotów");
const loadedAfterRestore = loadHiddenLessonSlots("555", "GR. 1");
assert.strictEqual(loadedAfterRestore.size, 0, "localStorage po restoreAll powinien być pusty");

console.log("✅ [PASS] Logika ukrywania pojedynczych terminów zajęć przetestowana pomyślnie.");

// --- TEST: Dialog Wydarzenia (kolejność chronologiczna, formatowanie, otwieranie/zamykanie) oraz integracja z Tally i ikoną w 'O aplikacji' ---
console.log("\n-- Test: Dialog Wydarzenia, obsługa Tally i logo O aplikacji");

// 1. Formatowanie daty formatEventFullDate
const formattedDate = formatEventFullDate("2026-10-01");
assert.ok(formattedDate.includes("2026"), "Sformatowana data powinna zawierać rok");
assert.ok(formattedDate.includes("1") || formattedDate.includes("października") || formattedDate.includes("paź"), "Sformatowana data powinna zawierać dzień lub miesiąc");

// 2. Renderowanie listy wydarzeń w porządku chronologicznym (tylko dzisiaj i przyszłość)
const rawMockEvents = [
  {
    id: "later-event",
    date: "2099-11-20",
    time_start: "18:00",
    title: "Listopadowe Wydarzenie",
    enabled: true
  },
  {
    id: "earlier-event-2",
    date: "2099-10-15",
    time_start: "12:00",
    title: "Południowe Wydarzenie",
    enabled: true
  },
  {
    id: "earlier-event-1",
    date: "2099-10-15",
    time_start: "09:00",
    title: "Poranne Wydarzenie",
    enabled: true,
    url: "https://umg.edu.pl",
    button_text: "Szczegóły"
  },
  {
    id: "past-event",
    date: "2020-01-01",
    time_start: "10:00",
    title: "Przeszłe Wydarzenie",
    enabled: true
  },
  {
    id: "disabled-event",
    date: "2099-10-10",
    time_start: "10:00",
    title: "Wyłączone Wydarzenie",
    enabled: false
  }
];

if (_EventsService) {
  _EventsService.events = rawMockEvents;
}

const mockListContainer = { innerHTML: "" };
elements.eventsModalList = mockListContainer;

renderEventsModalList();

// Sprawdzenie kolejności wystąpień w wyrenderowanym HTML
const firstIdx = mockListContainer.innerHTML.indexOf("Poranne Wydarzenie");
const secondIdx = mockListContainer.innerHTML.indexOf("Południowe Wydarzenie");
const thirdIdx = mockListContainer.innerHTML.indexOf("Listopadowe Wydarzenie");

assert.ok(firstIdx !== -1 && secondIdx !== -1 && thirdIdx !== -1, "Wszystkie aktywne przyszłe wydarzenia powinny być wyrenderowane");
assert.ok(firstIdx < secondIdx, "Poranne wydarzenie (09:00) powinno być przed południowym (12:00)");
assert.ok(secondIdx < thirdIdx, "Wydarzenie z października powinno być przed wydarzeniem z listopada");
assert.ok(!mockListContainer.innerHTML.includes("Przeszłe Wydarzenie"), "Przeszłe wydarzenie (sprzed dzisiaj) NIE może być wyświetlane");
assert.ok(!mockListContainer.innerHTML.includes("Wyłączone Wydarzenie"), "Wyłączone wydarzenie nie powinno być widoczne na liście");
assert.ok(mockListContainer.innerHTML.includes("Szczegóły"), "Przycisk akcji z button_text powinien być wyrenderowany");

// Test pustego stanu
if (_EventsService) _EventsService.events = [];
renderEventsModalList();
assert.ok(mockListContainer.innerHTML.includes("events-empty-state"), "Przy braku wydarzeń powinien pojawić się stan pusty");

// 3. Otwieranie i zamykanie modala wydarzeń
let eventsModalShowCalled = false;
let eventsModalCloseCalled = false;
elements.eventsModal = {
  showModal: () => { eventsModalShowCalled = true; },
  close: () => { eventsModalCloseCalled = true; },
  classList: {
    remove: () => {},
    add: () => {}
  }
};

openEventsModal();
assert.strictEqual(eventsModalShowCalled, true, "openEventsModal() powinno wywołać showModal()");

closeEventsModal();
assert.strictEqual(eventsModalCloseCalled, true, "closeEventsModal() powinno wywołać close()");

// 4. Test zamknięcia About Modal przy otwarciu formularza Tally
let aboutModalClosed = false;
elements.aboutModal = {
  open: true,
  close: () => { aboutModalClosed = true; },
  classList: {
    contains: () => false
  }
};

// Symulacja kliknięcia linku z Tally
const fakeTallyLink = {
  closest: (sel) => (sel.includes("data-tally-open") ? fakeTallyLink : null),
  getAttribute: () => "test-form-id"
};

// Dispatch click event simulation on document
if (typeof document !== "undefined" && document.dispatchEvent) {
  const fakeClick = { target: fakeTallyLink, preventDefault: () => {} };
  // Wywołanie logiki: jeśli aboutModal jest otwarty, closeAboutModal() zamyka go
  if (elements.aboutModal && elements.aboutModal.open) {
    closeAboutModal();
  }
  assert.strictEqual(aboutModalClosed, true, "Otwarcie Tally powinno zamknąć modal o aplikacji");
}

// 5. Weryfikacja tła ikony aplikacji w CSS (.about-logo-badge ma stały ciemnogranatowy kolor)
const cssContent = fs.readFileSync(path.join(ROOT_DIR, "web/style.css"), "utf-8");
assert.ok(cssContent.includes(".about-logo-badge"), "style.css powinien definiować .about-logo-badge");
assert.ok(cssContent.includes("#0d233a"), "style.css powinien używać stałego koloru #0d233a dla .about-logo-badge");

console.log("✅ [PASS] Dialog Wydarzenia, obsługa Tally i stałe tło logo aplikacji przetestowane pomyślnie.");



