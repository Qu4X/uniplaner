# Przewodnik Tworzenia Wtyczki i Adaptera Źródła (`adapter-guide.md`)

Wersja: `2.0`  
Status: Obowiązujący standard modularny Uniplaner  
Data aktualizacji: 2026-10-20  

Ten dokument to kompletna specyfikacja dla studentów i programistów chcących dodać obsługę nowego wydziału lub uczelni do platformy **Uniplaner**.

---

## 1. Architektura modularna (Platforma + Wtyczki)

W repozytorium obowiązuje podział na niezależny rdzeń platformy oraz modularne wtyczki per uczelnia/wydział:

```
tenants/<uczelnia_id>/<wydzial_id>/   # Konfiguracja, motyw, kalendarz akademicki, ikony i metadane
sources/<uczelnia_id>/<wydzial_id>/   # Adapter źródła w Pythonie (pobieranie i parsowanie planu)
core/                                 # Silnik niezależny od uczelni (Contract v1, walidacja, budowanie PWA)
web/                                  # Interfejs PWA Uniplaner (HTML/CSS/JS)
```

> [!IMPORTANT]
> **Zasada czystości rdzenia**: W katalogach `core/` oraz `web/` obowiązuje **całkowity zakaz umieszczania logiki specyficznej dla konkretnej uczelni**. Całość logiki uczelnianej musi być zamknięta we wtyczce w `sources/` oraz `tenants/`.

---

## 2. Wymagane pliki w katalogu tenanta (`tenants/<uczelnia_id>/<wydzial_id>/`)

Każda wtyczka wydziałowa musi dostarczyć zestaw plików w katalogu `tenants/<uczelnia_id>/<wydzial_id>/`:

| Plik | Wymagany? | Format | Przeznaczenie |
| :--- | :---: | :--- | :--- |
| `config.json` | **TAK** | JSON | Konfiguracja metadanych, wtyczki, form zajęć i flag modułów |
| `academic_calendar.json` | **TAK** | JSON | Kalendarz akademicki (początek semestru, zamiany dni `daySwaps`, wolne) |
| `icon.png` | **TAK** | PNG (512×512) | Główna ikona PWA, favicon i apple-touch-icon |
| `logo.svg` | *Zalecany* | SVG | Wektorowe logo do nagłówka aplikacji i okna „O aplikacji” |
| `theme.css` | **TAK** | CSS | Barwy uczelni i wydziału (zmienne CSS trybu jasnego i ciemnego) |
| `events.json` | *Opcjonalny* | JSON | Lista wydarzeń studenckich (dla modułu `events`) |
| `changelog.json` | *Opcjonalny* | JSON | Dziennik zmian specyficzny dla wydziału |

---

## 3. Specyfikacja grafik i logotypów (Ikony i Logo)

Silnik platformy automatycznie przetwarza i dystrybuuje pliki graficzne wtyczki do wynikowej aplikacji PWA.

### A. Główna ikona rastrowa: `icon.png` (jedyny plik graficzny)
* **Rozmiar**: Dokładnie **512×512 px** (kwadrat 1:1).
* **Format**: PNG.
* **Stylistyka**:
  * **Pełny kwadrat BEZ zaokrąglonych rogów** (tło uczelni lub białe wypełniające całe 512×512 px).
  * Platforma Uniplaner sama nakłada jednolitą maskę zaokrąglenia 20% (squircle) w nagłówku, modalu oraz portalu.
  * Zachowaj bezpieczny margines (Safe Zone) ok. 10-15% od krawędzi, aby symbol nie został ucięty przy zaokrąglaniu w systemach Android/iOS.
* **Automatyczne działanie buildu**: Z pliku `icon.png` build generuje wszystkie warianty PWA (`icon-192.png`, `icon-512.png`, `favicon.png`, `apple-touch-icon.png`), rejestruje je w `manifest.json` oraz podmienia logo w nagłówku i modalu.

### B. Zapasowe emoji: `icon` w `config.json`
* W polu `"icon"` w `config.json` należy podać pojedyncze emoji (np. `"🐾"`, `"⚓"`, `"🏛️"`, `"🔬"`).
* Służy wyłącznie jako bezpieczny fallback, jeśli w środowisku developerskim nie ma plików graficznych.

