/**
 * tests/test_portal.js — Testy jednostkowe dla modułu logiki portalu głównego (PortalDomain).
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { PortalDomain, LAST_VISITED_KEY } = require("../portal/portal.js");

console.log("🧪 Running Portal Module Tests...\n");

// Mockowe dane tenantów
const mockTenants = [
  {
    tenant_id: "umg_wn",
    path: "umg/wn",
    institution: "UMG",
    institution_full: "Uniwersytet Morski w Gdyni (UMG)",
    faculty: "WN",
    faculty_full: "Wydział Nawigacyjny",
    name: "Uniwersytet Morski w Gdyni — Wydział Nawigacyjny",
    plugin_version: "3.11.0",
    plugin_author: "Społeczność studentów WN",
    url: "./umg/wn/"
  },
  {
    tenant_id: "sggw_wmw",
    path: "sggw/wmw",
    institution: "SGGW",
    institution_full: "Szkoła Główna Gospodarstwa Wiejskiego w Warszawie (SGGW)",
    faculty: "WMW",
    faculty_full: "Wydział Medycyny Weterynaryjnej",
    name: "Szkoła Główna Gospodarstwa Wiejskiego — Wydział Medycyny Weterynaryjnej",
    plugin_version: "1.0.0",
    plugin_author: "Społeczność studentów WMW",
    url: "./sggw/wmw/"
  }
];

// Test 1: groupTenantsByInstitution
console.log("-- Test 1: groupTenantsByInstitution");
const grouped = PortalDomain.groupTenantsByInstitution(mockTenants);
assert.strictEqual(grouped.length, 2, "Powinny powstać 2 grupy uczelni");
assert.strictEqual(grouped[0].institution, "SGGW");
assert.strictEqual(grouped[0].faculties.length, 1);
assert.strictEqual(grouped[1].institution, "UMG");
assert.strictEqual(grouped[1].faculties.length, 1);
console.log("✅ [PASS] groupTenantsByInstitution poprawnie grupuje tenantów wg uczelni.");

// Test 2: filterInstitutions
console.log("\n-- Test 2: filterInstitutions (wyszukiwanie po nazwie, skrócie i wydziale)");
const allGrouped = PortalDomain.groupTenantsByInstitution(mockTenants);

// Po skrócie "umg"
const res1 = PortalDomain.filterInstitutions(allGrouped, "umg");
assert.strictEqual(res1.length, 1);
assert.strictEqual(res1[0].institution, "UMG");

// Po pełnej nazwie "morski"
const res2 = PortalDomain.filterInstitutions(allGrouped, "morski");
assert.strictEqual(res2.length, 1);
assert.strictEqual(res2[0].institution, "UMG");

// Po nazwie wydziału "weterynaryjnej"
const res3 = PortalDomain.filterInstitutions(allGrouped, "weterynaryjnej");
assert.strictEqual(res3.length, 1);
assert.strictEqual(res3[0].institution, "SGGW");

// Z tolerancją polskich znaków "glowna" -> "Główna"
const res4 = PortalDomain.filterInstitutions(allGrouped, "glowna");
assert.strictEqual(res4.length, 1);
assert.strictEqual(res4[0].institution, "SGGW");

// Puste zapytanie zwraca wszystkie
const res5 = PortalDomain.filterInstitutions(allGrouped, "   ");
assert.strictEqual(res5.length, 2);

console.log("✅ [PASS] filterInstitutions poprawnie wyszukuje i filtruje uczelnie.");

// Test 3: saveLastVisited & loadLastVisited
console.log("\n-- Test 3: saveLastVisited & loadLastVisited");
const mockStorage = {
  data: {},
  setItem(k, v) { this.data[k] = v; },
  getItem(k) { return this.data[k] || null; }
};

PortalDomain.saveLastVisited(mockTenants[0], mockStorage);
const loaded = PortalDomain.loadLastVisited(mockStorage);
assert.ok(loaded !== null, "Dane powinny zostać odczytane");
assert.strictEqual(loaded.tenant_id, "umg_wn");
assert.strictEqual(loaded.institution, "UMG");
assert.strictEqual(loaded.url, "./umg/wn/");
console.log("✅ [PASS] saveLastVisited i loadLastVisited poprawnie serializują i odczytują stan.");

// Test 4: Walidacja wygenerowanego dist/tenants.json jeśli istnieje
console.log("\n-- Test 4: Walidacja schematu tenants.json");
const tenantsJsonPath = path.join(__dirname, "..", "dist", "tenants.json");
if (fs.existsSync(tenantsJsonPath)) {
  const jsonContent = JSON.parse(fs.readFileSync(tenantsJsonPath, "utf-8"));
  assert.ok(Array.isArray(jsonContent), "tenants.json powinien być tablicą");
  assert.ok(jsonContent.length >= 2, "tenants.json powinien zawierać przynajmniej 2 tenantów");
  for (const t of jsonContent) {
    assert.ok(t.tenant_id, "Tenant musi posiadać tenant_id");
    assert.ok(t.institution, "Tenant musi posiadać institution");
    assert.ok(t.faculty, "Tenant musi posiadać faculty");
    assert.ok(t.plugin_version, "Tenant musi posiadać plugin_version");
    assert.ok(t.url, "Tenant musi posiadać url");
  }
  console.log("✅ [PASS] dist/tenants.json jest poprawny semantycznie i kompletny.");
} else {
  console.log("ℹ️ [SKIP] dist/tenants.json nie istnieje przed pierwszym buildem, pomijanie testu pliku.");
}

console.log("\n🎉 Wszystkie testy modułu Portal zakończone sukcesem (100% PASS)!\n");
