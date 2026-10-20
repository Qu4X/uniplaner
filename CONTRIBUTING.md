# CONTRIBUTING.md — Uniplaner

Dziękujemy za chęć współtworzenia platformy **Uniplaner**! 🎓

Uniplaner to otwarta, modularna i wielotenantowa platforma planów zajęć dla studentów uczelni wyższych. Działa w architekturze Jamstack (statyczny kompilator Python + nowoczesne, zero-dependency PWA w Vanilla JS), serwując hermetyczne harmonogramy bezpośrednio z GitHub Pages w trybie offline.

---

## Architektura platformy

Projekt dzieli się na warstwę **rdzenia platformy** oraz niezależne **wtyczki wydziałowe/uczelniane**:

```
core/                     Rdzeń platformy (niezależny od uczelni: Kontrakt v1, expander, ICS, cross-ref, builder)
web/                      Uniwersalny frontend PWA (Vanilla JS, CSS Variables, Service Worker, cache)
sources/<u_id>/<w_id>/    Adaptery źródeł danych konkretnego wydziału (implementujące protokół ScheduleSource)
tenants/<u_id>/<w_id>/    Konfiguracja tenanta (config.json, theme.css, kalendarz akademicki, logotypy)
docs/specs/               Specyfikacje techniczne (Kontrakt v1, konfiguracja tenanta, przewodnik adaptera)
tests/                    Zestaw testów regresyjnych Python oraz silnika domenowego JS
```

> [!IMPORTANT]
> **Zasada separacji odpowiedzialności**:
> W `core/` oraz `web/` obowiązuje **całkowity zakaz zaszywania logiki specyficznej dla konkretnej uczelni**. Całość logiki uczelnianej musi być hermetycznie zamknięta w `sources/` oraz `tenants/`.

---

## Jak możesz pomóc?

Współtworzyć projekt można w dwóch głównych obszarach:

1. **Rozwój platformy (Core & Web)**:
   - Usprawnienia interfejsu PWA, dostępności (a11y/WCAG) i wydajności Core Web Vitals.
   - Nowe moduły wizualizacji (np. widok całego roku, agregacja grup).
   - Optymalizacja kompilatora i generatora kalendarzy ICS.

2. **Dodanie nowej uczelni / wydziału (Adapter Plugin)**:
   - Jeśli Twoja uczelnia lub wydział nie ma jeszcze wygodnego planu, możesz napisać dla niej adapter!
   - Zobacz kompletny przewodnik krok po kroku: [`docs/specs/adapter-guide.md`](docs/specs/adapter-guide.md) oraz szablon [`sources/_template/`](sources/_template/).

---

## Przygotowanie środowiska lokalnego

### Wymagania wstępne
- Python 3.11+
- Node.js 20+
- Git

### 1. Sklonowanie repozytorium
```bash
git clone https://github.com/Qu4X/uniplaner.git
cd uniplaner
```

### 2. Środowisko Python
```bash
# Utworzenie wirtualnego środowiska:
python -m venv .venv

# Aktywacja (Windows PowerShell):
.venv\Scripts\Activate.ps1
# Aktywacja (Linux/macOS):
source .venv/bin/activate

# Instalacja zależności deweloperskich:
pip install -r requirements.txt
```

### 3. Uruchomienie testów (TDD & Regresja)
Przed przystąpieniem do pracy upewnij się, że wszystkie testy przechodzą:

```bash
# 1. Regresja backendu i parserów (Python):
python tests/test_backend.py

# 2. Testy modułowe (Python):
python -m unittest discover -s tests -p "test_*.py"

# 3. Testy silnika kalendarza, modułów i Kontraktu v1 (Node.js):
npm test
```

### 4. Budowanie i podgląd lokalny
Możesz skompilować dowolnego tenanta lokalnie:

```bash
# Budowa UMG WN (lub użyj skrótu python build_static.py --limit 3):
python -m core.build --tenant umg/wn --limit 3

# Budowa SGGW WETA:
python -m core.build --tenant sggw/weta

# Podgląd w przeglądarce:
python -m http.server 8080 --directory dist
```

Otwórz w przeglądarce: [http://localhost:8080](http://localhost:8080)

---

## Tworzenie nowego adaptera (Krótki przewodnik)

1. **Skopiuj szablon**:
   Skopiuj katalog [`sources/_template/`](sources/_template/) do `sources/<id_uczelni>/<id_wydzialu>/`.
2. **Zaimplementuj protokół `ScheduleSource`**:
   - `discover()` — zwraca listę dostępnych planów studiów (`PlanMetadata`).
   - `fetch_schedule(plan_id)` — pobiera i transformuje surowe zajęcia do obiektów `RawLesson` zgodnych z **Kontraktem v1**.
3. **Stwórz konfigurację tenanta**:
   W `tenants/<id_uczelni>/<id_wydzialu>/` utwórz:
   - `config.json` (nazwa, wydział, włączone funkcje, routing zgłaszania błędów do autora wtyczki).
   - `theme.css` (zmienne barw uczelni: `--accent`, `--accent-hover`, `--bg-primary` itd.).
   - `academic_calendar.json` (daty zjazdów, dni wolne, zamiany dni).
   - `icon.png` (512x512) oraz `logo.svg` (opcjonalny logotyp wydziału).
4. **Napisz test jednostkowy**:
   W `tests/test_<id_uczelni>_adapter.py` przetestuj mapowanie przykładowych danych (fixture).

Szczegóły techniczne i formaty pól znajdziesz w:
- 📖 [Specyfikacja Kontraktu v1](docs/specs/contract-v1.md)
- 📖 [Specyfikacja Konfiguracji Tenanta](docs/specs/tenant-config.md)
- 📖 [Przewodnik Pisania Adaptera Uczelni](docs/specs/adapter-guide.md)

---

## Standardy jakości i Pull Requestów

### 1. Wymagania testowe
- **Każdy bug fix musi zawierać test regresyjny**. Dodaj przypadek do `tests/test_backend.py` lub odpowiedniego pliku w `tests/*.js`.
- Nowe funkcjonalności lub adaptery muszą zawierać pokrycie testowe dla kluczowych ścieżek.

### 2. Konwencja commitów (Conventional Commits)
Stosujemy format:
```
feat(scope):   nowa funkcjonalność
fix(scope):    naprawa błędu
docs(scope):   zmiany w dokumentacji
test(scope):   dodanie lub poprawa testów
refactor(scope): refaktoryzacja bez zmiany logiki
chore(scope):  utrzymanie, konfiguracja, czyszczenie
```
*Przykłady*: `feat(adapter): add timetable parser for sggw`, `fix(core): handle edge case in occurrence expansion`.

### 3. Zero nowych zależności bez wcześniejszej dyskusji
Zależności runtime i build-time utrzymujemy na minimalnym poziomie. Zgłoś Issue przed próbą dodania nowej biblioteki do `requirements.txt` lub `package.json`.

### 4. Słownictwo domenowe
W komentarzach, dokumentacji i kodzie posługujemy się precyzyjnym słownictwem domenowym opisanym w [CONTEXT.md](CONTEXT.md):
- **Spotkanie** — pojedyncza realizacja bloku zajęć w konkretnym dniu.
- **Dzień bazowy planu** — dzień tygodnia przypisany w siatce (np. wtorek).
- **Zamiana dnia** — zarządzenie rektorskie realizujące dany dzień wg siatki innego dnia.
- **Przerwa dydaktyczna** — wielodniowy okres bez zajęć.

---

## Zgłaszanie problemów i dyskusje

- **Błędy platformy i propozycje funkcji**: [GitHub Issues](https://github.com/Qu4X/uniplaner/issues)
- Masz pytania dotyczące pisania adaptera dla swojej uczelni? Załóż wątek w Issues z etykietą `adapter-help`.