---

## 4. Specyfikacja pliku `config.json`

Przykładowy plik konfiguracyjny:

```json
{
  "id": "sggw_weta",
  "name": "Szkoła Główna Gospodarstwa Wiejskiego — Wydział Medycyny Weterynaryjnej",
  "short_name": "Plan SGGW WETA",
  "icon": "🐾",
  "theme_color": "#1b5e20",
  "institution": "SGGW",
  "institution_full": "Szkoła Główna Gospodarstwa Wiejskiego w Warszawie (SGGW)",
  "faculty": "WMW",
  "faculty_full": "Wydział Medycyny Weterynaryjnej",
  "plugin_version": "1.0.0",
  "plugin_author": "Koło Naukowe Medycyny Weterynaryjnej",
  "source_url": "https://www.wmw.sggw.edu.pl/",
  "source_label": "WMW SGGW (harmonogramy SharePoint)",
  "locale": "pl",
  "tally_form_id": null,
  "source_adapters": [
    "sources.sggw.weta.adapter.SggwExcelSource"
  ],
  "forms": {
    "lecture":   { "label": "Wykład",             "abbr": "W",    "badge_color": "#2563eb" },
    "exercise":  { "label": "Ćwiczenia",          "abbr": "Ćw",   "badge_color": "#059669" },
    "lab":       { "label": "Laboratorium",       "abbr": "Lab",  "badge_color": "#7c3aed" },
    "clinical":  { "label": "Zajęcia kliniczne",  "abbr": "Klin", "badge_color": "#db2777" },
    "seminar":   { "label": "Seminarium",         "abbr": "Sem",  "badge_color": "#6366f1" },
    "practical": { "label": "Praktyka / Teren",   "abbr": "Prak", "badge_color": "#d97706" },
    "project":   { "label": "Projekt",            "abbr": "Pr",   "badge_color": "#8b5cf6" },
    "elective":  { "label": "Fakultet",           "abbr": "Fak",  "badge_color": "#0d9488" },
    "other":     { "label": "Fakultet / Inne",    "abbr": "Fak",  "badge_color": "#0d9488" }
  },
  "features": {
    "cross_reference": true,
    "free_rooms": false,
    "events": true,
    "lesson_hiding": {
      "enabled": true,
      "bulk_electives_dialog": true
    },
    "voting": {
      "enabled": false,
      "threshold": 10
    },
    "changelog": true
  }
}
```

### Wyjaśnienie kluczowych pól:
* **`faculty`**: Akronim wydziału (np. `WMW`, `WN`). Zainstalowana aplikacja PWA w systemie operacyjnym automatycznie przyjmie nazwę `Plan [faculty]` (np. `Plan WMW`).
* **`plugin_version`**: Wersja wtyczki wyświetlana w oknie „O aplikacji” (np. `1.0.0`).
* **`plugin_author`**: Autor lub organizacja studencka odpowiedzialna za utrzymanie wtyczki.
* **`forms`**: Słownik form zajęć. Kluczami muszą być standardowe formy (lub dopuszczalne rozszerzenia). Definiują pełną nazwę `label`, krótki skrót `abbr` oraz kolor etykiety `badge_color`.
* **`features`**: Włączanie modułów platformy (wyszukiwarka `cross_reference`, wolne sale `free_rooms`, wydarzenia `events`, ukrywanie zajęć `lesson_hiding`).

---

## 5. Specyfikacja Kalendarza Akademickiego (`academic_calendar.json`)

Kalendarz akademicki określa reguły generowania terminów zajęć przez silnik (`core/expand.py`):

```json
{
  "academic_year": "2026/2027",
  "semester": "winter",
  "semester_start": "2026-10-01",
  "semester_end": "2027-02-15",
  "first_half_end": "2026-11-20",
  "second_half_start": "2026-11-23",
  "daySwaps": {
    "2026-11-10": "FRI"
  },
  "holidays": [
    "2026-11-01",
    "2026-11-11",
    "2027-01-01",
    "2027-01-06"
  ],
  "breaks": [
    {
      "start": "2026-12-23",
      "end": "2027-01-03",
      "name": "Przerwa świąteczna"
    }
  ]
}
```

