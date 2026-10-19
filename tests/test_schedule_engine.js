const assert = require("assert");

console.log("\n🧪 Running ScheduleEngine Unit Tests (Contract v1)...\n");

const path = require("path");
const ROOT_DIR = path.resolve(__dirname, "..");
const ScheduleEngine = require(path.join(ROOT_DIR, "web/js/schedule-engine.js"));
const academicCalendar = require(path.join(ROOT_DIR, "tenants/umg_wn/academic_calendar.json"));

// --- Test 1: Module exports and constants ---
console.log("-- Test 1: Eksportowane stałe i fabryka (oraz brak legacy getLessonMeetingInfo)");
assert.ok(ScheduleEngine, "ScheduleEngine powinien być zdefiniowany");
assert.strictEqual(typeof ScheduleEngine.create, "function", "ScheduleEngine.create powinien być funkcją");
assert.deepStrictEqual(ScheduleEngine.DNI_TYGODNIA, ["PON", "WT", "ŚR", "CZW", "PT", "SOB", "ND"]);
assert.deepStrictEqual(ScheduleEngine.DNI_MAP_SUNDAY_FIRST, ["ND", "PON", "WT", "ŚR", "CZW", "PT", "SOB"]);
console.log("✅ [PASS] Eksportowane stałe są poprawne.");

// --- Test 2: Izolacja kalendarza (brak mutacji wejścia) ---
console.log("\n-- Test 2: Izolacja wejściowego kalendarza (brak mutacji wejścia)");
const inputCal = JSON.parse(JSON.stringify(academicCalendar));
const engine = ScheduleEngine.create(inputCal);
assert.strictEqual(engine.getLessonMeetingInfo, undefined, "Legacy getLessonMeetingInfo zostało usunięte (logika w core/expand.py)");
inputCal.holidays["2026-11-11"] = "Zmutowane święto";
assert.strictEqual(
  engine.isTeachingDay("2026-11-11"),
  false,
  "2026-11-11 powinno być dniem wolnym"
);
console.log("✅ [PASS] Modyfikacja obiektu wejściowego nie wpływa na instancję silnika.");

// --- Test 3: Wstrzykiwanie options ---
console.log("\n-- Test 3: Tworzenie instancji z opcjami");
const fixedDate = new Date("2026-11-04T10:00:00Z");
const engineWithNow = ScheduleEngine.create(academicCalendar, { now: fixedDate });
assert.strictEqual(typeof engineWithNow.resolveWeekSchedule, "function");
console.log("✅ [PASS] Instancja z opcjami utworzona pomyślnie.");

// --- Test 4: Helpery dat (getMonday, formatDateISO) ---
console.log("\n-- Test 4: Helpery dat (getMonday, formatDateISO)");
const d1 = new Date(2026, 10, 4); // 2026-11-04 (Środa)
const mon1 = engine.getMonday(d1);
assert.strictEqual(engine.formatDateISO(mon1), "2026-11-02");
assert.strictEqual(engine.formatDateISO(d1), "2026-11-04");
console.log("✅ [PASS] getMonday i formatDateISO działają poprawnie.");

// --- Test 5: isTeachingDay (święta, przerwy, sesje) ---
console.log("\n-- Test 5: isTeachingDay dla świąt, przerw i sesji");
assert.strictEqual(engine.isTeachingDay("2026-11-04"), true, "04.11.2026 to zwykły dzień zajęć");
assert.strictEqual(engine.isTeachingDay("2026-11-11"), false, "11.11.2026 to Święto Niepodległości");
assert.strictEqual(engine.isTeachingDay("2026-12-25"), false, "25.12.2026 to Boże Narodzenie (przerwa)");
assert.strictEqual(engine.isTeachingDay("2027-02-05"), false, "05.02.2027 to sesja zimowa");
console.log("✅ [PASS] isTeachingDay prawidłowo rozpoznaje dni dydaktyczne.");

// --- Test 6: getLessonProgress z tablicy occurrences[] ---
console.log("\n-- Test 6: getLessonProgress (konsumpcja occurrences[])");
const lessonWed = {
  id: "mat_wed",
  subject: "Matematyka",
  day_of_week: "WED",
  start_time: "10:00",
  end_time: "11:30",
  occurrences: [
    { date: "2026-10-07", number: 1, of: 15 },
    { date: "2026-10-14", number: 2, of: 15 },
    { date: "2026-10-21", number: 3, of: 15 },
    { date: "2026-10-28", number: 4, of: 15 },
    { date: "2026-11-04", number: 5, of: 15 },
    { date: "2026-11-13", number: 6, of: 15, swapped_from: "WED" }
  ]
};
const mon04 = engine.getMonday(new Date(2026, 10, 4)); // 2026-11-02
const progNormal = engine.getLessonProgress(lessonWed, "ŚR", mon04, "2026-11-04");
assert.strictEqual(progNormal.text, "5/15");
assert.strictEqual(progNormal.isFinal, false);

