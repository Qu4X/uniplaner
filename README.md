# Uniplaner

[![CI](https://github.com/Qu4X/uniplaner/actions/workflows/deploy.yml/badge.svg?branch=main)](https://github.com/Qu4X/uniplaner/actions)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.11%2B-blue)](https://www.python.org/)
[![PWA](https://img.shields.io/badge/PWA-offline--ready-brightgreen)](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)

**Uniplaner** to otwarta platforma planu zajęć dla studentów. Działa jako progresywna aplikacja internetowa (PWA), także bez dostępu do sieci.

Projekt ma architekturę wielodzierżawczą (*multi-tenant*): uniwersalny rdzeń obsługuje dowolny wydział lub uczelnię, o ile zostanie dla niej przygotowany lekki adapter źródła danych.

---

## Funkcje

* **PWA z pracą offline** — szybkie ładowanie bez połączenia z internetem oraz instalacja na ekranie głównym (Android, iOS, macOS, Windows) z ikoną wydziału.
* **Numeracja spotkań** — automatyczne wyliczanie postępu realizacji przedmiotu (np. *spotkanie 3 z 7*).
* **Kalendarz akademicki** — uwzględnianie zarządzeń rektorskich: zamian dni, świąt, przerw dydaktycznych i sesji.
* **Formy zajęć** — wykłady, ćwiczenia, laboratoria, symulatory, kliniki, seminaria, projekty i fakultety są oznaczone kolorami zgodnymi z wytycznymi WCAG i opisane dynamiczną legendą.
* **Eksport do kalendarza** — subskrypcja przez `webcal://` oraz pobieranie plików `.ics` z poprawną strefą czasową.
* **Wyszukiwanie powiązań (cross-reference)** — podgląd tygodniowego planu dowolnego prowadzącego, sali lub przedmiotu.
* **Wyszukiwarka wolnych sal** — sprawdzanie dostępności sal dydaktycznych.
* **Ukrywanie zajęć fakultatywnych** — możliwość ukrycia grup wyboru i lektoratów, do których student nie należy.

---

## Obsługiwane wydziały

Repozytorium zawiera gotowe adaptery dla następujących jednostek:

| Uczelnia | Wydział | Nazwa PWA | Źródło danych |
| :--- | :--- | :---: | :--- |
| **Uniwersytet Morski w Gdyni** | Wydział Nawigacyjny | `Plan WN` | System Arktur (HTML) oraz zjazdy NST (PDF) |
| **Szkoła Główna Gospodarstwa Wiejskiego** | Wydział Medycyny Weterynaryjnej | `Plan WMW` | Harmonogramy roczników (Excel w SharePoint) |

---

## Architektura

Obowiązuje ścisły podział odpowiedzialności:

```
core/                                 # Rdzeń niezależny od uczelni (Kontrakt v1, walidacja, build, ICS)
sources/base.py                       # Protokół ScheduleSource oraz modele RawLesson / PlanMetadata
sources/<uczelnia>/<wydzial>/         # Adapter źródła (kod w Pythonie pobierający i parsujący plan)
sources/_template/                    # Szablon startowy nowego adaptera
tenants/<uczelnia>/<wydzial>/         # Konfiguracja tenanta (config.json, theme.css, kalendarz, ikony)
web/                                  # Uniwersalny frontend PWA (vanilla JS, zmienne CSS)
docs/specs/                           # Specyfikacje techniczne Kontraktu v1 i przewodniki
```

---

## Dodawanie wydziału lub uczelni

Przygotowanie adaptera dla nowej jednostki zajmuje zwykle kilka godzin.

Pełna instrukcja znajduje się w [Wiki projektu](https://github.com/Qu4X/uniplaner/wiki) oraz w dokumencie [`docs/specs/adapter-guide.md`](docs/specs/adapter-guide.md).

### Przebieg w skrócie

1. Skopiuj katalog `sources/_template/` do `sources/<uczelnia>/<wydzial>/`.
2. Zaimplementuj adapter w Pythonie zgodnie z protokołem `ScheduleSource`:
   - `discover()` — zwraca listę dostępnych kierunków i wersji planów,
   - `fetch_schedule()` — parsuje plan (HTML, PDF, Excel, API) i zwraca obiekty `RawLesson`.
3. Utwórz konfigurację w `tenants/<uczelnia>/<wydzial>/`:
   - `config.json` — metadane wydziału, włączone moduły i kolory form zajęć,
   - `academic_calendar.json` — daty semestru, zamiany dni i dni wolne,
   - `icon.png` — kwadratowa ikona wydziału (512×512 px, bez zaokrąglonych rogów),
   - `theme.css` — kolory wiodące uczelni.
4. Uruchom testy i otwórz Pull Request.

---

## Uruchamianie lokalne i testy

### Wymagania

* Python 3.11+
* Node.js 20+

### Instalacja środowiska

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
npm install
```

### Budowanie wersji statycznej

```powershell
# Budowa dla UMG WN
python -m core.build --tenant umg/wn --out dist

# Budowa dla SGGW WETA
python -m core.build --tenant sggw/weta --out dist_sggw
```

### Lokalny serwer deweloperski

```powershell
python -m http.server 8080 --directory dist
```

### Testy

```powershell
# Testy regresyjne backendu (Kontrakt v1, walidacja, wyliczanie spotkań)
.venv\Scripts\python.exe tests/test_backend.py
.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py"

# Testy jednostkowe frontendu
npm test
```

---

## Licencja

Projekt jest udostępniany na licencji **MIT**. Szczegóły znajdują się w pliku [LICENSE](LICENSE).

Prawa do nazw uczelni, wydziałów i znaków towarowych należą do ich właścicieli. Nazwy te użyto wyłącznie w celach identyfikacyjnych, w studenckim projekcie open source.
