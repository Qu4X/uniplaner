# Uniplaner

[![CI](https://github.com/Qu4X/uniplaner/actions/workflows/deploy.yml/badge.svg?branch=main)](https://github.com/Qu4X/uniplaner/actions)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.11%2B-blue)](https://www.python.org/)
[![PWA](https://img.shields.io/badge/PWA-offline--ready-brightgreen)](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)

**Uniplaner** to nowoczesna, szybka i otwarta platforma planu zajęć dla studentów uczelni wyższych, działająca jako Progressive Web App (PWA) w trybie offline.

Projekt powstał w architekturze **multi-tenant (Platforma + Wtyczki)** — uniwersalny rdzeń aplikacji może obsłużyć dowolny wydział lub uczelnię za pomocą lekkich adapterów danych.

---

## 🌟 Kluczowe Możliwości Platformy

* 📱 **PWA & Offline First**: Błyskawiczne ładowanie bez internetu, możliwość instalacji na ekranie głównym (Android, iOS, macOS, Windows) z dedykowaną ikoną wydziału.
* 🔢 **Liczenie i numeracja spotkań**: Automatyczne wyliczanie postępu realizacji przedmiotu (np. *spotkanie 3 z 7*).
* 📅 **Integracja z kalendarzem akademickim**: Automatyczne uwzględnianie zarządzeń rektorskich (zamiany dni tygodnia, święta, przerwy świąteczne i sesje).
* 🎨 **Wizualne formy zajęć (WCAG)**: Czytelne kodowanie kolorystyczne form (wykłady, ćwiczenia, laboratoria, symulatory, kliniki, seminaria, projekty, fakultety) wraz z dynamiczną legendą.
* 🗓️ **Eksport do kalendarza**: Subskrypcja na żywo przez `webcal://` oraz pobieranie plików `.ics` z precyzyjną strefą czasową.
* 🔍 **Wyszukiwarka i Cross-Reference**: Przeglądanie całotygodniowych planów dowolnego wykładowcy, sali lub przedmiotu.
* 🚪 **Wyszukiwarka wolnych sal**: Sprawdzanie dostępności sal dydaktycznych w czasie rzeczywistym.
* 👁️ **Ukrywanie zajęć fakultatywnych**: Możliwość personalizacji widoku poprzez ukrywanie grup wyboru i lektoratów, do których student nie należy.

---

## 🏛️ Dostępne Wtyczki Wydziałowe (Out-of-the-box)

Platforma posiada gotowe adaptery dla:

| Uczelnia | Wydział | Akronim PWA | Źródło danych |
| :--- | :--- | :---: | :--- |
| **Uniwersytet Morski w Gdyni** | Wydział Nawigacyjny | `Plan WN` | System Arktur (HTML) + zjazdy NST (PDF) |
| **Szkoła Główna Gospodarstwa Wiejskiego** | Wydział Medycyny Weterynaryjnej | `Plan WMW` | Harmonogramy roczników (SharePoint Excel) |

---

## 🏗️ Architektura Modularna

W projekcie obowiązuje ścisły podział odpowiedzialności:

```
core/                                 # Silnik niezależny od uczelni (Kontrakt v1, walidacja, build, ICS)
sources/base.py                       # Protokół ScheduleSource oraz modele RawLesson / PlanMetadata
sources/<uczelnia>/<wydzial>/         # Adapter źródła (kod w Pythonie parsujący plan)
sources/_template/                    # Szablon startowy dla nowego adaptera
tenants/<uczelnia>/<wydzial>/         # Konfiguracja tenanta (config.json, theme.css, kalendarz, ikony)
web/                                  # Uniwersalny frontend PWA (vanilla JS, CSS variables)
docs/specs/                           # Specyfikacje techniczne Kontraktu v1 i przewodniki
```

---

## 🚀 Jak Dodać Swój Wydział lub Uczelnię?

Stworzenie wtyczki dla nowej uczelni zajmuje zazwyczaj jeden wieczór!

👉 **Pełna instrukcja krok po kroku znajduje się w [GitHub Wiki](https://github.com/Qu4X/uniplaner/wiki) oraz w dokumencie [`docs/specs/adapter-guide.md`](docs/specs/adapter-guide.md)**.

### Szybki zarys procesu:
1. Skopiuj katalog `sources/_template/` do `sources/<twoja_uczelnia>/<twoj_wydzial>/`.
2. Zaimplementuj adapter w Pythonie dziedziczący po `ScheduleSource`:
   - `discover()` — zwraca listę dostępnych kierunków i wersji planów.
   - `fetch_schedule()` — parsuje plan (HTML, PDF, Excel, API) i zwraca obiekty `RawLesson`.
3. Utwórz konfigurację w `tenants/<twoja_uczelnia>/<twoj_wydzial>/`:
   - `config.json` — metadane wydziału, włączone moduły i kolory form zajęć.
   - `academic_calendar.json` — daty semestru, zamiany dni i dni wolne.
   - `icon.png` — kwadratowa ikona wydziału (512×512 px z przezroczystością).
   - `theme.css` — kolory wiodące uczelni.
4. Uruchom testy i otwórz **Pull Request**!

---

## 💻 Uruchomienie Lokalne i Testy

### Wymagania:
* Python 3.11+
* Node.js 18+

### Instalacja środowiska:
```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
npm install
```

### Budowanie dystrybucji statycznej:
```powershell
# Kompilacja dla UMG WN
python -m core.build --tenant umg/wn --out dist

# Kompilacja dla SGGW WETA
python -m core.build --tenant sggw/weta --out dist_sggw
```

### Uruchomienie lokalnego serwera deweloperskiego:
```powershell
python -m http.server 8080 --directory dist
```

### Uruchomienie testów:
```powershell
# Testy regresyjne backendu Python (Contract v1, walidacja, expand)
.venv\Scripts\python.exe tests/test_backend.py
.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py"

# Testy jednostkowe frontendu JavaScript
npm test
```

---

## 📄 Licencja

Projekt udostępniany jest na licencji **MIT**. Szczegóły w pliku [LICENSE](LICENSE).
Wszelkie prawa do nazw uczelni, wydziałów oraz oficjalnych znaków towarowych należą do ich prawnych właścicieli i zostały użyte wyłącznie w celach identyfikacyjnych w projektach studenckich open-source.
