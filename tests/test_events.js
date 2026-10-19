const assert = require("assert");
const path = require("path");
const ROOT_DIR = path.resolve(__dirname, "..");
const EventsService = require(path.join(ROOT_DIR, "web/js/modules/events.js"));

console.log("\n🧪 Running EventsService TDD Tests...\n");

const mockEvents = [
  {
    id: "inauguracja-2026",
    date: "2026-10-01",
    time_start: "11:00",
    time_end: "14:00",
    title: "Uroczysta Inauguracja Roku Akademickiego",
    description: "Uroczyste rozpoczęcie roku akademickiego 2026/2027.",
    location: "Aula Główna UMG",
    url: "https://umg.edu.pl",
    type: "academic",
    badge: "Rektorat",
    icon: "🎓",
    color: "#0d3b66",
    target: {
      mode: "all",
      degree: "all"
    }
  },
  {
    id: "flanki-integracja-2026",
    date: "2026-10-08",
    time_start: "18:00",
    time_end: "22:00",
    title: "Czwartkowe Flanki Integracyjne",
    description: "Tradycyjne spotkanie integracyjne studentów.",
    location: "Polanka Redłowska",
    url: null,
    type: "party",
    badge: "Samorząd",
    icon: "🍻",
    color: "#e63946",
    target: {
      mode: "stacjonarne",
      degree: 1
    }
  }
];

// --- TEST 1: Wczytywanie danych i cache ---
console.log("-- Test 1: loadEvents wczytuje i zapisuje wydarzenia");
const fakeFetchSuccess = async () => ({
  ok: true,
  json: async () => mockEvents
});

EventsService.loaded = false;
EventsService.events = [];

