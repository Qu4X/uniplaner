# Przewodnik Tworzenia Adaptera Źródła (`adapter-guide.md`)

Wersja: `1`  
Status: Zaakceptowany (Faza 0)  
Data utworzenia: 2026-10-19  

Adapter źródła odpowiada za komunikację z systemem uczelni (scraping HTML, API, pobieranie arkuszy Excel/PDF) i przekształcenie ich w zunifikowaną strukturę `RawLesson`.

Adapter **nie wylicza** dat wystąpień (`occurrences`) ani hashy `lesson.id` — tym zajmuje się wspólny moduł `core/`.

---

## 1. Interfejs `ScheduleSource` w Pythonie

Plik bazowy: `sources/base.py`

```python
from typing import Protocol, List, Dict, Optional
from dataclasses import dataclass

@dataclass
class PlanMetadata:
    id: str
    institution: str
    faculty: str
    name: str
    study_mode: str  # "full_time" | "part_time"
    semester_number: Optional[int]
    version_token: str  # np. sha256 arkusza lub wer. X z Arktura
    published_at: Optional[str]
    groups: List[str]
    archived: bool = False

@dataclass
class RawLesson:
    subject: str
    start_time: str      # "HH:MM"
    end_time: str        # "HH:MM"
    duration_minutes: int
    form: str            # "lecture" | "exercise" | "lab" | "simulator" | "elective" | ...
    teacher: Optional[str] = None
    room: Optional[str] = None
    remote: bool = False
    hideable: bool = False
    raw_subject: Optional[str] = None
    day_of_week: Optional[str] = None  # "MON".."SUN" (null dla NST)
    start_date: Optional[str] = None   # "YYYY-MM-DD"
    interval_weeks: int = 1
    half_semester: Optional[int] = None
    groups: List[str] = None           # [] = cała grupa / rocznik

class ScheduleSource(Protocol):
    source_id: str

    def discover(self) -> List[PlanMetadata]:
        """
        Lekka operacja: pobiera listę planów i ich version_token.
        Nie ściąga i nie parsuje pełnych siatek godzinowych.
        """
        ...

    def fetch_schedule(self, plan_id: str) -> Dict[str, List[RawLesson]]:
        """
        Ciężka operacja: pobiera i parsuje plan dla wskazanego plan_id.
        Zwraca słownik: { nazwa_grupy: [RawLesson, ...] }
        """
        ...
```

---

## 2. Krok po kroku: jak dodać nową uczelnię / wydział

1. Utwórz katalog adaptera: `sources/<nazwa_adaptera>/` (lub skorzystaj z szablonu `sources/_template/`).
2. Zaimplementuj klasę dziedziczącą / zgodną z `ScheduleSource`.
3. Zmapuj lokalne nazewnictwo form na standardowy enum (`lecture`, `exercise`, `lab`, `simulator`, `project`, `seminar`, `elective`, `other`).
4. Jeśli w planie istnieją zajęcia podlegające indywidualnemu ukrywaniu przez studenta, ustaw w nich `hideable = True`.
5. Utwórz konfigurację tenanta w `tenants/<tenant_id>/`:
   - `config.json`
   - `academic_calendar.json`
   - motyw i manifest PWA.
6. Dodaj testy adaptera w `tests/sources/test_<nazwa>.py`.
