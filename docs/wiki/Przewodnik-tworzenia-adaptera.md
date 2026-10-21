# Przewodnik tworzenia adaptera dla nowego wydziału

Ten przewodnik opisuje, jak przygotować adapter dla swojej uczelni lub wydziału w platformie **Uniplaner**.

Utworzenie adaptera obejmuje sześć kroków i zajmuje zwykle od kilku godzin do dwóch dni roboczych, zależnie od złożoności źródła danych.

---

## 1. Architektura platformy w skrócie

Cały kod i konfiguracja dotyczące Twojej uczelni znajdują się w dwóch katalogach:

```
sources/<id_uczelni>/<id_wydzialu>/    <- kod w Pythonie (pobieranie i parsowanie planu)
tenants/<id_uczelni>/<id_wydzialu>/    <- konfiguracja, ikona, motyw CSS i kalendarz
```

Przykładowe identyfikatory:
- `umg/wn` — Uniwersytet Morski w Gdyni, Wydział Nawigacyjny
- `sggw/weta` — SGGW w Warszawie, Wydział Medycyny Weterynaryjnej
- `pw/mini` — Politechnika Warszawska, Wydział MiNI

> [!IMPORTANT]
> **Zasada niezależności rdzenia**: w katalogach `core/` i `web/` **nie wolno dodawać kodu specyficznego dla konkretnej uczelni**. Cała logika uczelniana musi znajdować się w katalogach adaptera.

---

## 2. Krok 1: skopiowanie szablonu

Repozytorium zawiera gotowy szablon adaptera. Skopiuj go:

```bash
# Utwórz strukturę katalogów (np. dla Politechniki Warszawskiej, wydział MiNI)
cp -r sources/_template sources/pw/mini
mkdir -p tenants/pw/mini
```

W katalogu `sources/pw/mini/` znajdziesz plik `adapter.py` z pustymi szkieletami metod do uzupełnienia.

---

## 3. Krok 2: implementacja protokołu `ScheduleSource`

Adapter musi być zgodny z protokołem `ScheduleSource` (z modułu `sources.base`) i implementować dwie metody:

```python
from typing import List, Dict, Optional
from sources.base import ScheduleSource, PlanMetadata, RawLesson

class MyFacultyScheduleSource:
    source_id = "pw_mini"

    def discover(self) -> List[PlanMetadata]:
        """
        Krok A: pobiera listę dostępnych planów zajęć na wydziale (kierunki, roczniki, stopnie).
        Zwraca listę obiektów PlanMetadata.
        """
        return [
            PlanMetadata(
                id="inf_s1",
                name="Informatyka sem. 1",
                institution="PW",
                faculty="MiNI",
                version_token="2026-10-01_v1",  # Unikalny token wersji (np. hash pliku lub data aktualizacji)
                groups=["GR 1", "GR 2", "GR 3"]
            )
        ]

    def fetch_schedule(self, plan_id: str) -> Dict[str, List[RawLesson]]:
        """
        Krok B: pobiera harmonogram dla wskazanego plan_id i parsuje go.
        Zwraca słownik: { "NazwaGrupy": [ RawLesson, RawLesson, ... ] }
        """
        # ... logika pobierania i parsowania (HTML, JSON, Excel, PDF) ...
        return {
            "GR 1": [ ... ],
            "GR 2": [ ... ]
        }
```

### Format obiektu `RawLesson`
Każde zajęcia muszą zostać zmapowane na model `RawLesson` zgodny ze **[Specyfikacją danych harmonogramu (v1)](Specyfikacja-danych-harmonogramu-(v1))**:

```python
RawLesson(
    subject="Matematyka Dyskretna",
    raw_subject="MAT-DYS",  # Oryginalny skrót z dziekanatu
    start_time="08:15",
    end_time="09:45",
    duration_minutes=90,
    teacher="dr Jan Kowalski",
    room="Aula 101",
    form="lecture",         # lecture | exercise | lab | simulator | project | seminar | clinic | elective | other
    day_of_week="MON",      # MON | TUE | WED | THU | FRI | SAT | SUN
    hideable=False,         # True dla zajęć fakultatywnych/wybieralnych

    # Opcjonalne reguły cykli (zajęcia co 2 tygodnie lub połówki semestru):
    interval_weeks=1,       # 1 = co tydzień, 2 = co dwa tygodnie
    start_week=1,           # 1 = tydzień nieparzysty (A), 2 = tydzień parzysty (B)
    half_semester=None      # 1 = I połowa semestru, 2 = II połowa semestru, None = cały semestr
)
```

---

## 4. Krok 3: przygotowanie plików tenanta (`tenants/...`)

W katalogu `tenants/<id_uczelni>/<id_wydzialu>/` przygotuj następujące pliki:

1. **`config.json`** — nazwa uczelni i wydziału, włączone moduły oraz zasady zgłaszania błędów. Zobacz: **[Konfiguracja tenanta](Konfiguracja-tenanta-(config.json))** oraz **[Pliki i konfiguracja tenanta](Pliki-i-konfiguracja-tenanta)**.
2. **`theme.css`** — kolory uczelni w postaci zmiennych CSS (`--accent`, `--bg-primary` itd.).
3. **`academic_calendar.json`** — początek i koniec semestru, święta, dni wolne i zamiany dni. Zobacz: **[Kalendarz akademicki](Kalendarz-akademicki)**.
4. **`icon.png`** (512×512 px) oraz opcjonalnie **`logo.svg`** — zobacz: **[Wymagania dotyczące grafik](Wymagania-dotyczace-grafik)**.
5. **`aliases.json`** *(opcjonalnie)* — słownik ujednolicający skróty i literówki w nazwach przedmiotów i prowadzących.

---

## 5. Krok 4: rejestracja w `config.json`

W pliku `tenants/<id_uczelni>/<id_wydzialu>/config.json` wskaż klasę adaptera:

```json
{
  "id": "pw_mini",
  "source_adapters": [
    "sources.pw.mini.adapter.MyFacultyScheduleSource"
  ]
}
```

---

## 6. Krok 5: budowanie i podgląd lokalny

Sprawdź działanie adaptera za pomocą kompilatora:

```powershell
# Zbuduj aplikację dla swojego adaptera:
python -m core.build --tenant pw/mini --limit 1

# Uruchom podgląd w przeglądarce:
python -m http.server 8080 --directory dist
```

Otwórz w przeglądarce adres `http://localhost:8080` i sprawdź:
- czy plany i grupy ładują się poprawnie,
- czy godziny i sale zgadzają się z oficjalnym planem,
- czy kolory form zajęć (wykład, ćwiczenia, laboratorium) są czytelne.

---

## 7. Krok 6: testy i Pull Request

Gdy wszystko działa:
1. Napisz test jednostkowy w `tests/test_<twoja_uczelnia>_adapter.py`, korzystając z przykładowego pliku testowego (np. fragmentu HTML lub arkusza Excel). Zobacz: **[Jak testować i wdrażać](Jak-testowac-i-wdrazac)**.
2. Uruchom testy: `npm test` oraz `python -m unittest discover -s tests -p "test_*.py"`.
3. Otwórz Pull Request do repozytorium **[Qu4X/uniplaner](https://github.com/Qu4X/uniplaner)**.
