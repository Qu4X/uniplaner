const assert = require("assert");
const path = require("path");
const LessonHiding = require(path.join(__dirname, "../web/js/modules/lesson-hiding.js"));

console.log("\n🧪 Running LessonHiding Module Tests...\n");

// Mock localStorage
let storage = {};
global.localStorage = {
  getItem: (key) => (key in storage ? storage[key] : null),
  setItem: (key, val) => {
    storage[key] = String(val);
  },
  removeItem: (key) => {
    delete storage[key];
  },
  clear: () => {
    storage = {};
  }
};

// Test 1: isHideableLesson — Contract v1 hideable flag & legacy UMG simulator fallback
console.log("-- Test 1: isHideableLesson (Contract v1 hideable + legacy UMG fallback)");
{
  assert.strictEqual(LessonHiding.isHideableLesson({ id: "l1", subject: "Dobrostan zwierząt", hideable: true }), true);
  assert.strictEqual(LessonHiding.isHideableLesson({ id: "l2", subject: "Anatomia", hideable: false }), false);
  assert.strictEqual(LessonHiding.isHideableLesson({ przedmiot: "Manewrowanie Statkiem", sala: "102" }), true);
  assert.strictEqual(LessonHiding.isHideableLesson({ przedmiot: "Manewrowanie Statkiem", sala: "Aula" }), false);
  console.log("✅ [PASS] isHideableLesson prawidłowo rozpoznaje zajęcia ukrywalne.");
}

// Test 2: getLessonSlotKey — Contract v1 deterministic ID vs legacy composite key
console.log("\n-- Test 2: getLessonSlotKey");
{
  const contractLesson = { id: "a1b2c3d4e5f60123", subject: "Fakultet A", hideable: true };
  assert.strictEqual(LessonHiding.getLessonSlotKey(contractLesson, "MON"), "a1b2c3d4e5f60123");

  const legacyLesson = {
    przedmiot: "Manewrowanie Statkiem",
    godziny: "08:00 - 09:30",
    sala: "102",
    prowadzacy: "Kowalski",
    data_start: "2026-10-05"
  };
  assert.strictEqual(
    LessonHiding.getLessonSlotKey(legacyLesson, "PON"),
    "PON__Manewrowanie Statkiem__08:00 - 09:30__102__Kowalski__2026-10-05"
  );
  console.log("✅ [PASS] getLessonSlotKey obsługuje deterministyczne ID Kontraktu v1 oraz klucze legacy.");
}

// Test 3: Tenant-prefixed localStorage keys & one-time migration from legacy key
console.log("\n-- Test 3: Prefiks ${tenant}_ w localStorage oraz migracja kluczy legacy dla umg_wn");
{
  global.localStorage.clear();

  // Symulacja starego zapisu bez prefiksu tenanta
  storage["planwn_hidden_slots_557_GR__1"] = JSON.stringify(["slot_legacy_1"]);

  const migrated = LessonHiding.loadHiddenLessonSlots("557", "GR. 1", "umg_wn");
  assert.strictEqual(migrated.has("slot_legacy_1"), true, "Powinno wczytać ze starego klucza dla umg_wn");
  assert.strictEqual(
    storage["umg_wn_hidden_slots_557_GR__1"],
    JSON.stringify(["slot_legacy_1"]),
    "Powinno zmigrować klucz do umg_wn_hidden_slots_..."
  );

  // Izolacja innego tenanta (sggw_weta nie widzi legacy klucza UMG)
  const sggwSlots = LessonHiding.loadHiddenLessonSlots("557", "GR. 1", "sggw_weta");
  assert.strictEqual(sggwSlots.size, 0, "Inny tenant nie powinien dziedziczyć klucza legacy UMG");

  // Zapis dla sggw_weta używa wyłącznie klucza z prefiksem sggw_weta_
  LessonHiding.saveHiddenLessonSlots("wmw_sem_7", "gr. 1", new Set(["elective_1"]), "sggw_weta");
  assert.strictEqual(storage["sggw_weta_hidden_slots_wmw_sem_7_gr__1"], JSON.stringify(["elective_1"]));
  assert.strictEqual(storage["planwn_hidden_slots_wmw_sem_7_gr__1"], undefined);
  console.log("✅ [PASS] Izolacja localStorage między tenantami i migracja dla umg_wn działają poprawnie.");
}

// Test 4: getElectiveLessons & applyBulkElectivesSelection (masowy wybór fakultetów)
console.log("\n-- Test 4: getElectiveLessons oraz applyBulkElectivesSelection");
{
  global.localStorage.clear();
  const mockSchedule = {
    schema_version: 1,
    lessons: [
      { id: "lec_1", subject: "Chirurgia ogólna", form: "lecture", hideable: false, day_of_week: "MON" },
      { id: "elec_1", subject: "Choroby gadów", form: "elective", hideable: true, day_of_week: "WED" },
      { id: "elec_2", subject: "Choroby ptaków", form: "elective", hideable: true, day_of_week: "WED" }
    ]
  };

  const electives = LessonHiding.getElectiveLessons(mockSchedule);
  assert.strictEqual(electives.length, 2);

  const mockAppState = {
    tenantId: "sggw_weta",
    selectedPlanId: "wmw_sem_7",
    selectedGroup: "gr. 1",
    hiddenLessonSlots: new Set()
  };

  // Student wybiera tylko elec_1 -> elec_2 ma zostać ukryty
  LessonHiding.applyBulkElectivesSelection(mockSchedule, new Set(["elec_1"]), mockAppState);
  assert.strictEqual(mockAppState.hiddenLessonSlots.has("elec_1"), false);
  assert.strictEqual(mockAppState.hiddenLessonSlots.has("elec_2"), true);

  const persisted = LessonHiding.loadHiddenLessonSlots("wmw_sem_7", "gr. 1", "sggw_weta");
  assert.strictEqual(persisted.has("elec_2"), true);
  assert.strictEqual(persisted.has("elec_1"), false);
  console.log("✅ [PASS] Masowy wybór fakultetów (applyBulkElectivesSelection) działa poprawnie.");
}

// Test 5: Polska odmiana liczebników w formatHiddenCount
console.log("\n-- Test 5: formatHiddenCount");
{
  assert.strictEqual(LessonHiding.formatHiddenCount(1), "1 ukryty termin zajęć");
  assert.strictEqual(LessonHiding.formatHiddenCount(3), "3 ukryte terminy zajęć");
  assert.strictEqual(LessonHiding.formatHiddenCount(5), "5 ukrytych terminów zajęć");
  assert.strictEqual(LessonHiding.formatHiddenCount(12), "12 ukrytych terminów zajęć");
  assert.strictEqual(LessonHiding.formatHiddenCount(22), "22 ukryte terminy zajęć");
  console.log("✅ [PASS] Odmiana liczebników w formatHiddenCount działa poprawnie.\n");
}
