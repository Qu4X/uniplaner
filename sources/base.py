"""
Baza i protokół dla adapterów źródeł planów (ScheduleSource).
"""
from typing import Protocol, List, Dict, Optional, Any
from dataclasses import dataclass, field


@dataclass
class PlanMetadata:
    id: str
    institution: str
    faculty: str
    name: str
    study_mode: str  # "full_time" | "part_time"
    semester_number: Optional[int]
    version_token: str
    groups: List[str] = field(default_factory=list)
    published_at: Optional[str] = None
    version: Optional[str] = None
    archived: bool = False


@dataclass
class RawLesson:
    subject: str
    start_time: str      # "HH:MM"
    end_time: str        # "HH:MM"
    duration_minutes: int
    form: str            # "lecture" | "exercise" | "lab" | "simulator" | "project" | "seminar" | "elective" | "other"
    teacher: Optional[str] = None
    room: Optional[str] = None
    remote: bool = False
    hideable: bool = False
    raw_subject: Optional[str] = None
    day_of_week: Optional[str] = None  # "MON".."SUN" (None dla NST)
    start_date: Optional[str] = None   # "YYYY-MM-DD"
    interval_weeks: int = 1
    start_week: int = 1
    half_semester: Optional[int] = None
    weeks: int = 15
    groups: List[str] = field(default_factory=list)
    occurrences: Optional[List[Dict[str, Any]]] = None  # Dla planów o stałych terminach (np. NST)



class ScheduleSource(Protocol):
    source_id: str

    def discover(self) -> List[PlanMetadata]:
        """
        Lekkie pobranie listy planów oraz tokenów wersji.
        Nie ściąga i nie parsuje pełnych siatek.
        """
        ...

    def fetch_schedule(self, plan_id: str) -> Dict[str, List[RawLesson]]:
        """
        Pobranie i sparsowanie planu dla wskazanego plan_id.
        Zwraca słownik grup: { nazwa_grupy: [RawLesson, ...] }
        """
        ...
