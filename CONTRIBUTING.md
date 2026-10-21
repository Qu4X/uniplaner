# CONTRIBUTING.md — Uniplaner

Dziękujemy za zainteresowanie rozwojem platformy **Uniplaner**.

Uniplaner to otwarta, modułowa i wielodzierżawcza (*multi-tenant*) platforma planów zajęć dla studentów. Działa w architekturze Jamstack: statyczny kompilator w Pythonie generuje dane, a aplikacja PWA napisana w czystym JavaScripcie (bez zależności zewnętrznych) udostępnia je z GitHub Pages, także w trybie offline.

---

## Architektura platformy

Projekt składa się z **rdzenia platformy** oraz niezależnych **adapterów wydziałów i uczelni**:

```
core/                     Rdzeń niezależny od uczelni (Kontrakt v1, expander, ICS, cross-ref, builder)
web/                      Uniwersalny frontend PWA (vanilla JS, zmienne CSS, Service Worker, cache)
sources/<u_id>/<w_id>/    Adaptery źródeł danych konkretnego wydziału (protokół ScheduleSource)
tenants/<u_id>/<w_id>/    Konfiguracja tenanta (config.json, theme.css, kalendarz akademicki, logotypy)
docs/specs/               Specyfikacje techniczne (Kontrakt v1, konfiguracja tenanta, przewodnik adaptera)
tests/                    Testy regresyjne w Pythonie oraz testy silnika domenowego w JS
```

> [!IMPORTANT]
> **Zasada separacji odpowiedzialności**:
> W katalogach `core/` i `web/` **nie wolno umieszczać logiki specyficznej dla konkretnej uczelni**. Cała logika uczelniana musi znajdować się w `sources/` oraz `tenants/`.

---

## Jak możesz pomóc

Projekt można rozwijać w dwóch obszarach:

1. **Rozwój platformy (core i web)**:
   - poprawa interfejsu PWA, dostępności (a11y/WCAG) i wydajności (Core Web Vitals),
   - nowe widoki (np. widok całego roku, agregacja grup),
   - optymalizacja kompilatora i generatora plików ICS.

2. **Dodanie nowej uczelni lub wydziału (adapter)**:
   - jeśli Twoja jednostka nie publikuje planu w wygodnej formie, możesz napisać dla niej adapter,
   - kompletny przewodnik: [`docs/specs/adapter-guide.md`](docs/specs/adapter-guide.md); szablon: [`sources/_template/`](sources/_template/).

---

## Przygotowanie środowiska lokalnego

### Wymagania wstępne

- Python 3.11+
- Node.js 20+
- Git

### 1. Klonowanie repozytorium

```bash
git clone https://github.com/Qu4X/uniplaner.git
cd uniplaner
```

### 2. Środowisko Python

```bash
# Utworzenie środowiska wirtualnego:
python -m venv .venv

# Aktywacja (Windows PowerShell):
.venv\Scripts\Activate.ps1
# Aktywacja (Linux/macOS):
source .venv/bin/activate

# Instalacja zależności:
pip install -r requirements.txt
```

### 3. Uruchomienie testów

Przed rozpoczęciem pracy upewnij się, że wszystkie testy przechodzą:

```bash
# 1. Regresja backendu i parserów (Python):
python tests/test_backend.py

# 2. Testy modułowe (Python):
python -m unittest discover -s tests -p "test_*.py"

# 3. Testy silnika kalendarza, modułów i Kontraktu v1 (Node.js):
npm test
```

### 4. Budowanie i podgląd lokalny

Dowolnego tenanta można zbudować lokalnie:

```bash
# Budowa UMG WN (lub skrót: python build_static.py --limit 3):
python -m core.build --tenant umg/wn --limit 3

# Budowa SGGW WETA:
python -m core.build --tenant sggw/weta

# Podgląd w przeglądarce:
python -m http.server 8080 --directory dist
```

Aplikacja będzie dostępna pod adresem [http://localhost:8080](http://localhost:8080).

---

## Tworzenie nowego adaptera (skrót)

1. **Skopiuj szablon**:
   skopiuj katalog [`sources/_template/`](sources/_template/) do `sources/<id_uczelni>/<id_wydzialu>/`.
2. **Zaimplementuj protokół `ScheduleSource`**:
   - `discover()` — zwraca listę dostępnych planów studiów (`PlanMetadata`),
   - `fetch_schedule(plan_id)` — pobiera zajęcia i zamienia je na obiekty `RawLesson` zgodne z **Kontraktem v1**.
3. **Przygotuj konfigurację tenanta**:
   w `tenants/<id_uczelni>/<id_wydzialu>/` utwórz:
   - `config.json` (nazwa, wydział, włączone funkcje, adres zgłaszania błędów w planie do autora adaptera),
   - `theme.css` (zmienne kolorystyczne uczelni: `--accent`, `--accent-hover`, `--bg-primary` itd.),
   - `academic_calendar.json` (okresy zajęć, dni wolne, zamiany dni),
   - `icon.png` (512×512 px) oraz opcjonalnie `logo.svg`.
4. **Napisz test jednostkowy**:
   w `tests/test_<id_uczelni>_adapter.py` sprawdź mapowanie przykładowych danych (plik testowy, *fixture*).

Szczegóły techniczne i formaty pól opisano w dokumentach:

- [Specyfikacja Kontraktu v1](docs/specs/schedule-data-contract-v1.md)
- [Specyfikacja konfiguracji tenanta](docs/specs/tenant-config.md)
- [Przewodnik tworzenia adaptera](docs/specs/adapter-guide.md)

---

## Standardy jakości i Pull Requesty

### 1. Wymagania testowe

- **Każda poprawka błędu musi zawierać test regresyjny.** Dodaj przypadek do `tests/test_backend.py` lub do odpowiedniego pliku `tests/*.js`.
- Nowe funkcje i adaptery powinny mieć pokrycie testami dla głównych ścieżek działania.

### 2. Konwencja commitów (Conventional Commits)

Stosujemy format:

```
feat(scope):     nowa funkcjonalność
fix(scope):      naprawa błędu
docs(scope):     zmiany w dokumentacji
test(scope):     dodanie lub poprawa testów
refactor(scope): zmiana struktury kodu bez zmiany działania
chore(scope):    utrzymanie, konfiguracja, porządki
```

*Przykłady*: `feat(adapter): add timetable parser for sggw`, `fix(core): handle edge case in occurrence expansion`.

### 3. Nowe zależności tylko po uzgodnieniu

Liczbę zależności (uruchomieniowych i budowania) utrzymujemy na minimalnym poziomie. Przed dodaniem biblioteki do `requirements.txt` lub `package.json` zgłoś Issue i poczekaj na odpowiedź.

### 4. Słownictwo domenowe

W komentarzach, dokumentacji i kodzie stosujemy terminy opisane w [CONTEXT.md](CONTEXT.md):

- **Spotkanie** — pojedyncza realizacja bloku zajęć w konkretnym dniu.
- **Dzień bazowy planu** — dzień tygodnia przypisany w siatce planu (np. wtorek).
- **Zamiana dnia** — zarządzenie rektorskie, według którego zajęcia danego dnia odbywają się zgodnie z siatką innego dnia.
- **Przerwa dydaktyczna** — wielodniowy okres bez zajęć.

---

## Zgłaszanie problemów i pytania

- **Błędy platformy i propozycje funkcji**: [GitHub Issues](https://github.com/Qu4X/uniplaner/issues).
- **Pytania dotyczące adaptera**: załóż zgłoszenie w Issues z etykietą `adapter-help`.
