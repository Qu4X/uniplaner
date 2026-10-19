# AGENTS.md — Plan WN

Dokument dla agentów AI pracujących w tym repozytorium.
Przeczytaj przed pierwszą zmianą w kodzie.

---

## Architektura modułowa (multi-tenant)

Projekt ma budowę modułową i multi-tenantową. **W `core/` oraz `web/` obowiązuje całkowity zakaz zaszywania logiki specyficznej dla konkretnej uczelni** — wszystko, co dotyczy danej uczelni/wydziału, należy do `sources/<tenant>/` (adaptery pobierania/parsowania) oraz `tenants/<tenant>/` (konfiguracja, motyw, kalendarz akademicki).

```
core/                     Rdzeń niezależny od uczelni (Contract v1, expand, validate, ics, diff, cross_ref, build, writer)
sources/base.py           Protokół ScheduleSource (discover_plans, fetch_schedule) + modele RawLesson / PlanMetadata
sources/umg_wn/           Adaptery źródłowe UMG Wydział Nawigacyjny (Arktur HTML + NST PDF)
sources/sggw_weta/        Adapter źródłowy SGGW Wydział Medycyny Weterynaryjnej (SharePoint XLSX)
sources/_template/        Szablon startowy dla nowego adaptera uczelni
tenants/umg_wn/           Konfiguracja tenanta UMG WN (config.json, theme.css, kalendarz)
tenants/sggw_weta/        Konfiguracja tenanta SGGW WETA (config.json, theme.css, kalendarz)
scrapper.py               Fasada parsera HTML UMG (arktur_client + arktur_parser)
nst_client.py / nst_parser.py Pobieranie i parser siatki PDF planów niestacjonarnych UMG
build_static.py           Punkt wejścia buildu UMG (kompatybilny wstecznie)
web/app.js                Kontroler frontendu PWA (vanilla JS)
web/js/schedule-engine.js Czysty silnik domenowy kalendarza i spotkań
web/js/timeline.js        Oś czasu i obliczenia dat/pozycji bloków
web/js/render.js          Renderowanie kart spotkań i siatki
web/js/cross-reference.js Silnik i UI wyszukiwarki sal, wykładowców i przedmiotów
web/js/modules/           Moduły opcjonalne sterowane z tenant_config.features (events.js, lesson-hiding.js, voting.js)
docs/specs/               Specyfikacje Kontraktu v1, konfiguracji tenanta, głosowania i przewodnik adaptera
tests/                    Testy regresyjne Python (test_backend.py + test_*.py) oraz JS (test_*.js)
```

Pełna architektura i słownik → [`CONTEXT.md`](CONTEXT.md)

---

## Testy — uruchom przed i po każdej zmianie

```powershell
.venv\Scripts\python.exe tests/test_backend.py                        # Regresja backendu
.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py" # Testy modułowe Python (core + sources)
npm test                                                              # JS frontend (wszystkie zestawy testów)
```

Wszystkie muszą przejść. Jeśli którykolwiek czerwony — napraw przed commitem.

---

## Wymagania testowe

**Bug fix bez testu regresyjnego = niekompletna zmiana.**

Dodaj test do `tests/test_backend.py` (Python) lub odpowiedniego pliku w `tests/` (JS) który:
1. Przed fixem jest czerwony.
2. Po fixie jest zielony.

Nowe funkcje: test opcjonalny, ale mile widziany.

---

## Format commitów — Conventional Commits

```
feat(scope):   nowa funkcjonalność
fix(scope):    naprawa błędu
perf(scope):   optymalizacja bez zmiany działania
docs(scope):   tylko dokumentacja
refactor(scope): zmiana struktury bez zmiany działania
test(scope):   testy bez zmian produkcyjnych
ci(scope):     pipeline i deployment
```

Scope = moduł lub obszar (np. `calendar`, `pwa`, `parser`, `ics`, `web`, `nst`).

Dobry: `fix(ics): use UTC-aware datetime for DTSTAMP`
Zły: `fixed stuff`

---

## Krytyczne kontrakty Python ↔ JS

