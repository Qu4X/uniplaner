"""
Czysty model kontraktu danych v1 (TypedDict & Dataclass).
Moduł nie posiada żadnych zależności od systemów uczelni.
"""
from typing import TypedDict, List, Optional, Literal

FormType = Literal[
    "lecture",
    "exercise",
    "lab",
    "simulator",
    "project",
    "seminar",
    "clinic",
    "elective",
    "other"
]

DayOfWeekType = Literal["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]


class Occurrence(TypedDict):
    date: str     # YYYY-MM-DD
    number: int   # 1..of
    of: int       # Całkowita liczba spotkań


class Lesson(TypedDict, total=False):
    # Wymagane
    id: str
    subject: str
    start_time: str      # HH:MM
    end_time: str        # HH:MM
    duration_minutes: int
    form: FormType
    occurrences: List[Occurrence]

    # Opcjonalne
    raw_subject: Optional[str]
    teacher: Optional[str]
    room: Optional[str]
    remote: bool
    hideable: bool
    day_of_week: Optional[DayOfWeekType]
    start_date: Optional[str]
    interval_weeks: int
    half_semester: Optional[int]
    groups: List[str]


class PlanEntry(TypedDict, total=False):
    id: str
    institution: str
    faculty: str
    name: str
    study_mode: Literal["full_time", "part_time"]
    version_token: str
    groups: List[str]
    semester_number: Optional[int]
    published_at: Optional[str]
    archived: bool


class PlansIndex(TypedDict):
    schema_version: int
    tenant: str
    generated_at: str
    plans: List[PlanEntry]


class GroupSchedule(TypedDict):
    schema_version: int
    plan_id: str
    group: str
    generated_at: str
    lessons: List[Lesson]
