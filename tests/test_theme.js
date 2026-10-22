/**
 * Tests for 3-state theme switching (Jasny / System / Ciemny)
 */
const assert = require("assert");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");

describeThemeTests();

function describeThemeTests() {
  console.log("\n🧪 Running 3-State Theme Switching Tests...\n");

  const storageMap = {};
  let storageThrow = false;
  global.localStorage = {
    getItem: (k) => {
      if (storageThrow) throw new Error("SecurityError: localStorage is disabled");
      return storageMap[k] !== undefined ? storageMap[k] : null;
    },
    setItem: (k, v) => {
      if (storageThrow) throw new Error("SecurityError: localStorage is disabled");
      storageMap[k] = String(v);
    },
    removeItem: (k) => {
      if (storageThrow) throw new Error("SecurityError: localStorage is disabled");
      delete storageMap[k];
    }
  };

  const mockMeta = {
    attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; }
  };

  const mockDocElement = {
    attrs: {},
    style: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; }
  };

  global.document = {
    documentElement: mockDocElement,
    querySelector: (sel) => {
      if (sel === 'meta[name="theme-color"]') return mockMeta;
      return null;
    },
    querySelectorAll: (sel) => {
      return [];
    },
    getElementById: (id) => null,
    addEventListener: () => {}
  };

  let mediaQueryMatches = false;
  let mediaQueryListeners = [];
  global.window = {
    matchMedia: (query) => {
      return {
        matches: mediaQueryMatches,
        media: query,
        addEventListener: (event, handler) => {
          if (event === "change") mediaQueryListeners.push(handler);
        },
        addListener: (handler) => {
          mediaQueryListeners.push(handler);
        }
      };
    }
  };

  const {
    getEffectiveTheme,
    setThemeMode,
    initTheme,
    toggleTheme,
    setupThemeListener,
    state
  } = require(path.join(ROOT_DIR, "web/app.js"));

  // --- Test 1: Default state is "system" when no stored preference exists ---
  console.log("-- Test 1: Default theme mode is 'system'");
  mediaQueryMatches = false;
  delete storageMap["umg_theme"];
  delete storageMap["umg_wn_theme"];
  setThemeMode("system");
  assert.strictEqual(state.themeMode, "system");
  assert.strictEqual(state.theme, "light");
  assert.strictEqual(mockDocElement.getAttribute("data-theme"), "light");
  assert.strictEqual(mockDocElement.style.colorScheme, "light");
  assert.strictEqual(mockMeta.getAttribute("content"), "#0d233a");
  assert.strictEqual(global.localStorage.getItem("umg_theme"), null);
  console.log("✅ [PASS] Default theme mode is 'system' and reflects media query.");

  // --- Test 2: System theme reacts to prefers-color-scheme dark ---
  console.log("-- Test 2: System mode reflects dark system theme");
  mediaQueryMatches = true;
  initTheme();
  assert.strictEqual(state.themeMode, "system");
  assert.strictEqual(state.theme, "dark");
  assert.strictEqual(mockDocElement.getAttribute("data-theme"), "dark");
  assert.strictEqual(mockDocElement.style.colorScheme, "dark");
  assert.strictEqual(mockMeta.getAttribute("content"), "#0b1828");
  console.log("✅ [PASS] System mode dynamically computes dark effective theme.");

  // --- Test 3: Setting manual "dark" overrides system and persists to localStorage ---
  console.log("-- Test 3: Manual 'dark' persists in localStorage");
  setThemeMode("dark");
  assert.strictEqual(state.themeMode, "dark");
  assert.strictEqual(state.theme, "dark");
  assert.strictEqual(global.localStorage.getItem("umg_theme"), "dark");
  assert.strictEqual(mockDocElement.getAttribute("data-theme"), "dark");
  console.log("✅ [PASS] Manual dark mode saved to localStorage.");

  // --- Test 4: Setting manual "light" overrides system and persists to localStorage ---
  console.log("-- Test 4: Manual 'light' persists in localStorage");
  setThemeMode("light");
  assert.strictEqual(state.themeMode, "light");
  assert.strictEqual(state.theme, "light");
  assert.strictEqual(global.localStorage.getItem("umg_theme"), "light");
  assert.strictEqual(mockDocElement.getAttribute("data-theme"), "light");
  assert.strictEqual(mockMeta.getAttribute("content"), "#0d233a");
  console.log("✅ [PASS] Manual light mode saved to localStorage.");

  // --- Test 5: Setting "system" removes the key from localStorage ---
  console.log("-- Test 5: Returning to 'system' clears localStorage");
  setThemeMode("system");
  assert.strictEqual(state.themeMode, "system");
  assert.strictEqual(global.localStorage.getItem("umg_theme"), null, "Klucz umg_theme powinien zostać usunięty");
  assert.strictEqual(global.localStorage.getItem("umg_wn_theme"), null, "Klucz umg_wn_theme powinien zostać usunięty");
  console.log("✅ [PASS] Returning to system clears localStorage entry.");

  // --- Test 6: setupThemeListener live listener in system mode ---
  console.log("-- Test 6: setupThemeListener live updates in system mode");
  setupThemeListener();
  assert.strictEqual(mediaQueryListeners.length > 0, true, "Listener powinien być zarejestrowany");

  // Trigger change event to light
  mediaQueryListeners.forEach((fn) => fn({ matches: false }));
  assert.strictEqual(state.theme, "light");
  assert.strictEqual(mockDocElement.getAttribute("data-theme"), "light");

  // Trigger change event to dark
  mediaQueryListeners.forEach((fn) => fn({ matches: true }));
  assert.strictEqual(state.theme, "dark");
  assert.strictEqual(mockDocElement.getAttribute("data-theme"), "dark");
  console.log("✅ [PASS] Live listener correctly switches theme in system mode.");

  // --- Test 7: setupThemeListener does NOT override manual mode ---
  console.log("-- Test 7: setupThemeListener does not override manual mode");
  setThemeMode("light");
  assert.strictEqual(state.theme, "light");

  // System fires dark event
  mediaQueryListeners.forEach((fn) => fn({ matches: true }));
  assert.strictEqual(state.themeMode, "light");
  assert.strictEqual(state.theme, "light");
  assert.strictEqual(mockDocElement.getAttribute("data-theme"), "light");
  console.log("✅ [PASS] Manual mode is untouched by system media query changes.");

  // --- Test 8: SecurityError (Private / Incognito mode) fallback ---
  console.log("-- Test 8: Private browsing mode with localStorage throws");
  storageThrow = true;
  assert.doesNotThrow(() => {
    setThemeMode("dark");
  });
  assert.doesNotThrow(() => {
    setThemeMode("system");
  });
  storageThrow = false;
  console.log("✅ [PASS] Private browsing mode behaves gracefully without throwing.");

  // --- Test 9: UI Elements and ARIA attributes synchronization ---
  console.log("-- Test 9: UI Elements and ARIA attributes");
  const createMockButton = (mode) => ({
    dataset: { themeMode: mode },
    tabIndex: -1,
    attrs: {},
    classList: {
      classes: new Set(),
      toggle(cls, val) {
        if (val) this.classes.add(cls);
        else this.classes.delete(cls);
      },
      contains(cls) { return this.classes.has(cls); }
    },
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; }
  });

  const segButtons = [
    createMockButton("light"),
    createMockButton("system"),
    createMockButton("dark")
  ];

  global.document.querySelectorAll = (sel) => {
    if (sel === ".theme-seg-btn" || sel === ".theme-dropdown-item") return segButtons;
    return [];
  };

  setThemeMode("dark");
  assert.strictEqual(segButtons[2].getAttribute("aria-checked"), "true");
  assert.strictEqual(segButtons[2].tabIndex, 0);
  assert.strictEqual(segButtons[2].classList.contains("active"), true);
  assert.strictEqual(segButtons[0].getAttribute("aria-checked"), "false");
  assert.strictEqual(segButtons[0].tabIndex, -1);
  assert.strictEqual(segButtons[1].getAttribute("aria-checked"), "false");

  setThemeMode("system");
  assert.strictEqual(segButtons[1].getAttribute("aria-checked"), "true");
  assert.strictEqual(segButtons[1].tabIndex, 0);
  assert.strictEqual(segButtons[1].classList.contains("active"), true);
  assert.strictEqual(segButtons[0].getAttribute("aria-checked"), "false");
  assert.strictEqual(segButtons[2].getAttribute("aria-checked"), "false");
  console.log("✅ [PASS] Segmented and dropdown buttons properly update aria-checked, tabIndex and active class.");

  console.log("\n🎉 All 3-State Theme Tests PASSED (100% PASS)!\n");
}
