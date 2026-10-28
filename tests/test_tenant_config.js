/**
 * Testy jednostkowe dla modułu TenantConfig i systemu motywów tła (motifs)
 */
const assert = require('assert');

// Mock DOM if not in browser
if (typeof document === 'undefined') {
  global.document = {
    body: {
      children: [],
      firstChild: null,
      insertBefore(node, ref) {
        this.children.unshift(node);
        this.firstChild = this.children[0];
        return node;
      }
    },
    getElementById(id) {
      const fc = global.document.body.firstChild;
      if (fc && (fc.id === id || (fc.attributes && fc.attributes.id === id))) {
        return fc;
      }
      return null;
    },
    createElementNS(ns, tag) {
      return {
        tagName: tag,
        attributes: {},
        innerHTML: '',
        setAttribute(k, v) { this.attributes[k] = v; this[k] = v; },
        getAttribute(k) { return this.attributes[k]; }
      };
    }
  };
}

const TenantConfig = require('../web/js/tenant-config.js');

console.log('--- Testy TenantConfig: resolveMotifs & background motifs ---');

// Test 1: Config with valid curated motifs
{
  const cfg = { id: 'umg_wn', motifs: ['nautical', 'logistics'] };
  const res = TenantConfig.resolveMotifs(cfg);
  assert.deepStrictEqual(res, ['nautical', 'logistics'], 'Powinien zwrócić podane motywy');
  console.log('✅ [PASS] Poprawne motywy z konfiguracji tenanta');
}

// Test 2: Case insensitive normalization
{
  const cfg = { id: 'umg_wn', motifs: ['NAUTICAL', '  Logistics  '] };
  const res = TenantConfig.resolveMotifs(cfg);
  assert.deepStrictEqual(res, ['nautical', 'logistics'], 'Powinien znormalizować wielkość liter i spacje');
  console.log('✅ [PASS] Normalizacja wielkości liter i spacji');
}

// Test 3: Unknown keys are ignored
{
  const cfg = { id: 'test_t', motifs: ['nautical', 'invalid_motif_xyz', 'engineering'] };
  const res = TenantConfig.resolveMotifs(cfg);
  assert.deepStrictEqual(res, ['nautical', 'engineering'], 'Nieznany klucz powinien zostać zignorowany');
  console.log('✅ [PASS] Ignorowanie nieznanych kluczy motywów');
}

// Test 4: Max 3 motifs capped
{
  const cfg = { id: 'test_t', motifs: ['nautical', 'logistics', 'veterinary', 'engineering'] };
  const res = TenantConfig.resolveMotifs(cfg);
  assert.strictEqual(res.length, 3, 'Powinien ograniczyć do maksymalnie 3 motywów');
  assert.deepStrictEqual(res, ['nautical', 'logistics', 'veterinary']);
  console.log('✅ [PASS] Ograniczenie do maksymalnie 3 motywów');
}

// Test 5: Fallback to institution UMG
{
  const cfg = { id: 'umg_wn', institution: 'Uniwersytet Morski w Gdyni' };
  const res = TenantConfig.resolveMotifs(cfg);
  assert.deepStrictEqual(res, ['nautical', 'logistics'], 'Dla UMG fallback to nautical + logistics');
  console.log('✅ [PASS] Fallback do uczelni UMG');
}

// Test 6: Fallback to institution SGGW
{
  const cfg = { id: 'sggw_wmw', institution: 'SGGW' };
  const res = TenantConfig.resolveMotifs(cfg);
  assert.deepStrictEqual(res, ['veterinary', 'medicine'], 'Dla SGGW fallback to veterinary + medicine');
  console.log('✅ [PASS] Fallback do uczelni SGGW');
}

// Test 7: Fallback to institution AGH
{
  const cfg = { id: 'agh_wtk', institution: 'AGH' };
  const res = TenantConfig.resolveMotifs(cfg);
  assert.deepStrictEqual(res, ['engineering', 'it'], 'Dla AGH fallback to engineering + it');
  console.log('✅ [PASS] Fallback do uczelni AGH');
}

// Test 8: Fallback to general
{
  const cfg = { id: 'random_univ', institution: 'Nieznana Uczelnia' };
  const res = TenantConfig.resolveMotifs(cfg);
  assert.deepStrictEqual(res, ['general'], 'Brak dopasowania uczelni powiniem dać general');
  console.log('✅ [PASS] Fallback ogólny (general)');
}

// Test 9: renderBackgroundPattern creates pattern with 270x320 tile
{
  TenantConfig.renderBackgroundPattern(['nautical', 'logistics']);
  const svg = global.document.getElementById('app-bg-pattern');
  assert.ok(svg, 'Element SVG powinien istnieć');
  assert.strictEqual(svg.attributes['aria-hidden'], 'true');
  assert.strictEqual(svg.attributes['class'], 'app-bg-pattern');
  assert.ok(svg.innerHTML.includes('width="270" height="320"'), 'Pattern powinien mieć wymiary 270x320');
  assert.ok(svg.innerHTML.includes('app-fade-top'), 'Gradient fade top powinien istnieć');
  assert.ok(svg.innerHTML.includes('app-fade-bottom'), 'Gradient fade bottom powinien istnieć');
  assert.ok(svg.innerHTML.includes('id="pat-icon-anchor"'), 'Powinien zawierać ikonę anchor dla nautical');
  assert.ok(svg.innerHTML.includes('id="pat-icon-truck"'), 'Powinien zawierać ikonę truck dla logistics');
  assert.ok(!svg.innerHTML.includes('id="pat-icon-paw"'), 'Nie powinien zawierać ikony paw z veterinary');
  assert.ok(!svg.innerHTML.includes('id="pat-icon-gear"'), 'Nie powinien zawierać ikony gear z engineering');
  console.log('✅ [PASS] Poprawne generowanie elementu SVG z patternem 270x320, gradientami i filtrowanymi <defs>');
}

// Test 10: Fallback chain branding.motifs -> motifs -> institution -> general
{
  const cfgBranding = { id: 'custom_1', branding: { motifs: ['veterinary'] } };
  assert.deepStrictEqual(TenantConfig.resolveMotifs(cfgBranding), ['veterinary'], 'Powinien obsłużyć config.branding.motifs');
  TenantConfig.renderBackgroundPattern(TenantConfig.resolveMotifs(cfgBranding));
  const svg = global.document.getElementById('app-bg-pattern');
  assert.ok(svg.innerHTML.includes('id="pat-icon-paw"'), 'Dla veterinary <defs> musi zawierać paw');
  assert.ok(!svg.innerHTML.includes('id="pat-icon-anchor"'), 'Dla veterinary <defs> nie może zawierać anchor');
  console.log('✅ [PASS] Pełny łańcuch fallbacku branding.motifs i filtrowanie <defs>');
}

console.log('🎉 Wszystkie testy TenantConfig & Motifs PASSED (100% PASS)!');
