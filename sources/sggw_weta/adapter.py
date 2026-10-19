"""
sources/sggw_weta/adapter.py — Adapter źródeł planów zajęć SGGW WMW (ScheduleSource).
"""
import os
import hashlib
import logging
from typing import List, Dict, Optional, Any
from sources.base import ScheduleSource, PlanMetadata, RawLesson
from sources.sggw_weta.client import DEFAULT_WMW_PLANS, download_plan_file
from sources.sggw_weta.parser import parse_sggw_excel

logger = logging.getLogger("sggw_adapter")

POLISH_TO_EN_DAY = {
    "PON": "MON",
    "WT": "TUE",
    "ŚR": "WED",
    "CZW": "THU",
    "PT": "FRI",
    "SOB": "SAT",
    "ND": "SUN"
}

FORM_MAP = {
    "wyklad": "lecture",
    "cwiczenia": "exercise",
    "laboratorium": "lab",
    "staz": "clinic",
    "fakultet": "elective"
}


def _calc_duration_minutes(start_time: str, end_time: str) -> int:
    try:
        sh, sm = map(int, start_time.split(":"))
        eh, em = map(int, end_time.split(":"))
        return (eh * 60 + em) - (sh * 60 + sm)
    except Exception:
        return 90


class SggwExcelSource:
    source_id = "sggw_weta_excel"

    def __init__(self, cache_dir: str = "temp/sggw", plans_config: Optional[Dict[str, Any]] = None):
        self.cache_dir = cache_dir
        self.plans = plans_config or DEFAULT_WMW_PLANS
        os.makedirs(self.cache_dir, exist_ok=True)

    def discover(self) -> List[PlanMetadata]:
        metadata_list = []
        for plan_id, info in self.plans.items():
            # Lekki token wersji: hash URL-a lub ETag
            url = info.get("sharepoint_url", "")
            url_hash = hashlib.sha256(url.encode("utf-8")).hexdigest()[:12]
            
            # Jeśli plik już pobrany w cache, użyj hasha zawartości
            cached_path = os.path.join(self.cache_dir, f"{plan_id}.xlsx")
            if os.path.exists(cached_path):
                try:
                    with open(cached_path, "rb") as f:
                        version_token = hashlib.sha256(f.read()).hexdigest()[:16]
                except Exception:
                    version_token = url_hash
            else:
                version_token = url_hash

            metadata_list.append(
                PlanMetadata(
                    id=plan_id,
                    institution="SGGW",
                    faculty="WMW",
                    name=info.get("name", plan_id),
                    study_mode="full_time",
                    semester_number=info.get("semester"),
                    version_token=version_token
                )
            )
        return metadata_list

    def fetch_schedule(self, plan_id: str, custom_xlsx_path: Optional[str] = None) -> Dict[str, List[RawLesson]]:
        xlsx_path = custom_xlsx_path
        if not xlsx_path or not os.path.exists(xlsx_path):
            xlsx_path = os.path.join(self.cache_dir, f"{plan_id}.xlsx")

        if not os.path.exists(xlsx_path):
            info = self.plans.get(plan_id)
            if not info or not info.get("sharepoint_url"):
                raise ValueError(f"Nieznany plan SGGW: {plan_id}")
            success = download_plan_file(info["sharepoint_url"], xlsx_path)
            if not success:
                raise RuntimeError(f"Nie udało się pobrać arkusza dla planu {plan_id}")

        parsed_grid = parse_sggw_excel(xlsx_path)
        result: Dict[str, List[RawLesson]] = {}

        for group_name, days in parsed_grid.items():
            group_lessons: List[RawLesson] = []
            for day_pl, slots in days.items():
                day_en = POLISH_TO_EN_DAY.get(day_pl, "MON")

                for slot_key, slot_val in slots.items():
                    # slot_val może zawierać pojedynczą lekcję lub słownik kolidujących lekcji {0: l1, 1: l2}
                    lesson_dicts = []
                    if isinstance(slot_val, dict):
                        if "przedmiot" in slot_val:
                            lesson_dicts.append(slot_val)
                        else:
                            lesson_dicts.extend([v for v in slot_val.values() if isinstance(v, dict) and "przedmiot" in v])

                    for l in lesson_dicts:
                        godziny = l.get("godziny", "08:00 - 09:30")
                        parts = [p.strip() for p in godziny.split("-")]
                        start_time = parts[0] if len(parts) > 0 else "08:00"
                        end_time = parts[1] if len(parts) > 1 else "09:30"
                        duration = _calc_duration_minutes(start_time, end_time)

                        raw_forma = l.get("forma", "cwiczenia")
                        form = FORM_MAP.get(raw_forma, "exercise")
                        is_elective = (form == "elective")

                        raw_lesson = RawLesson(
                            subject=l.get("przedmiot", ""),
                            raw_subject=l.get("raw_przedmiot", l.get("przedmiot", "")),
                            start_time=start_time,
                            end_time=end_time,
                            duration_minutes=duration,
                            form=form,
                            teacher=l.get("prowadzacy") or None,
                            room=l.get("sala") or None,
                            hideable=is_elective,
                            day_of_week=day_en,
                            start_date=l.get("data_start"),
                            interval_weeks=l.get("co_ile", 1),
                            start_week=l.get("od_tyg", 1),
                            half_semester=l.get("polowa_sem"),
                            weeks=l.get("tygodnie", 15),
                            groups=[group_name]
                        )
                        group_lessons.append(raw_lesson)

            result[group_name] = group_lessons

        return result