const shortLesson = {
  id: "bhp_wed",
  subject: "BHP",
  day_of_week: "WED",
  start_time: "08:00",
  end_time: "09:30",
  occurrences: [
    { date: "2026-11-04", number: 5, of: 5 }
  ]
};
const progFinal = engine.getLessonProgress(shortLesson, "ŚR", mon04, "2026-11-04");
assert.strictEqual(progFinal.text, "Ostatnie zajęcia");
assert.strictEqual(progFinal.isFinal, true);
console.log("✅ [PASS] getLessonProgress poprawnie generuje tekst postępu z occurrences[].");

// --- Test 7: resolveWeekSchedule — Tabela priorytetów, święto, zamiana dnia i baseDayPreview ---
console.log("\n-- Test 7: resolveWeekSchedule — statusy dnia, święto i zamiana dnia (Contract v1)");
const rawSchedule = {
  schema_version: 1,
  plan_id: "plan_1",
  group: "GR. 1",
  lessons: [
    {
      id: "fiz_mon",
      subject: "Fizyka",
      day_of_week: "MON",
      start_time: "08:00",
      end_time: "09:30",
      room: "101",
      occurrences: [
        { date: "2026-11-09", number: 6, of: 15 }
      ]
    },
    {
      id: "mat_wed",
      subject: "Matematyka",
      day_of_week: "WED",
      start_time: "10:00",
      end_time: "11:30",
      room: "202",
      occurrences: [
        { date: "2026-11-04", number: 5, of: 15 },
        { date: "2026-11-13", number: 6, of: 15, swapped_from: "WED" }
      ]
    },
    {
      id: "inf_fri",
      subject: "Informatyka",
      day_of_week: "FRI",
      start_time: "12:00",
      end_time: "13:30",
      room: "303",
      occurrences: [
        { date: "2026-11-06", number: 5, of: 15 },
        { date: "2026-11-20", number: 6, of: 15 }
      ]
    }
  ]
};

// Tydzień 09.11.2026 - 15.11.2026 (Środa 11.11 = święto, Piątek 13.11 = zamiana ze środy)
const targetMon = new Date(2026, 10, 9);
const weekResult = engine.resolveWeekSchedule(targetMon, rawSchedule);

// Poniedziałek 09.11 -> normal
assert.strictEqual(weekResult["PON"].status, "normal");
assert.strictEqual(weekResult["PON"].lessons.length, 1);
assert.strictEqual(weekResult["PON"].lessons[0].przedmiot, "Fizyka");
assert.strictEqual(weekResult["PON"].lessons[0].isActive, true);

// Środa 11.11 -> holiday, lessons puste zgodnie z D3
assert.strictEqual(weekResult["ŚR"].status, "holiday");
assert.strictEqual(weekResult["ŚR"].message, "Święto Niepodległości");
assert.deepStrictEqual(weekResult["ŚR"].lessons, [], "W święto lista zajęć musi być pusta (D3)");

// Piątek 13.11 -> daySwap ze Środy, z zajęciami matematyki (data wystąpienia 2026-11-13)
assert.strictEqual(weekResult["PT"].status, "daySwap");
assert.strictEqual(weekResult["PT"].swapReplaceWith, "ŚR");
assert.strictEqual(weekResult["PT"].lessons.length, 1);
assert.strictEqual(weekResult["PT"].lessons[0].przedmiot, "Matematyka");
assert.strictEqual(weekResult["PT"].lessons[0].meetingNumber, 6);

// baseDayPreview dla Piątku 13.11 zawiera oryginalne zajęcia z Piątku (Informatyka) z meetingNumber: null (D5)
assert.ok(Array.isArray(weekResult["PT"].baseDayPreview), "baseDayPreview powinno być tablicą");
assert.strictEqual(weekResult["PT"].baseDayPreview.length, 1);
assert.strictEqual(weekResult["PT"].baseDayPreview[0].przedmiot, "Informatyka");
assert.strictEqual(weekResult["PT"].baseDayPreview[0].meetingNumber, null, "Preview nie liczy spotkań (D5)");
console.log("✅ [PASS] resolveWeekSchedule poprawnie interpretuje święta, zamiany dni i preview.");

// --- Test 8: resolveWeekSchedule — Przerwa świąteczna i sesja ---
console.log("\n-- Test 8: resolveWeekSchedule — Przerwa świąteczna i sesja egzaminacyjna");
const breakMon = new Date(2026, 11, 21);
const breakWeek = engine.resolveWeekSchedule(breakMon, rawSchedule);
assert.strictEqual(breakWeek["CZW"].status, "holiday"); // 24.12 Wigilia
assert.deepStrictEqual(breakWeek["CZW"].lessons, []);

const examMon = new Date(2027, 1, 8);
const examWeek = engine.resolveWeekSchedule(examMon, rawSchedule);
assert.strictEqual(examWeek["PON"].status, "exam");
assert.deepStrictEqual(examWeek["PON"].lessons, []);
console.log("✅ [PASS] Przerwy świąteczne i sesje egzaminacyjne czyszczą listę zajęć i ustawiają status.");

