/**
 * test_cross_reference.js
 * Test-driven verification suite for CrossRef module (Engine & DataService)
 * 
 * Run with: node test_cross_reference.js
 */

const assert = require("assert");

console.log("\n🧪 Running CrossRef Unit Tests (Phase 1 TDD)...\n");

const path = require("path");
const ROOT_DIR = path.resolve(__dirname, "..");
const ScheduleEngine = require(path.join(ROOT_DIR, "web/js/schedule-engine.js"));
const academicCalendar = require(path.join(ROOT_DIR, "tenants/umg/wn/academic_calendar.json"));
const engine = ScheduleEngine.create(academicCalendar);

let CrossRef;
try {
  CrossRef = require(path.join(ROOT_DIR, "web/js/modules/cross-reference.js"));
} catch (e) {
  CrossRef = null;
}

// Hermetic fixture for cross_reference data
const fixtureCrossRefData = {
  teachers: {
    "Boniewicz-Szmyt Katarzyna": [
      {
        day: "PON",
        slot: 1,
        hours: "08:00 - 09:30",
        subject: "Fizyka I",
        raw_subject: "FIZ1",
        room: "114",
        groups: ["GR 1", "GR 2"],
        plan_id: "plan_wn_1",
        plan_name: "Nawigacja 1",
        dates: ["2026-10-05", "2026-10-12"]
      }
    ],
    "Wawrzyńska Aleksandra": [
      {
        day: "WT",
        slot: 2,
        hours: "09:45 - 11:15",
        subject: "Matematyka",
        room: "2",
        groups: ["GR 3"],
        plan_id: "plan_wn_1",
        plan_name: "Nawigacja 1",
        dates: ["2026-10-06", "2026-10-13"]
      }
    ],
    "Daniszewska Małgorzata": [
      {
        day: "ŚR",
        slot: 3,
        hours: "10:15 - 11:45",
        subject: "Chemia",
        room: "114",
        groups: ["GR 1"],
        plan_id: "plan_wn_1",
        plan_name: "Nawigacja 1",
        dates: ["2026-10-07", "2026-11-04", "2026-11-13"]
      }
    ]
  },
  rooms: {
    "114": {
      "PON": [
        {
          slot: 1,
          hours: "08:00 - 09:30",
          subject: "Fizyka I",
          teacher: "Boniewicz-Szmyt Katarzyna",
          groups: ["GR 1"],
          plan_id: "plan_wn_1",
          plan_name: "Nawigacja 1",
          dates: ["2026-10-05", "2026-10-12"]
        }
      ],
      "ŚR": [
        {
          slot: 3,
          hours: "10:15 - 11:45",
          subject: "Chemia",
          teacher: "Daniszewska Małgorzata",
          groups: ["GR 1"],
          plan_id: "plan_wn_1",
          plan_name: "Nawigacja 1",
          dates: ["2026-10-07", "2026-11-04", "2026-11-13"]
        }
      ],
      "SOB": [
        {
          slot: 2,
          hours: "09:45 - 11:15",
          subject: "Nawigacja Zaoczna",
          teacher: "Boniewicz-Szmyt Katarzyna",
          groups: ["NZ 1"],
          plan_id: "plan_wn_z",
          plan_name: "Nawigacja Zaoczna",
          dates: ["2026-10-10"]
        }
      ]
    },
    "114a": {
      "PON": []
    },
    "2": {
      "WT": [
        {
          slot: 2,
          hours: "09:45 - 11:15",
          subject: "Matematyka",
          teacher: "Wawrzyńska Aleksandra",
          groups: ["GR 3"],
          plan_id: "plan_wn_1",
          plan_name: "Nawigacja 1",
          dates: ["2026-10-06"]
        }
      ]
    },
    "P1": {
      "PON": []
    },
    "Pływalnia": {
      "PON": []
    }
  },
  subjects: {
    "Fizyka I": {
      subject: "Fizyka I",
      raw_variants: ["FIZ1", "Fizyka 1"],
      teachers: ["Boniewicz-Szmyt Katarzyna"],
      plans: [{ plan_id: "plan_wn_1", plan_name: "Nawigacja 1", groups: ["GR 1", "GR 2"] }]
    },
    "Matematyka": {
      subject: "Matematyka",
      raw_variants: ["MAT", "Matematyka ogólna"],
      teachers: ["Wawrzyńska Aleksandra"],
      plans: [{ plan_id: "plan_wn_1", plan_name: "Nawigacja 1", groups: ["GR 3"] }]
    }
  },
  room_list: ["114", "114a", "2", "P1", "Pływalnia"]
};