* **`daySwaps`**: Zarządzenia rektora zmieniające realizację dnia (np. we wtorek 10 listopada realizowane są zajęcia piątkowe `FRI`).
* **`holidays`**: Pojedyncze dni wolne od zajęć (zajęcia w tym dniu nie zostaną wygenerowane).
* **`breaks`**: Wielodniowe przerwy dydaktyczne.

---

## 6. Specyfikacja Motywu (`theme.css`)

Arkusz stylów wtyczki nadpisuje paletę barw platformy:

```css
:root {
  --brand-primary: #1b5e20;
  --brand-accent: #2e7d32;
  --header-bg: #1b5e20;
}

[data-theme="dark"] {
  --brand-primary: #2e7d32;
  --brand-accent: #4caf50;
  --bg-app: #0d1710;
  --bg-card: #132417;
  --bg-card-subtle: #19301f;
  --border-subtle: #1e3a24;
}
```

---

## 7. Implementacja Adaptera w Pythonie (`ScheduleSource`)

Katalog: `sources/<uczelnia_id>/<wydzial_id>/`

Adapter musi implementować protokół `ScheduleSource` z `sources/base.py`:

```python
from typing import List, Dict
from sources.base import ScheduleSource, PlanMetadata, RawLesson

class MojWydzialAdapter(ScheduleSource):
    source_id = "moj_wydzial_adapter"

    def discover(self) -> List[PlanMetadata]:
        """
        Lekka operacja: pobiera listę planów i ich tokeny wersji (version_token).
        Silnik porównuje version_token i pobiera tylko plany, które uległy zmianie.
        """
        return [
            PlanMetadata(
                id="informatyka_rok_1",
                institution="MojaUczelnia",
                faculty="WI",
                name="Informatyka Rok 1",
                study_mode="full_time",
                semester_number=1,
                version_token="hash_lub_data_modyfikacji",
                published_at="2026-10-01",
                groups=["GR_1", "GR_2"]
            )
        ]

    def fetch_schedule(self, plan_id: str) -> Dict[str, List[RawLesson]]:
        """
        Pobiera i parsuje siatkę zajęć dla wskazanego plan_id.
        Zwraca słownik: { nazwa_grupy: [RawLesson, ...] }
        """
        schedule = {}
        # Parsowanie...
        schedule["GR_1"] = [
            RawLesson(
                subject="Programowanie Obiektowe",
                start_time="08:00",
                end_time="09:30",
                duration_minutes=90,
                form="lecture",
                teacher="dr Jan Kowalski",
                room="Aula A",
                day_of_week="MON",
                interval_weeks=1,
                hideable=False
            )
        ]
        return schedule
```

### Kluczowe zasady dla `RawLesson`:
1. **Czas i czas trwania**: `start_time` i `end_time` w formacie `"HH:MM"`, `duration_minutes` musi być dodatnią liczbą całkowitą równą różnicy czasu.
2. **Standardowe formy**: `form` musi odpowiadać kluczom zdefiniowanym w `config.json` (`lecture`, `exercise`, `lab`, `project`, `seminar`, `elective`, itp.).
3. **Flaga `hideable`**: Jeśli dany przedmiot jest fakultetem lub lektoratem z podziałem na grupy wyboru, ustaw `hideable = True` — umożliwi to studentom ukrywanie grup, do których nie uczęszczają.

---

## 8. Testowanie i Budowanie Nowej Wtyczki

Gdy wtyczka i konfiguracja są gotowe:

1. **Uruchomienie buildu**:
   ```powershell
   .venv\Scripts\python.exe -m core.build --tenant <uczelnia_id>/<wydzial_id> --out dist_<id>
   ```
2. **Podgląd lokalny**:
   ```powershell
   python -m http.server 8082 --directory dist_<id>
   ```
3. **Uruchomienie testów regresyjnych**:
   ```powershell
   .venv\Scripts\python.exe tests/test_backend.py
   .venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py"
   npm test
   ```
   Wszystkie testy muszą zakończyć się statusem zielonym.
