"""
sources/_template/adapter.py — Szablon adaptera planu zajęć nowej uczelni.

Instrukcja implementacji:
1. Skopiuj ten katalog jako `sources/<twoj_tenant>/`.
2. Zaimplementuj metody `discover()` oraz `fetch_schedule()` w klasie `CustomUniversitySource`.
3. Zarejestruj adapter w orkiestratorze (`core/build.py`) oraz dodaj konfigurację tenanta w `tenants/<twoj_tenant>/config.json`.
4. Napisz testy jednostkowe w `tests/test_<twoj_tenant>_adapter.py`.
"""
from typing import List, Dict, Optional, Any
from sources.base import ScheduleSource, PlanMetadata, RawLesson


class CustomUniversitySource:
    """
    Adapter źródła planu zajęć dla nowej uczelni.
    Muszą być zaimplementowane: `source_id`, `discover()` oraz `fetch_schedule()`.
    """
    source_id: str = "custom_university_source"

    def discover(self) -> List[PlanMetadata]:
        """
        Lekkie pobranie listy planów (kierunków / roczników) wraz z tokenem wersji (np. ETag, hash strony lub timestamp).
        Nie powinno pobierać pełnych siatek ani danych lekcji.
        """
        return [
            PlanMetadata(
                id="przykladowy_plan_1",
                institution="UCZELNIA",
                faculty="WYDZIAL",
                name="Informatyka rok 1",
                study_mode="full_time",
                semester_number=1,
                version_token="v1_token"
            )
        ]

    def fetch_schedule(self, plan_id: str) -> Dict[str, List[RawLesson]]:
        """
        Ciężkie pobranie i sparsowanie siatki zajęć dla podanego plan_id.
        Zwraca słownik:
        {
            "GR_1": [RawLesson(...), RawLesson(...)],
            "GR_2": [RawLesson(...)]
        }
        """
        # Przykładowa lekcja:
        sample_lesson = RawLesson(
            subject="Programowanie obiektowe",
            start_time="08:00",
            end_time="09:30",
            duration_minutes=90,
            form="lecture",  # "lecture", "exercise", "lab", "project", "seminar", "elective", "other"
            teacher="dr hab. Jan Kowalski",
            room="A-101",
            day_of_week="MON",  # "MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"
            start_date="2026-10-01",
            interval_weeks=1,
            start_week=1,
            weeks=15,
            hideable=False,
            groups=["GR_1"]
        )
        return {
            "GR_1": [sample_lesson]
        }
