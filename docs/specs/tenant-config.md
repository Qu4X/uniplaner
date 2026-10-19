# Specyfikacja Konfiguracji Tenanta (`tenant-config.md`)

Wersja specyfikacji: `1`  
Status: Zaakceptowany (Faza 0)  
Data utworzenia: 2026-10-19  

Katalog: `tenants/<tenant_id>/config.json`

Każdy obsługiwany wydział / uczelnia posiada własny katalog tenanta w `tenants/<tenant_id>/`, który definiuje:
1. Nazwę, branding i język interfejsu.
2. Formy zajęć i ich etykiety w języku lokalnym.
3. Flagi modułów włączonych/wyłączonych we frontendzie (`features`).
4. Parametry głosowania i integracji zewnętrznych (Tally, Supabase).

---

## 1. Przykładowa konfiguracja: `tenants/umg_wn/config.json`

```json
{
  "$schema": "../../docs/schemas/tenant-config.schema.json",
  "id": "umg_wn",
  "name": "Plan WN UMG",
  "institution": "Uniwersytet Morski w Gdyni",
  "faculty": "Wydział Nawigacyjny",
  "locale": "pl",
  "tally_form_id": "2E2vNj",
  "forms": {
    "lecture":   { "label": "Wykład", "badge_color": "#1e3a8a" },
    "exercise":  { "label": "Ćwiczenia", "badge_color": "#065f46" },
    "lab":       { "label": "Laboratorium", "badge_color": "#701a75" },
    "simulator": { "label": "Symulator", "badge_color": "#9d174d" },
    "project":   { "label": "Projekt", "badge_color": "#854d0e" },
    "seminar":   { "label": "Seminarium", "badge_color": "#374151" },
    "elective":  { "label": "Fakultet", "badge_color": "#0e7490" },
    "other":     { "label": "Zajęcia", "badge_color": "#4b5563" }
  },
  "features": {
    "cross_reference": true,
    "free_rooms": true,
    "events": true,
    "lesson_hiding": {
      "enabled": true,
      "bulk_electives_dialog": false
    },
    "voting": {
      "enabled": false,
      "threshold": 10
    },
    "changelog": true
  }
}
```

---

## 2. Przykładowa konfiguracja: `tenants/sggw_weta/config.json`

```json
{
  "$schema": "../../docs/schemas/tenant-config.schema.json",
  "id": "sggw_weta",
  "name": "Plan WMW SGGW",
  "institution": "Szkoła Główna Gospodarstwa Wiejskiego w Warszawie",
  "faculty": "Wydział Medycyny Weterynaryjnej",
  "locale": "pl",
  "tally_form_id": null,
  "forms": {
    "lecture":   { "label": "Wykład", "badge_color": "#1e3a8a" },
    "exercise":  { "label": "Ćwiczenia", "badge_color": "#065f46" },
    "lab":       { "label": "Laboratorium", "badge_color": "#701a75" },
    "elective":  { "label": "Fakultet", "badge_color": "#0e7490" },
    "other":     { "label": "Inne", "badge_color": "#4b5563" }
  },
  "features": {
    "cross_reference": false,
    "free_rooms": false,
    "events": false,
    "lesson_hiding": {
      "enabled": true,
      "bulk_electives_dialog": true
    },
    "voting": {
      "enabled": true,
      "threshold": 10,
      "supabase_url": "https://xyz.supabase.co",
      "supabase_anon_key": "eyJhbGciOi..."
    },
    "changelog": true
  }
}
```

---

## 3. Pliki w katalogu tenanta (`tenants/<tenant_id>/`)

* `config.json` — Konfiguracja flag, form i metadanych.
* `academic_calendar.json` — Oficjalny kalendarz akademicki rektora (dni wolne, zamiany dni `daySwaps`, przerwy dydaktyczne, początek semestru i połówki).
* `events.json` (opcjonalny) — Lista wydarzeń studenckich dla modułu `events`.
* `theme.css` (opcjonalny) — Nadpisania zmiennych CSS (kolor wiodący, akcenty uczelni).
* `manifest.json` — Plik PWA Manifest z ikonami i nazwą tenanta.
* `assets/` — Ikony PWA i favicony.
