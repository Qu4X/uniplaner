const assert = require("assert");

console.log("\n🧪 Running ScheduleEngine Unit Tests (Red/Green Loop)...\n");

const path = require("path");
const ROOT_DIR = path.resolve(__dirname, "..");
const ScheduleEngine = require(path.join(ROOT_DIR, "web/js/schedule-engine.js"));
const academicCalendar = require(path.join(ROOT_DIR, "data/academic_calendar.json"));

// --- Test 1: Module exports and constants ---
console.log("-- Test 1: Eksportowane stałe i fabryka");
assert.ok(ScheduleEngine, "ScheduleEngine powinien być zdefiniowany");
assert.strictEqual(typeof ScheduleEngine.create, "function", "ScheduleEngine.create powinien być funkcją");
assert.deepStrictEqual(ScheduleEngine.DNI_TYGODNIA, ["PON", "WT", "ŚR", "CZW", "PT", "SOB", "ND"]);
assert.deepStrictEqual(ScheduleEngine.DNI_MAP_SUNDAY_FIRST, ["ND", "PON", "WT", "ŚR", "CZW", "PT", "SOB"]);
console.log("✅ [PASS] Eksportowane stałe są poprawne.");

// --- Test 2: Izolacja kalendarza (brak mutacji wejścia) ---
console.log("\n-- Test 2: Izolacja wejściowego kalendarza (brak mutacji wejścia)");
const inputCal = JSON.parse(JSON.stringify(academicCalendar));
const engine = ScheduleEngine.create(inputCal);
inputCal.holidays["2026-11-11"] = "Zmutowane święto";
assert.strictEqual(
  engine.isTeachingDay("2026-11-11"),
  false,
  "2026-11-11 powinno być dniem wolnym"
);
console.log("✅ [PASS] Modyfikacja obiektu wejściowego nie wpływa na instancję silnika.");

// --- Test 3: Wstrzykiwanie options.now ---
console.log("\n-- Test 3: Wstrzykiwanie options.now");
const fixedDate = new Date("2026-11-04T10:00:00Z");
const engineWithNow = ScheduleEngine.create(academicCalendar, { now: fixedDate });
assert.strictEqual(typeof engineWithNow.resolveWeekSchedule, "function");
console.log("✅ [PASS] Instancja z options.now utworzona pomyślnie.");

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

// --- Test 6: getLessonMeetingInfo (spotkania, zamiany dni, święta) ---
console.log("\n-- Test 6: getLessonMeetingInfo");
const lessonWed = {
  przedmiot: "Matematyka",
  data_start: "2026-10-07", // Środa
  tygodnie: 15,
  co_ile: 1
};
const mon04 = engine.getMonday(new Date(2026, 10, 4)); // 2026-11-02
const res04 = engine.getLessonMeetingInfo(lessonWed, "ŚR", mon04, "2026-11-04");
assert.strictEqual(res04.meetingNum, 5, `04.11 powinno być 5. spotkanie, a jest ${res04.meetingNum}`);
assert.strictEqual(res04.active, true);

// 11.11.2026 (Święto) -> nieaktywne
const mon11 = engine.getMonday(new Date(2026, 10, 11));
const res11 = engine.getLessonMeetingInfo(lessonWed, "ŚR", mon11, "2026-11-11");
assert.strictEqual(res11.active, false, "11.11 powinno być active = false");

// 13.11.2026 (Piątek jako Środa) -> 6. spotkanie matematyki
const res13 = engine.getLessonMeetingInfo(lessonWed, "ŚR", mon11, "2026-11-13");
assert.strictEqual(res13.active, true, "13.11 powinno być active = true (odrabianie ze środy)");
assert.strictEqual(res13.meetingNum, 6, "13.11 powinno być spotkanie 6");
console.log("✅ [PASS] getLessonMeetingInfo poprawnie liczy spotkania przy świętach i zamianach dni.");

// --- Test 7: Guard na nieprawidłowy format data_start ---
console.log("\n-- Test 7: Guard na nieprawidłowy data_start");
const invalidLesson = {
  przedmiot: "BHP",
  data_start: "invalid-date",
  tygodnie: 4
};
const resInvalid = engine.getLessonMeetingInfo(invalidLesson, "PON", mon04, "2026-11-02");
assert.strictEqual(resInvalid.active, true);
assert.strictEqual(resInvalid.meetingNum, 1);
assert.strictEqual(resInvalid.total, 4);
console.log("✅ [PASS] Nieprawidłowa data_start nie rzuca błędu i zwraca bezpieczny fallback.");