// --- Test 1: Module exports and structure ---
console.log("-- Test 1: Eksport modułu i stałych");
assert.ok(CrossRef, "Moduł CrossRef powinien być dostępny");
assert.ok(CrossRef.Engine, "CrossRef.Engine powinien być obiektem");
assert.ok(CrossRef.DataService, "CrossRef.DataService powinien być obiektem");
assert.ok(CrossRef.UI, "CrossRef.UI powinien być obiektem");
assert.ok(Array.isArray(CrossRef.Engine.STANDARD_SLOTS), "STANDARD_SLOTS powinien być tablicą");
assert.strictEqual(CrossRef.Engine.STANDARD_SLOTS.length, 7, "STANDARD_SLOTS powinien mieć 7 slotów");
console.log("✅ [PASS] Moduł eksportuje wymagane struktury.");

// --- Test 2: escapeHtml ---
console.log("\n-- Test 2: escapeHtml");
assert.strictEqual(CrossRef.Engine.escapeHtml(null), "", "null zwraca pusty string");
assert.strictEqual(CrossRef.Engine.escapeHtml(undefined), "", "undefined zwraca pusty string");
assert.strictEqual(CrossRef.Engine.escapeHtml(0), "0", "Liczba 0 zwraca '0', nie pusty string");
assert.strictEqual(CrossRef.Engine.escapeHtml("0"), "0", "Ciąg '0' zwraca '0'");
assert.strictEqual(CrossRef.Engine.escapeHtml('<script>alert("xss")</script>'), "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
assert.strictEqual(CrossRef.Engine.escapeHtml("Tom & Jerry 'cat'"), "Tom &amp; Jerry &#039;cat&#039;");
console.log("✅ [PASS] escapeHtml poprawnie sanityzuje tekst i zachowuje 0.");

// --- Test 3: normalizeQuery ---
console.log("\n-- Test 3: normalizeQuery");
assert.strictEqual(CrossRef.Engine.normalizeQuery("Wawrzyńska"), "wawrzynska");
assert.strictEqual(CrossRef.Engine.normalizeQuery("Łukasz"), "lukasz");
assert.strictEqual(CrossRef.Engine.normalizeQuery("ŚRÓDMIEŚCIE"), "srodmiescie");
assert.strictEqual(CrossRef.Engine.normalizeQuery(null), "");
console.log("✅ [PASS] normalizeQuery poprawnie usuwa diakrytyki i normalizuje wielkość liter.");

// --- Test 4: search ---
console.log("\n-- Test 4: search (wyszukiwarka)");
// Zapytanie < 2 znaki
const resShort = CrossRef.Engine.search(fixtureCrossRefData, "w");
assert.deepStrictEqual(resShort.teachers, []);
assert.deepStrictEqual(resShort.rooms, []);
assert.deepStrictEqual(resShort.subjects, []);

// Normalizacja polskich znaków w nazwisku
const resWaw = CrossRef.Engine.search(fixtureCrossRefData, "wawrzynska");
assert.strictEqual(resWaw.teachers.length, 1);
assert.strictEqual(resWaw.teachers[0].name, "Wawrzyńska Aleksandra");

const resBon = CrossRef.Engine.search(fixtureCrossRefData, "boniewicz");
assert.strictEqual(resBon.teachers.length, 1);
assert.strictEqual(resBon.teachers[0].name, "Boniewicz-Szmyt Katarzyna");

// Case-insensitive i dopasowanie przedmiotów
const resFiz = CrossRef.Engine.search(fixtureCrossRefData, "FIZYKA");
assert.strictEqual(resFiz.subjects.length, 1);
assert.strictEqual(resFiz.subjects[0].name, "Fizyka I");

// Wyszukiwanie sal: dopasowanie substringowe (114 zwraca 114 i 114a)
const resRoom = CrossRef.Engine.search(fixtureCrossRefData, "114");
assert.strictEqual(resRoom.rooms.length, 2);
assert.deepStrictEqual(resRoom.rooms.map(r => r.room).sort(), ["114", "114a"].sort());

// Limit wyników na kategorię (zapytanie >= 2 znaki z limitem 1)
const resLimit = CrossRef.Engine.search(fixtureCrossRefData, "114", 1);
assert.strictEqual(resLimit.rooms.length, 1);
console.log("✅ [PASS] search działa poprawnie z normalizacją diakrytyków i limitami.");

// --- Test 5: findFreeRooms ---
console.log("\n-- Test 5: findFreeRooms (dostępność sal)");

// Poniedziałek 05.10.2026: sala 114 ma zajęcia 08:00 - 09:30
const resBusy = CrossRef.Engine.findFreeRooms(fixtureCrossRefData, {
  dateISO: "2026-10-05", // PON
  queryRange: { start: 8 * 60, end: 9 * 60 + 30 }, // 08:00 - 09:30
  scheduleEngine: engine
});
const room114Busy = resBusy.find(r => r.room === "114");
assert.ok(room114Busy, "Sala 114 powinna być w wynikach");
assert.strictEqual(room114Busy.isFree, false, "Sala 114 w trakcie zajęć powinna być zajęta");
assert.ok(room114Busy.occupyingClass, "occupyingClass powinno zawierać dane zajęć");
assert.strictEqual(room114Busy.occupyingClass.subject, "Fizyka I");

// Po zajęciach: 10:00 - 11:30 sala 114 jest wolna
const resFree = CrossRef.Engine.findFreeRooms(fixtureCrossRefData, {
  dateISO: "2026-10-05", // PON
  queryRange: { start: 10 * 60, end: 11 * 60 + 30 },
  scheduleEngine: engine
});
const room114Free = resFree.find(r => r.room === "114");
assert.strictEqual(room114Free.isFree, true, "Sala 114 po zajęciach powinna być wolna");
assert.strictEqual(room114Free.occupyingClass, null);

// Dzień wolny od zajęć: 11.11.2026 (Święto Niepodległości) -> 100% sal wolnych
const resHoliday = CrossRef.Engine.findFreeRooms(fixtureCrossRefData, {
  dateISO: "2026-11-11",
  queryRange: { start: 10 * 60 + 15, end: 11 * 60 + 45 },
  scheduleEngine: engine
});
assert.ok(resHoliday.length > 0);
assert.ok(resHoliday.every(r => r.isFree === true && r.occupyingClass === null), "W święto 100% sal powinno być wolnych");

// Niedziela (2026-10-11) -> 100% sal wolnych
const resSunday = CrossRef.Engine.findFreeRooms(fixtureCrossRefData, {
  dateISO: "2026-10-11",
  queryRange: { start: 10 * 60, end: 11 * 60 },
  scheduleEngine: engine
});
assert.ok(resSunday.every(r => r.isFree === true), "W niedzielę 100% sal powinno być wolnych");

// Zamiana dnia: Piątek 13.11.2026 realizuje plan ze środy (ŚR)
// Sala 114 w środę ma chemię 10:15 - 11:45
const resSwap = CrossRef.Engine.findFreeRooms(fixtureCrossRefData, {
  dateISO: "2026-11-13", // Piątek z zamianą na ŚR
  queryRange: { start: 10 * 60 + 30, end: 11 * 60 },
  scheduleEngine: engine
});
const room114Swap = resSwap.find(r => r.room === "114");
assert.strictEqual(room114Swap.isFree, false, "W piątek z zamianą na środę sala 114 powinna być zajęta środową chemią");
assert.strictEqual(room114Swap.occupyingClass.subject, "Chemia");

// Sobota (2026-10-10): Studia niestacjonarne w sali 114 (09:45 - 11:15)
const resSat = CrossRef.Engine.findFreeRooms(fixtureCrossRefData, {
  dateISO: "2026-10-10", // SOB
  queryRange: { start: 10 * 60, end: 10 * 60 + 30 },
  scheduleEngine: engine
});
const room114Sat = resSat.find(r => r.room === "114");
assert.strictEqual(room114Sat.isFree, false, "Sala 114 w sobotę w trakcie zajęć zaocznych jest zajęta");

// Filtr substringowy sal (filterText = 'P' dopasowuje P1 i Pływalnia)
const resFilterP = CrossRef.Engine.findFreeRooms(fixtureCrossRefData, {
  dateISO: "2026-10-05",
  queryRange: { start: 8 * 60, end: 9 * 60 },
  scheduleEngine: engine,
  filterText: "P"
});
assert.deepStrictEqual(resFilterP.map(r => r.room).sort(), ["P1", "Pływalnia"].sort());

// Determinizm "Teraz" z czasem UTC (2026-11-04T09:20:00Z = 10:20 czasu polskiego, Środa)
// Sala 114 ma w środę zajęcia 10:15 - 11:45 (615 - 705 min). 10:20 to 620 min, więc pokrywa punkt.
const resNow = CrossRef.Engine.findFreeRooms(fixtureCrossRefData, {
  now: new Date("2026-11-04T09:20:00Z"),
  scheduleEngine: engine
});
const room114Now = resNow.find(r => r.room === "114");
assert.strictEqual(room114Now.isFree, false, "W trybie 'Teraz' o 10:20 sala 114 ma trwające zajęcia");
assert.strictEqual(room114Now.occupyingClass.subject, "Chemia");
console.log("✅ [PASS] findFreeRooms poprawnie kalkuluje dostępność, zamiany dni, święta i tryb 'Teraz'.");

// --- Test 6: renderSlotCard ---
console.log("\n-- Test 6: renderSlotCard");
const cardHtml = CrossRef.Engine.renderSlotCard({
  hours: "08:00 - 09:30",
  subject: '<img src=x onerror=alert(1)> Biologia & Chemia',
  teacher: 'Kowalski "Jan"',
  room: "114",
  groups: ["GR 1", "GR 2"],
  co_ile: 2,
  od_tyg: 2,
  polowa_sem: 1
}, "room");

assert.ok(cardHtml.includes("modal-slot-item"), "Karta powinna zawierać klasę modal-slot-item");
assert.ok(!cardHtml.includes("<img src=x"), "Kod HTML w nazwie przedmiotu musi być zescapowany");
assert.ok(cardHtml.includes("&lt;img src=x"), "Encje HTML powinny być obecne w wyniku");
assert.ok(cardHtml.includes("1. poł. sem."), "Plakietka połowy semestru powinna być wyrenderowana");
assert.ok(cardHtml.includes("co 2 tyg (od 2 tyg)"), "Plakietka cyklu powinna być wyrenderowana");
assert.ok(cardHtml.includes("modal-group-chip"), "Grupy powinny być wyrenderowane jako chipy");
console.log("✅ [PASS] renderSlotCard generuje bezpieczny HTML z prawidłowymi klasami.");

// --- Test 7: DataService (Cache, mockowanie storage, fetch i onUpdate) ---
console.log("\n-- Test 7: DataService (Cache, unieważnianie, fallback i onUpdate)");

(async () => {
  let storageStore = {};
  const mockStorage = {
    getItem: (key) => storageStore[key] || null,
    setItem: (key, val) => { storageStore[key] = String(val); },
    removeItem: (key) => { delete storageStore[key]; }
  };

  const freshNetworkData = {
    ...fixtureCrossRefData,
    generated_at: "2026-09-24T20:00:00Z"
  };

  const mockFetch = async (url) => {
    return {
      ok: true,
      json: async () => freshNetworkData
    };
  };

  // 7a: Brak cache -> pobranie sieciowe
  const data1 = await CrossRef.DataService.load({
    storage: mockStorage,
    fetchFn: mockFetch
  });
  assert.ok(data1, "DataService powinien zwrócić dane z sieci");
  assert.strictEqual(data1.generated_at, "2026-09-24T20:00:00Z");

  // Sprawdzenie, czy zapisano w storage z poprawnym schematem
  const cachedRaw = mockStorage.getItem("umg_cross_ref_cache");
  assert.ok(cachedRaw, "Cache powinien zostać zapisany w storage");
  const cachedParsed = JSON.parse(cachedRaw);
  assert.strictEqual(cachedParsed.schemaVersion, 1, "schemaVersion powinien wynosić 1");
  assert.ok(cachedParsed.cachedAt > 0, "cachedAt powinien być timestampem");

  // 7b: Istniejący cache -> natychmiastowy zwrot z cache + fetch w tle z onUpdate
  let onUpdateCalled = false;
  let updateDataReceived = null;

  const mockFetchUpdating = async (url) => {
    return {
      ok: true,
      json: async () => ({
        ...freshNetworkData,
        generated_at: "2026-09-24T21:00:00Z"
      })
    };
  };

  const dataCached = await CrossRef.DataService.load({
    storage: mockStorage,
    fetchFn: mockFetchUpdating,
    onUpdate: (fresh) => {
      onUpdateCalled = true;
      updateDataReceived = fresh;
    }
  });

  assert.strictEqual(dataCached.generated_at, "2026-09-24T20:00:00Z", "Powinno zwrócić wersję z cache");

  // Czekamy na asynchroniczny fetch w tle
  await new Promise(r => setTimeout(r, 50));
  assert.strictEqual(onUpdateCalled, true, "Callback onUpdate powinien zostać wywołany");
  assert.strictEqual(updateDataReceived.generated_at, "2026-09-24T21:00:00Z", "onUpdate powinno dostać świeże dane");

  // Storage powinno mieć zaktualizowaną wersję
  const updatedParsed = JSON.parse(mockStorage.getItem("umg_cross_ref_cache"));
  assert.strictEqual(updatedParsed.data.generated_at, "2026-09-24T21:00:00Z");

  // 7c: Uszkodzony cache (niepoprawny JSON lub schemaVersion !== 1)
  mockStorage.setItem("umg_cross_ref_cache", "corrupted-json{}}");
  const dataRecovered = await CrossRef.DataService.load({
    storage: mockStorage,
    fetchFn: mockFetch
  });
  assert.ok(dataRecovered, "DataService powinien zignorować uszkodzony cache i pobrać świeże dane");

  mockStorage.setItem("umg_cross_ref_cache", JSON.stringify({ schemaVersion: 999, data: {} }));
  const dataWrongSchema = await CrossRef.DataService.load({
    storage: mockStorage,
    fetchFn: mockFetch
  });
  assert.strictEqual(dataWrongSchema.generated_at, "2026-09-24T20:00:00Z", "Nieaktualny schemaVersion powinien zostać zignorowany");

  console.log("✅ [PASS] DataService poprawnie zarządza pamięcią cache, wersjonowaniem i odświeżaniem w tle.");

  // --- Test 8: CrossRef.UI (Inicjalizacja, a11y, przywracanie fokusu, modale i wyszukiwarka) ---
  console.log("\n-- Test 8: CrossRef.UI (a11y, modale i wyszukiwarka w środowisku kontrolowanym)");

  function createMockElement(id = "", initialClasses = []) {
    const classes = new Set(initialClasses);
    return {
      id,
      textContent: "",
      innerHTML: "",
      value: "",
      style: {},
      dataset: {},
      classList: {
        contains: (c) => classes.has(c),
        add: (c) => classes.add(c),
        remove: (c) => classes.delete(c)
      },
      attributes: {},
      setAttribute: function(k, v) { this.attributes[k] = String(v); },
      getAttribute: function(k) { return this.attributes[k] || null; },
      querySelector: () => null,
      querySelectorAll: () => [],
      focusCalled: false,
      focus: function() { this.focusCalled = true; },
      open: false,
      showModal: function() { this.open = true; },
      close: function() { this.open = false; },
      getBoundingClientRect: function() {
        return { top: 100, bottom: 400, left: 100, right: 400, width: 300, height: 300 };
      },
      listeners: {},
      addEventListener: function(event, fn) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(fn);
      },
      triggerClick: function(event) {
        const handlers = this.listeners["click"] || [];
        handlers.forEach(h => h(event));
      }
    };
  }

  const mockModal = createMockElement("cross-modal", ["modal", "hidden"]);
  const mockTitle = createMockElement("cross-modal-title");
  const mockBadge = createMockElement("cross-modal-badge");
  const mockBody = createMockElement("cross-modal-body");
  const mockSearchInput = createMockElement("search-input");
  const mockSearchResults = createMockElement("search-results", ["hidden"]);
  const mockClearBtn = createMockElement("clear-search-btn", ["hidden"]);
  const mockTriggerBtn = createMockElement("trigger-btn");

  CrossRef.UI.init({
    elements: {
      modal: mockModal,
      title: mockTitle,
      badge: mockBadge,
      body: mockBody,
      searchInput: mockSearchInput,
      searchResults: mockSearchResults,
      clearSearchBtn: mockClearBtn
    },
    scheduleEngine: engine
  });

  // Wstrzykujemy załadowane dane do cache UI
  CrossRef.UI.cachedData = fixtureCrossRefData;

  // 8a: Otwarcie modalu i atrybuty a11y
  CrossRef.UI.openModal("Test tytuł", "Test badge", "<p>Treść testowa</p>", mockTriggerBtn);
  assert.strictEqual(mockTitle.textContent, "Test tytuł");
  assert.strictEqual(mockBadge.textContent, "Test badge");
  assert.strictEqual(mockBody.innerHTML, "<p>Treść testowa</p>");
  assert.strictEqual(mockModal.classList.contains("hidden"), false, "Klasa hidden powinna zostać usunięta");
  assert.strictEqual(mockModal.getAttribute("aria-hidden"), "false");
  assert.strictEqual(mockModal.open, true, "showModal() powinien ustawić open = true");

  // 8b: Zamknięcie modalu i przywrócenie fokusu
  CrossRef.UI.closeModal();
  assert.strictEqual(mockModal.classList.contains("hidden"), true, "Klasa hidden powinna zostać dodana");
  assert.strictEqual(mockModal.getAttribute("aria-hidden"), "true");
  assert.strictEqual(mockModal.open, false, "close() powinien ustawić open = false");
  assert.strictEqual(mockTriggerBtn.focusCalled, true, "Fokus powinien powrócić do elementu wywołującego");

  // 8c: Wyszukiwarka live (handleSearch & clearSearch)
  await CrossRef.UI.handleSearch("boniewicz");
  assert.strictEqual(mockSearchResults.classList.contains("hidden"), false);
  assert.ok(mockSearchResults.innerHTML.includes("Boniewicz-Szmyt Katarzyna"), "Wyniki powinny zawierać dopasowanego wykładowcę");
  assert.strictEqual(mockClearBtn.classList.contains("hidden"), false, "Przycisk czyszczenia powinien być widoczny");

  // Puste zapytanie czyści wyniki
  await CrossRef.UI.handleSearch("a"); // < 2 znaki
  assert.strictEqual(mockSearchResults.classList.contains("hidden"), true);
  assert.strictEqual(mockClearBtn.classList.contains("hidden"), true);

  // Clear search
  mockSearchInput.value = "test";
  CrossRef.UI.clearSearch();
  assert.strictEqual(mockSearchInput.value, "");
  assert.strictEqual(mockSearchResults.classList.contains("hidden"), true);

  // 8d: openFreeRooms z selektorem daty i szybkim filtrem
  await CrossRef.UI.openFreeRooms({
    dateISO: "2026-10-05",
    slot: "08:00 - 09:30"
  });
  assert.strictEqual(mockTitle.textContent, "Dostępność sal");
  assert.strictEqual(mockBadge.textContent, "🔎 Wolne sale");
  assert.ok(mockBody.innerHTML.includes('id="fr-date-input"'), "Modal powinien zawierać date picker");
  assert.ok(mockBody.innerHTML.includes('id="fr-today-btn"'), "Modal powinien zawierać przycisk Dziś");
  assert.ok(mockBody.innerHTML.includes('id="fr-tomorrow-btn"'), "Modal powinien zawierać przycisk Jutro");
  assert.ok(mockBody.innerHTML.includes('id="fr-search-input"'), "Modal powinien zawierać pole szybkiego filtra sal");
  assert.ok(mockBody.innerHTML.includes('Sala 114'), "Modal powinien wyświetlać listę sal");

  // 8e: Weryfikacja deklaracji HTML <dialog id="cross-modal"> (Issue #9)
  const fs = require("fs");
  const indexHtml = fs.readFileSync(path.join(ROOT_DIR, "web/index.html"), "utf-8");
  assert.ok(
    /<dialog id="cross-modal"[^>]*closedby="any"/.test(indexHtml),
    "cross-modal powinien być tagiem <dialog> z atrybutem closedby='any'"
  );
  const crossModalHtml = indexHtml.match(/<dialog id="cross-modal"[\s\S]*?<\/dialog>/);
  assert.ok(crossModalHtml && !crossModalHtml[0].includes('class="modal-backdrop"'), "cross-modal nie powinien zawierać zbędnego .modal-backdrop");

  // 8f: Nawigacja między widokami (sala -> wykładowca) bez utraty referencji do triggerElement
  const externalOpener = createMockElement("timetable-badge");
  CrossRef.UI.openModal("Sala 114", "Sala", "<p>Plan sali</p>", externalOpener);
  assert.strictEqual(mockModal.open, true);
  assert.strictEqual(CrossRef.UI.previousFocusedElement, externalOpener);

  // Nawigacja w głąb (np. kliknięcie wykładowcy) nie nadpisuje triggerElement
  CrossRef.UI.openModal("Boniewicz-Szmyt Katarzyna", "Wykładowca", "<p>Plan wykładowcy</p>");
  assert.strictEqual(mockTitle.textContent, "Boniewicz-Szmyt Katarzyna");
  assert.strictEqual(mockModal.open, true, "Modal powinien pozostać otwarty");
  assert.strictEqual(CrossRef.UI.previousFocusedElement, externalOpener, "Trigger powinien nadal wskazywać externalOpener");

  CrossRef.UI.closeModal();
  assert.strictEqual(mockModal.open, false);
  assert.strictEqual(externalOpener.focusCalled, true, "Fokus powinien powrócić do pierwotnego triggerElement");

  // 8g: Light-dismiss poprzez kliknięcie w tło dialogu
  CrossRef.UI.openModal("Test tła", "Test", "<p>Tło</p>");
  assert.strictEqual(mockModal.open, true);
  mockModal.triggerClick({ clientX: 20, clientY: 20, target: mockModal });
  assert.strictEqual(mockModal.open, false, "Kliknięcie w tło powinno zamknąć modal");

  console.log("✅ [PASS] CrossRef.UI poprawnie orkiestruje natywny <dialog> (Issue #9), a11y, date picker i wyszukiwarkę.");

  console.log("\n🎉 Wszystkie testy CrossRef zakończone sukcesem (100% PASS)!\n");
})();
