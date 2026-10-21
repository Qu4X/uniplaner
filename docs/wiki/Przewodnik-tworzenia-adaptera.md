# Przewodnik tworzenia adaptera dla nowego wydziału 🚀

Ten poradnik przeprowadzi Cię przez proces tworzenia wtyczki dla Twojej uczelni lub wydziału w platformie **Uniplaner**.

Stworzenie nowego adaptera składa się z 5 prostych kroków i zazwyczaj zajmuje od jednego do dwóch wieczorów.

---

## 1. Architektura platformy w skrócie

Wszystko, co piszesz dla swojej uczelni, znajduje się w dwóch dedykowanych folderach:

```
sources/<id_uczelni>/<id_wydzialu>/    <- Twój kod w Pythonie (pobieranie i parsowanie planu)
tenants/<id_uczelni>/<id_wydzialu>/    <- Twoja konfiguracja, ikony, motyw CSS i kalendarz
```

Przykładowe identyfikatory:
- `umg/wn` — Uniwersytet Morski w Gdyni, Wydział Nawigacyjny
- `sggw/weta` — SGGW w Warszawie, Wydział Medycyny Weterynaryjnej
- `pw/mini` — Politechnika Warszawska, Wydział MiNI

> [!IMPORTANT]
> **Zasada czystości rdzenia**: W katalogach `core/` oraz `web/` obowiązuje **całkowity zakaz dodawania kodu specyficznego dla konkretnej uczelni**. Całość logiki uczelnianej musi być hermetycznie zamknięta w katalogu wtyczki.

---

## 2. Krok 1: Skopiowanie szablonu startowego

W repozytorium znajduje się gotowy szablon wtyczki. Skopiuj go:

```bash
# Utwórz strukturę katalogów (np. dla Politechniki Warszawskiej, wydziału MiNI)
cp -r sources/_template sources/pw/mini
mkdir -p tenants/pw/mini
```

W katalogu `sources/pw/mini/` znajdziesz plik `adapter.py` z pustymi szkieletami metod do uzupełnienia.

---

## 3. Krok 2: Implementacja protokołu `ScheduleSource`

Twój adapter musi dziedziczyć po protokole `ScheduleSource` (z `sources.base`) i implementować dwie kluczowe metody:

```python
from typing import List, Dict, Optional
from sources.base import ScheduleSource, PlanMetadata, RawLesson

class MyFacultyScheduleSource:
    source_id = "pw_mini"

    def discover(self) -> List[PlanMetadata]:
        """
        Krok A: Pobiera listę dostępnych planów zajęć na wydziale (kierunki, roczniki, stopnie).
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
        Krok B: Pobiera harmonogram dla wskazanego plan_id i parsuje go.
        Zwraca słownik: { "NazwaGrupy": [ RawLesson, RawLesson, ... ] }
        """
        # ... Twoja logika pobierania i parsowania (HTML, JSON, Excel, PDF) ...
        return {
            "GR 1": [ ... ],
            "GR 2": [ ... ]
        }
```

### Format obiektu `RawLesson`:
Każda lekcja musi być zmapowana do modelu `RawLesson` zgodnego z **[Specyfikacją danych harmonogramu (v1)](Specyfikacja-danych-harmonogramu-(v1))**:

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

## 4. Krok 3: Przygotowanie plików tenanta (`tenants/...`)

W katalogu `tenants/<id_uczelni>/<id_wydzialu>/` przygotuj następujące pliki:

1. **`config.json`** — Nazwa uczelni, wydziału, włączone moduły i routing zgłaszania błędów. Zobacz: **[Konfiguracja tenanta](Pliki-i-konfiguracja-tenanta)**.
2. **`theme.css`** — Kolory uczelni w formacie CSS variables (`--accent`, `--bg-primary` itd.).
3. **`academic_calendar.json`** — Początek i koniec semestru, święta, dni wolne i zamiany dni. Zobacz: **[Kalendarz akademicki](Kalendarz-akademicki)**.
4. **`icon.png`** (512×512 px) oraz opcjonalnie **`logo.svg`** — Zobacz: **[Wymagania dotyczące grafik](Wymagania-dotyczace-grafik)**.
5. **`aliases.json`** *(opcjonalnie)* — Słownik normalizujący skróty i literówki w nazwach przedmiotów lub wykładowców.

---

## 5. Krok 4: Rejestracja w `config.json`

W pliku `tenants/<id_uczelni>/<id_wydzialu>/config.json` wskaż klasę swojego adaptera:

```json
{
  "id": "pw_mini",
  "source_adapters": [
    "sources.pw.mini.adapter.MyFacultyScheduleSource"
  ]
}
```

---

## 6. Krok 5: Budowanie i podgląd lokalny

Przetestuj działanie swojego adaptera za pomocą kompilatora:

```powershell
# Zbuduj aplikację dla swojej wtyczki:
python -m core.build --tenant pw/mini --limit 1

# Uruchom podgląd w przeglądarce:
python -m http.server 8080 --directory dist
```

Otwórz w przeglądarce adres `http://localhost:8080` i sprawdź:
- Czy plany i grupy ładują się poprawnie?
- Czy godziny i sale zgadzają się z oficjalnym planem?
- Czy kolory form zajęć (wykład, ćwiczenia, lab) są czytelne?

---

## 7. Krok 6: Testy i Pull Request

Gdy wszystko działa:
1. Napisz test jednostkowy w `tests/test_<twoja_uczelnia>_adapter.py` na przykładowym pliku fixture (np. wycinku HTML lub arkusza Excel). Zobacz poradnik: **[Jak testować i wdrażać](Jak-testowac-i-wdrazac)**.
2. Uruchom testy: `npm test` oraz `python -m unittest discover -s tests -p "test_*.py"`.
3. Otwórz Pull Request do repozytorium **[Qu4X/uniplaner](https://github.com/Qu4X/uniplaner)**!