// --- Test 9: Niezmienność wejścia rawSchedule ---
console.log("\n-- Test 9: Kontrakt niezmienności (rawSchedule)");
const rawCopy = JSON.parse(JSON.stringify(rawSchedule));
engine.resolveWeekSchedule(targetMon, rawSchedule);
assert.deepStrictEqual(rawSchedule, rawCopy, "resolveWeekSchedule nie może mutować rawSchedule");
console.log("✅ [PASS] Obiekt wejściowy rawSchedule nie jest mutowany.");

// --- Test 10: getRoomOccupancyAt z tablicą dates[] ---
console.log("\n-- Test 10: getRoomOccupancyAt (weryfikacja entry.dates.includes(targetDateIso))");
const roomSchedule = [
  { hours: "08:00 - 09:30", subject: "Fizyka", dates: ["2026-10-05", "2026-11-09"] }
];
// Zapytanie o 08:30 w dniu realizacji (2026-11-09) -> zajęta
const occOccupied = engine.getRoomOccupancyAt(roomSchedule, { start: 8 * 60 + 30, end: 8 * 60 + 31 }, "2026-11-09");
assert.strictEqual(occOccupied.isFree, false);
assert.strictEqual(occOccupied.occupyingClass.subject, "Fizyka");

// Zapytanie o 08:30 w dniu spoza dates[] (2026-11-16) -> wolna
const occNotInDates = engine.getRoomOccupancyAt(roomSchedule, { start: 8 * 60 + 30, end: 8 * 60 + 31 }, "2026-11-16");
assert.strictEqual(occNotInDates.isFree, true);

// Zapytanie o 10:00 (po zajęciach) -> wolna
const occFree = engine.getRoomOccupancyAt(roomSchedule, { start: 10 * 60, end: 10 * 60 + 1 }, "2026-11-09");
assert.strictEqual(occFree.isFree, true);
assert.strictEqual(occFree.occupyingClass, null);

// Zapytanie w dzień wolny (11.11.2026) -> wolna
const occHoliday = engine.getRoomOccupancyAt(roomSchedule, { start: 8 * 60 + 30, end: 8 * 60 + 31 }, "2026-11-11");
assert.strictEqual(occHoliday.isFree, true);
console.log("✅ [PASS] getRoomOccupancyAt poprawnie wyznacza wolne i zajęte sale na podstawie dates[].");

// --- Test 11: buildScheduleIndex (Contract v1) ---
console.log("\n-- Test 11: buildScheduleIndex");
const plansMock = {
  "plan_1": {
    group: "GR. 1",
    lessons: [
      { subject: "Nawigacja", room: "A-101", day_of_week: "MON", start_time: "08:00", end_time: "09:30", occurrences: [{ date: "2026-10-05" }] }
    ]
  },
  "plan_2": {
    group: "GR. 2",
    lessons: [
      { subject: "Astronomia", room: "A-101", day_of_week: "MON", start_time: "10:00", end_time: "11:30", occurrences: [{ date: "2026-10-05" }] },
      { subject: "Wychowanie fizyczne", room: "OL", remote: true, day_of_week: "MON", start_time: "12:00", end_time: "13:30", occurrences: [{ date: "2026-10-05" }] }
    ]
  }
};
const roomIndex = engine.buildScheduleIndex(plansMock);
assert.ok(roomIndex["A-101"], "Sala A-101 powinna być zaindeksowana");
assert.strictEqual(roomIndex["A-101"]["PON"].length, 2);
assert.deepStrictEqual(roomIndex["A-101"]["PON"][0].dates, ["2026-10-05"]);
assert.strictEqual(roomIndex["OL"], undefined, "Sala OL powinna być pominięta w indeksie fizycznych sal");
console.log("✅ [PASS] buildScheduleIndex poprawnie indeksuje sale w formacie Contract v1.");

// --- Test 12: resolveBaseDay ---
console.log("\n-- Test 12: resolveBaseDay");
assert.strictEqual(engine.resolveBaseDay("2026-11-04"), "ŚR", "04.11.2026 to środa");
assert.strictEqual(engine.resolveBaseDay("2026-11-02"), "PON", "02.11.2026 to poniedziałek");
assert.strictEqual(engine.resolveBaseDay("2026-11-13"), "ŚR", "13.11.2026 (piątek) ma zamianę rektorską na środę");
assert.strictEqual(engine.resolveBaseDay("2026-11-08"), "ND", "08.11.2026 to niedziela");
assert.strictEqual(engine.resolveBaseDay(null), null);
assert.strictEqual(engine.resolveBaseDay(""), null);
assert.strictEqual(engine.resolveBaseDay("invalid-date"), null);
console.log("✅ [PASS] resolveBaseDay poprawnie rozwiązuje dzień bazowy i zamiany rektorskie.");

console.log("\n🎉 Wszystkie testy ScheduleEngine zakończone sukcesem (100% PASS)!\n");