Dwa miejsca, gdzie Python i JS muszą być zawsze zsynchronizowane.
**Zmiana jednego bez drugiego = cichy błąd produkcyjny.**

### Kontrakt 1 — sanityzacja nazwy grupy (nazwy plików)

Python (`build_static.py`) tworzy nazwy plików:
```python
safe_grupa = re.sub(r'[^\w-]', '_', grupa)
# Przykład: "GR. 1" → "GR__1"
```

JS (`app.js`) musi budować URL fetcha tą samą regułą:
```js
const safeGroup = group.replace(/[^\w-]/g, '_');
// Przykład: "GR. 1" → "GR__1"
```

Gdy zmieniasz jedno, zmień drugie. Sprawdź w `tests/test_backend.py` sekcja "Filename sanitisation".

### Kontrakt 2 — logika kalendarza akademickiego

`academic_calendar.json` jest parsowany niezależnie przez:
- `scrapper.py` — przy generowaniu ICS (build time)
- `web/js/schedule-engine.js` / `web/app.js` — przy wyświetlaniu spotkań (runtime)

Gdy zmieniasz reguły interpretacji dat (holidays, breaks, daySwaps) w jednym miejscu,
sprawdź czy drugie zachowuje się tak samo dla tego samego tygodnia.

---

## Strefy chronione — nie refaktoruj bez wyraźnej instrukcji

### `_wspolny_parser_html` w `scrapper.py`

~200 linii logiki parsowania HTML ze strony arktur.umg.edu.pl.
Parsuje komórki `<td id="td_...">`, chunki zajęć, kolory fontów, dane AJAX.
Wrażliwa na zmiany struktury HTML uczelni. Poprawki błędów: OK. Refaktor strukturalny: zapytaj.

### `getLessonMeetingInfo` w `web/js/schedule-engine.js`

Liczy spotkania z uwzględnieniem daySwaps, holidays i przerw.
Ma pokrycie TDD w `tests/test_calendar.js` i `tests/test_schedule_engine.js`. Pętla zawiera guard na `"Inny"` (nieznany dzień)
i twardy cap 200 iteracji — nie usuwaj tych zabezpieczeń.

---

## Nowe zależności — zawsze zapytaj użytkownika

Nie dodawaj pakietów do `requirements.txt` bez zgody właściciela.
Projekt bazuje na minimalnym zestawie: `requests`, `beautifulsoup4`, `icalendar`, `pdfplumber`, `openpyxl`.

Jeśli nowa zależność jest potrzebna: zaproponuj ją i poczekaj na odpowiedź.

---

## Pliki konfiguracyjne — tylko za zgodą właściciela

Nie edytuj samodzielnie:

| Plik | Dlaczego |
|------|---------|
| `data/academic_calendar.json` | Dane rektorskie — muszą być sprawdzone z oficjalnym kalendarzem UMG |
| `data/subjects_manual.json` | Aliasy nazw przedmiotów — mogą wpłynąć na ICS i cross-reference |
| `TODO.md` | Backlog projektu |

Zaproponuj zmianę, poczekaj na potwierdzenie.

---

## Domenowe słownictwo — użyj właściwych terminów

Projekt ma polskie słownictwo domenowe. Użyj tych terminów w komentarzach i komunikatach:

| Termin | Znaczenie | Unikaj |
|--------|-----------|--------|
| **Spotkanie** | Jeden blok zajęć w jednym dniu | zjazd, lekcja, tydzień |
| **Dzień bazowy planu** | Dzień tygodnia przypisany w siatce planu | dzień zajęć |
| **Zamiana dnia** | Zarządzenie rektorskie zmieniające dzień realizacji | odrobienie, przesunięcie |
| **Przerwa dydaktyczna** | Wielodniowy okres bez zajęć | wakacje, ferie |

Pełny słownik → [`CONTEXT.md`](CONTEXT.md)


---

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues (Qu4X/planwn). See docs/agents/issue-tracker.md.

### Triage labels

Canonical 5-role triage vocabulary. See docs/agents/triage-labels.md.

### Domain docs

Single-context (CONTEXT.md and docs/adr/ at repo root). See docs/agents/domain.md.