EventsService.loadEvents("mock-url", fakeFetchSuccess).then(async (events) => {
  assert.strictEqual(events.length, 2, "Powinno wczytać 2 wydarzenia");
  assert.strictEqual(EventsService.events.length, 2);

  // Kolejne wywołanie powinno zwrócić z cache bez ponownego fetchowania
  let calledAgain = false;
  const eventsCached = await EventsService.loadEvents("mock-url", async () => {
    calledAgain = true;
    return { ok: true, json: async () => [] };
  });
  assert.strictEqual(calledAgain, false, "Kolejne wywołanie powinno korzystać z cache");
  assert.strictEqual(eventsCached.length, 2);
  console.log("✅ [PASS] loadEvents prawidłowo wczytuje dane i zarządza cache.");

  // --- TEST 2: Pobieranie wydarzeń dla daty ISO ---
  console.log("\n-- Test 2: getEventsForDate i hasEventOnDate");
  const oct1Events = EventsService.getEventsForDate("2026-10-01");
  assert.strictEqual(oct1Events.length, 1, "Powinno znaleźć 1 wydarzenie dla 2026-10-01");
  assert.strictEqual(oct1Events[0].id, "inauguracja-2026");
  assert.strictEqual(EventsService.hasEventOnDate("2026-10-01"), true);

  const emptyDateEvents = EventsService.getEventsForDate("2026-10-02");
  assert.strictEqual(emptyDateEvents.length, 0, "Brak wydarzeń dla 2026-10-02");
  assert.strictEqual(EventsService.hasEventOnDate("2026-10-02"), false);
  console.log("✅ [PASS] getEventsForDate i hasEventOnDate prawidłowo filtrują po dacie ISO.");

  // --- TEST 3: Filtrowanie po trybie i stopniu studiów ---
  console.log("\n-- Test 3: Filtrowanie po kontekście studiów (stacjonarne/niestacjonarne, stopień)");
  const stacjonarneEvents = EventsService.getEventsForDate("2026-10-08", { studyMode: "stacjonarne", degree: 1 });
  assert.strictEqual(stacjonarneEvents.length, 1, "Student stacjonarny 1. stopnia powinien widzieć flanki");

  const nstEvents = EventsService.getEventsForDate("2026-10-08", { studyMode: "niestacjonarne", degree: 1 });
  assert.strictEqual(nstEvents.length, 0, "Student niestacjonarny nie powinien widzieć wydarzenia celowanego do stacjonarnych");

  const degree2Events = EventsService.getEventsForDate("2026-10-08", { studyMode: "stacjonarne", degree: 2 });
  assert.strictEqual(degree2Events.length, 0, "Student 2. stopnia nie powinien widzieć wydarzenia celowanego do 1. stopnia");
  console.log("✅ [PASS] Filtrowanie po kryteriach celowania (target) działa zgodnie ze specyfikacją.");

  // --- TEST 4: Renderowanie karty (.event-card) ---
  console.log("\n-- Test 4: renderEventCard");
  const cardHtml = EventsService.renderEventCard(mockEvents[0]);
  assert.ok(cardHtml.includes("event-card"), "Powinien zawierać klasę .event-card");
  assert.ok(cardHtml.includes("Uroczysta Inauguracja"), "Powinien zawierać tytuł");
  assert.ok(cardHtml.includes("11:00 – 14:00"), "Powinien zawierać godziny");
  assert.ok(cardHtml.includes("Aula Główna UMG"), "Powinien zawierać miejsce");
  assert.ok(cardHtml.includes("Rektorat"), "Powinien zawierać plakietkę");
  assert.ok(cardHtml.includes("data-event-id=\"inauguracja-2026\""), "Powinien zawierać data-event-id");
  console.log("✅ [PASS] renderEventCard poprawnie formatuje HTML karty wydarzenia.");

  // --- TEST 5: Renderowanie sekcji (.day-events-section) ---
  console.log("\n-- Test 5: renderEventsSection (kontrakt pustego DOM)");
  const emptySection = EventsService.renderEventsSection([]);
  assert.strictEqual(emptySection, "", "Dla pustej listy powinien zwrócić pusty ciąg (brak pustych kontenerów w DOM)");

  const nullSection = EventsService.renderEventsSection(null);
  assert.strictEqual(nullSection, "", "Dla null powinien zwrócić pusty ciąg");

  const fullSection = EventsService.renderEventsSection(oct1Events);
  assert.ok(fullSection.includes("day-events-section"), "Powinien zawierać kontener .day-events-section");
  assert.ok(fullSection.includes("Wydarzenia"), "Powinien zawierać nagłówek sekcji");
  assert.ok(fullSection.includes("inauguracja-2026"), "Powinien zawierać kartę wydarzenia");
  console.log("✅ [PASS] renderEventsSection spełnia kontrakt czystego DOM dla pustych dni.");

  // --- TEST 6: getEventById i obsługa modala ---
  console.log("\n-- Test 6: getEventById i obsługa modala");
  const eventFound = EventsService.getEventById("inauguracja-2026");
  assert.strictEqual(eventFound.id, "inauguracja-2026");
  const eventNotFound = EventsService.getEventById("non-existent");
  assert.strictEqual(eventNotFound, null);

  // Mock DOM dla openEventModal / closeEventModal
  let modalShown = false;
  let modalClosed = false;
  const mockDialog = {
    id: "event-details-dialog",
    elements: {},
    querySelector(sel) {
      if (!this.elements[sel]) {
        this.elements[sel] = {
          textContent: "",
          className: "",
          href: "",
          classList: {
            classes: new Set(),
            add(c) { this.classes.add(c); },
            remove(c) { this.classes.delete(c); },
            contains(c) { return this.classes.has(c); }
          }
        };
      }
      return this.elements[sel];
    },
    showModal() { modalShown = true; },
    close() { modalClosed = true; }
  };

  global.document = {
    getElementById(id) {
      if (id === "event-details-dialog") return mockDialog;
      return null;
    },
    activeElement: { focus() {} }
  };

  EventsService.openEventModal("inauguracja-2026");
  assert.strictEqual(modalShown, true, "openEventModal powinien wywołać dialog.showModal()");
  assert.strictEqual(mockDialog.querySelector("#event-dialog-title").textContent, "Uroczysta Inauguracja Roku Akademickiego");
  assert.strictEqual(mockDialog.querySelector("#event-dialog-badge").textContent, "Rektorat");
  assert.strictEqual(mockDialog.querySelector("#event-dialog-link-text").textContent, "Więcej informacji");

  // Test z własnym tekstem przycisku (button_text)
  EventsService.events.push({
    id: "test-custom-btn",
    date: "2026-10-01",
    title: "Test z przyciskiem",
    url: "https://example.com",
    button_text: "Otwórz mapę"
  });
  EventsService.openEventModal("test-custom-btn");
  assert.strictEqual(mockDialog.querySelector("#event-dialog-link-text").textContent, "Otwórz mapę");

  EventsService.closeEventModal();
  assert.strictEqual(modalClosed, true, "closeEventModal powinien wywołać dialog.close()");

  // Test bezpieczeństwa URL: odrzucenie javascript: i nieobsługiwanych schematów
  EventsService.events.push({
    id: "test-xss-url",
    date: "2026-10-01",
    title: "Atak XSS",
    url: "javascript:alert(1)"
  });
  EventsService.openEventModal("test-xss-url");
  const footerEl = mockDialog.querySelector("#event-dialog-footer");
  const linkEl = mockDialog.querySelector("#event-dialog-link");
  assert.strictEqual(footerEl.classList.contains("hidden"), true, "Link z javascript: powinien ukryć footer");
  assert.notStrictEqual(linkEl.href, "javascript:alert(1)", "Link z javascript: nie może być przypisany do href");

  console.log("✅ [PASS] getEventById oraz openEventModal / closeEventModal działają poprawnie (w tym obsługa button_text i ochrona URL).");

  // --- TEST 7: Presety motywów party i flanki ---
  console.log("\n-- Test 7: Rozróżnienie presetów party (🎉, fiolet) i flanki (🍻, złoty)");
  const partyTheme = EventsService.getThemeDetails({ type: "party" });
  assert.strictEqual(partyTheme.icon, "🎉", "Preset party powinien mieć ikonę konfetti 🎉");
  assert.strictEqual(partyTheme.badge, "Impreza", "Preset party powinien mieć badge Impreza");
  assert.strictEqual(partyTheme.color, "#7c3aed", "Preset party powinien mieć kolor fioletowy #7c3aed");

  const flankiTheme = EventsService.getThemeDetails({ type: "flanki" });
  assert.strictEqual(flankiTheme.icon, "🍻", "Preset flanki powinien mieć ikonę piwa 🍻");
  assert.strictEqual(flankiTheme.badge, "Flanki", "Preset flanki powinien mieć badge Flanki");
  assert.strictEqual(flankiTheme.color, "#d97706", "Preset flanki powinien mieć kolor złoty #d97706");
  console.log("✅ [PASS] Presety party i flanki są prawidłowo rozdzielone.");

  console.log("\n🎉 Wszystkie testy EventsService zakończone sukcesem (100% PASS)!\n");
}).catch((err) => {
  console.error("❌ [FAIL]", err);
  process.exit(1);
});
