"""
sources/sggw_weta/adapter.py — Adapter źródeł planów zajęć SGGW WMW (ScheduleSource).
"""
import os
import hashlib
import logging
from typing import List, Dict, Optional, Any
from sources.base import ScheduleSource, PlanMetadata, RawLesson
from sources.sggw.weta.client import DEFAULT_WMW_PLANS, download_plan_file
from sources.sggw.weta.parser import parse_sggw_excel

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
    "staz": "project",
    "fakultet": "elective"
}


def _calc_duration_minutes(start_time: str, end_time: str) -> int:
    try:
        sh, sm = map(int, start_time.split(":"))
        eh, em = map(int, end_time.split(":"))
        diff = (eh * 60 + em) - (sh * 60 + sm)
        return diff if diff > 0 else 90
    except Exception:
        return 90


def _load_plans_from_tenant_config() -> Optional[Dict[str, Any]]:
    try:
        import json
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
        cfg_path = os.path.join(base_dir, "tenants", "sggw", "weta", "config.json")
        if os.path.exists(cfg_path):
            with open(cfg_path, "r", encoding="utf-8") as f:
                cfg = json.load(f)
            return cfg.get("sources", {}).get("plans")
    except Exception:
        pass
    return None


class SggwExcelSource:
    source_id = "sggw_weta_excel"

    def __init__(
        self,
        cache_dir: str = "temp/sggw",
        plans_config: Optional[Dict[str, Any]] = None,
        download_on_discover: bool = True
    ):
        self.cache_dir = cache_dir
        self.plans = plans_config or _load_plans_from_tenant_config() or DEFAULT_WMW_PLANS
        self.download_on_discover = download_on_discover
        os.makedirs(self.cache_dir, exist_ok=True)

    def discover(self) -> List[PlanMetadata]:
        """
        Wykrywa dostępne plany SGGW WMW.
        Zgodnie z kontraktem adaptera dla źródeł plikowych (SharePoint XLSX),
        pobiera plik binarny do cache (bez jego parsowania) i wylicza SHA-256 zawartości.
        """
        metadata_list = []
        for plan_id, info in self.plans.items():
            url = info.get("sharepoint_url", "")
            url_hash = hashlib.sha256(url.encode("utf-8")).hexdigest()[:16]
            cached_path = os.path.join(self.cache_dir, f"{plan_id}.xlsx")

            if not os.path.exists(cached_path) and self.download_on_discover and url:
                download_plan_file(url, cached_path)

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
                    lesson_dicts = []
                    if isinstance(slot_val, dict):
                        if "subject" in slot_val or "przedmiot" in slot_val:
                            lesson_dicts.append(slot_val)
                        else:
                            lesson_dicts.extend([
                                v for v in slot_val.values()
                                if isinstance(v, dict) and ("subject" in v or "przedmiot" in v)
                            ])

                    for l in lesson_dicts:
                        hours_str = l.get("hours") or l.get("godziny") or "08:00 - 09:30"
                        parts = [p.strip() for p in hours_str.split("-")]
                        start_time = parts[0] if len(parts) > 0 else "08:00"
                        end_time = parts[1] if len(parts) > 1 else "09:30"
                        duration = _calc_duration_minutes(start_time, end_time)

                        raw_form = l.get("form") or l.get("forma") or "cwiczenia"
                        form = FORM_MAP.get(raw_form, "exercise")
                        is_elective = (form == "elective")

                        subj = l.get("subject") or l.get("przedmiot") or ""
                        raw_subj = l.get("raw_subject") or l.get("raw_przedmiot") or subj
                        lesson_groups = l.get("groups") or [group_name]

                        raw_lesson = RawLesson(
                            subject=subj,
                            raw_subject=raw_subj,
                            start_time=start_time,
                            end_time=end_time,
                            duration_minutes=duration,
                            form=form,
                            teacher=l.get("teacher") or l.get("prowadzacy") or None,
                            room=l.get("room") or l.get("sala") or None,
                            hideable=is_elective,
                            day_of_week=day_en,
                            start_date=l.get("start_date") or l.get("data_start"),
                            interval_weeks=l.get("interval_weeks") or l.get("co_ile") or 1,
                            start_week=l.get("start_week") or l.get("od_tyg") or 1,
                            half_semester=l.get("half_semester") if "half_semester" in l else l.get("polowa_sem"),
                            weeks=l.get("weeks") or l.get("tygodnie") or 15,
                            groups=list(lesson_groups)
                        )
                        group_lessons.append(raw_lesson)

            result[group_name] = group_lessons

        return result