// --- Test 8: getLessonProgress ---
console.log("\n-- Test 8: getLessonProgress");
const progNormal = engine.getLessonProgress(lessonWed, "ŚR", mon04, "2026-11-04");
assert.strictEqual(progNormal.text, "5/15");
assert.strictEqual(progNormal.isFinal, false);

const shortLesson = { przedmiot: "BHP", data_start: "2026-10-07", tygodnie: 5 };
const progFinal = engine.getLessonProgress(shortLesson, "ŚR", mon04, "2026-11-04");
assert.strictEqual(progFinal.text, "Ostatnie zajęcia");
assert.strictEqual(progFinal.isFinal, true);
console.log("✅ [PASS] getLessonProgress poprawnie generuje tekst postępu i flagę finalną.");

// --- Test 9: resolveWeekSchedule — Tabela priorytetów i DayStatus ---
console.log("\n-- Test 9: resolveWeekSchedule — statusy dnia, święto i zamiana dnia");
const rawSchedule = {
  "PON": {
    "08:00": { przedmiot: "Fizyka", data_start: "2026-10-05", tygodnie: 15, godziny: "08:00 - 09:30", sala: "101" }
  },
  "ŚR": {
    "10:00": { przedmiot: "Matematyka", data_start: "2026-10-07", tygodnie: 15, godziny: "10:00 - 11:30", sala: "202" }
  },
  "PT": {
    "12:00": { przedmiot: "Informatyka", data_start: "2026-10-09", tygodnie: 15, godziny: "12:00 - 13:30", sala: "303" }
  }
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

// Piątek 13.11 -> daySwap ze Środy, z zajęciami matematyki
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

// --- Test 10: resolveWeekSchedule — Przerwa świąteczna i sesja ---
console.log("\n-- Test 10: resolveWeekSchedule — Przerwa świąteczna i sesja egzaminacyjna");
// Tydzień przerwy świątecznej: 21.12.2026
const breakMon = new Date(2026, 11, 21);
const breakWeek = engine.resolveWeekSchedule(breakMon, rawSchedule);
assert.strictEqual(breakWeek["CZW"].status, "holiday"); // 24.12 Wigilia
assert.deepStrictEqual(breakWeek["CZW"].lessons, []);

// Tydzień sesji zimowej: 08.02.2027
const examMon = new Date(2027, 1, 8);
const examWeek = engine.resolveWeekSchedule(examMon, rawSchedule);
assert.strictEqual(examWeek["PON"].status, "exam");
assert.deepStrictEqual(examWeek["PON"].lessons, []);
console.log("✅ [PASS] Przerwy świąteczne i sesje egzaminacyjne czyszczą listę zajęć i ustawiają status.");

// --- Test 11: Niezmienność wejścia rawSchedule ---
console.log("\n-- Test 11: Kontrakt niezmienności (rawSchedule)");
const rawCopy = JSON.parse(JSON.stringify(rawSchedule));
engine.resolveWeekSchedule(targetMon, rawSchedule);
assert.deepStrictEqual(rawSchedule, rawCopy, "resolveWeekSchedule nie może mutować rawSchedule");
engine.getLessonMeetingInfo(rawSchedule["PON"]["08:00"], "PON", targetMon);
assert.deepStrictEqual(rawSchedule, rawCopy, "getLessonMeetingInfo nie może mutować obiektu zajęć");
console.log("✅ [PASS] Obiekt wejściowy rawSchedule nie jest mutowany.");

// --- Test 12: getRoomOccupancyAt ---
console.log("\n-- Test 12: getRoomOccupancyAt");
const roomSchedule = [
  { hours: "08:00 - 09:30", subject: "Fizyka", data_start: "2026-10-05", weeks: 15 }
];
// Zapytanie o 08:30 (w trakcie zajęć) -> zajęta
const occOccupied = engine.getRoomOccupancyAt(roomSchedule, { start: 8 * 60 + 30, end: 8 * 60 + 31 }, "2026-11-09", "PON");
assert.strictEqual(occOccupied.isFree, false);
assert.strictEqual(occOccupied.occupyingClass.subject, "Fizyka");

// Zapytanie o 10:00 (po zajęciach) -> wolna
const occFree = engine.getRoomOccupancyAt(roomSchedule, { start: 10 * 60, end: 10 * 60 + 1 }, "2026-11-09", "PON");
assert.strictEqual(occFree.isFree, true);
assert.strictEqual(occFree.occupyingClass, null);

// Zapytanie w dzień wolny (11.11.2026) -> wolna
const occHoliday = engine.getRoomOccupancyAt(roomSchedule, { start: 8 * 60 + 30, end: 8 * 60 + 31 }, "2026-11-11", "ŚR");
assert.strictEqual(occHoliday.isFree, true);
console.log("✅ [PASS] getRoomOccupancyAt poprawnie wyznacza wolne i zajęte sale.");

// --- Test 13: buildScheduleIndex ---
console.log("\n-- Test 13: buildScheduleIndex");
const plansMock = {
  "plan_1": {
    "PON": {
      "08:00": { przedmiot: "Nawigacja", sala: "A-101", godziny: "08:00 - 09:30", tygodnie: 15 }
    }
  },
  "plan_2": {
    "PON": {
      "10:00": { przedmiot: "Astronomia", sala: "A-101", godziny: "10:00 - 11:30", tygodnie: 15 },
      "12:00": { przedmiot: "Wychowanie fizyczne", sala: "OL", godziny: "12:00 - 13:30", tygodnie: 15 }
    }
  }
};
const roomIndex = engine.buildScheduleIndex(plansMock);
assert.ok(roomIndex["A-101"], "Sala A-101 powinna być zaindeksowana");
assert.strictEqual(roomIndex["A-101"]["PON"].length, 2);
assert.strictEqual(roomIndex["OL"], undefined, "Sala OL powinna być pominięta w indeksie fizycznych sal");
console.log("✅ [PASS] buildScheduleIndex poprawnie indeksuje sale.");
// --- Test 14: resolveBaseDay (zwykły dzień, zamiana dnia, weekend, błędy) ---
console.log("\n-- Test 14: resolveBaseDay");
assert.strictEqual(engine.resolveBaseDay("2026-11-04"), "ŚR", "04.11.2026 to środa");
assert.strictEqual(engine.resolveBaseDay("2026-11-02"), "PON", "02.11.2026 to poniedziałek");
// Piątek 13.11.2026 ma zamianę rektorską na środę w academic_calendar.json:
assert.strictEqual(engine.resolveBaseDay("2026-11-13"), "ŚR", "13.11.2026 (piątek) ma zamianę rektorską na środę");
assert.strictEqual(engine.resolveBaseDay("2026-11-08"), "ND", "08.11.2026 to niedziela");
assert.strictEqual(engine.resolveBaseDay(null), null);
assert.strictEqual(engine.resolveBaseDay(""), null);
assert.strictEqual(engine.resolveBaseDay("invalid-date"), null);
console.log("✅ [PASS] resolveBaseDay poprawnie rozwiązuje dzień bazowy i zamiany rektorskie.");

// --- Test 15: resolveWeekSchedule — Contract v1 (lessons array z occurrences) ---
console.log("\n-- Test 15: resolveWeekSchedule — Contract v1 z pre-computed occurrences");
const contractV1Schedule = {
  schema_version: 1,
  plan_id: "wmw_sem_7",
  group: "gr. 1",
  lessons: [
    {
      id: "sggw_wmw_1",
      subject: "Badanie zw rzeźnych",
      subject_code: "BZR",
      type: "ćwiczenia",
      teachers: ["dr hab. Kowalski"],
      room: "Klinika Dużych Zwierząt",
      day_of_week: "PON",
      start_time: "08:15",
      end_time: "10:00",
      weeks_count: 15,
      start_date: "2026-10-05",
      occurrences: [
        {
          date: "2026-11-09",
          index: 5,
          total: 15,
          start_time: "08:15",
          end_time: "10:00",
          status: "scheduled"
        }
      ]
    }
  ]
};
const v1WeekResult = engine.resolveWeekSchedule(targetMon, contractV1Schedule);
assert.strictEqual(v1WeekResult["PON"].lessons.length, 1);
assert.strictEqual(v1WeekResult["PON"].lessons[0].przedmiot, "Badanie zw rzeźnych");
assert.strictEqual(v1WeekResult["PON"].lessons[0].sala, "Klinika Dużych Zwierząt");
assert.strictEqual(v1WeekResult["PON"].lessons[0].godziny, "08:15 - 10:00");
assert.strictEqual(v1WeekResult["PON"].lessons[0].meetingNumber, 5);
assert.strictEqual(v1WeekResult["PON"].lessons[0].isActive, true);
console.log("✅ [PASS] resolveWeekSchedule poprawnie obsługuje harmonogramy Contract v1.");

console.log("\n🎉 Wszystkie testy ScheduleEngine zakończone sukcesem (100% PASS)!\n");

