"""
Adapter źródła dla planów niestacjonarnych UMG (system Arktur NST PDF).
Opakowuje nst_client oraz nst_parser.
Mapuje dane na kontrakt RawLesson z jawnie wypełnionymi occurrences.
"""
import os
import re
import logging
from typing import List, Dict, Optional, Any
from datetime import datetime

from sources.base import ScheduleSource, PlanMetadata, RawLesson
from sources.umg_wn.nst_client import fetch_nst_plans_list, download_pdf_file
from sources.umg_wn.nst_parser import parse_pdf_schedule

logger = logging.getLogger("umg_arktur_nst")


class UmgArkturNstSource:
    source_id = "umg_arktur_nst"

    def __init__(self, cache_dir: Optional[str] = None):
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        self.cache_dir = cache_dir or os.path.join(base_dir, "cache", "nst")
        os.makedirs(self.cache_dir, exist_ok=True)
        self._plans_cache: Dict[str, Dict[str, str]] = {}

    def discover(self) -> List[PlanMetadata]:
        discovered: List[PlanMetadata] = []
        try:
            plans_raw = fetch_nst_plans_list()
        except Exception as e:
            logger.warning(f"Błąd discover NST: {e}")
            return []

        for p in plans_raw:
            pid = str(p.get("id"))
            clean_id = f"nst_{pid}" if not pid.startswith("nst_") else pid
            self._plans_cache[clean_id] = p
            name = p.get("name", "")
            m_sem = re.search(r'\bsem\.?\s*(\d+)\b', name, re.IGNORECASE)
            sem_num = int(m_sem.group(1)) if m_sem else None

            # Token wersji oparty o modified/url lub wersję
            version_token = p.get("modified") or p.get("pdf_url") or "nst_v1"

            discovered.append(PlanMetadata(
                id=clean_id,
                institution="umg",
                faculty="wn",
                name=f"{name} (niestacjonarne)",
                study_mode="part_time",
                semester_number=sem_num,
                version_token=version_token,
                published_at=p.get("modified"),
                groups=[]
            ))

        return discovered

    def fetch_schedule(self, plan_id: str, pdf_path: Optional[str] = None) -> Dict[str, List[RawLesson]]:
        target_pdf_path = pdf_path
        if not target_pdf_path:
            clean_id = f"nst_{plan_id}" if not plan_id.startswith("nst_") else plan_id
            if clean_id not in self._plans_cache:
                self.discover()
            plan_info = self._plans_cache.get(clean_id)
            if not plan_info:
                return {}
            filename = plan_info.get("filename") or f"{clean_id}.pdf"
            target_pdf_path = os.path.join(self.cache_dir, filename)
            if not os.path.exists(target_pdf_path):
                ok = download_pdf_file(plan_info["pdf_url"], target_pdf_path)
                if not ok:
                    return {}

        if not target_pdf_path or not os.path.exists(target_pdf_path):
            return {}

        parsed_by_group = parse_pdf_schedule(target_pdf_path)
        if not parsed_by_group:
            return {}

        result: Dict[str, List[RawLesson]] = {}

        for group_name, dates_dict in parsed_by_group.items():
            lessons_list: List[RawLesson] = []

            for date_iso, daily_lessons in dates_dict.items():
                for item in daily_lessons:
                    hours = item.get("godziny", "")
                    if " - " not in hours and "-" in hours:
                        hours = hours.replace("-", " - ")
                    if " - " not in hours:
                        continue
                    sh, eh = hours.split(" - ")
                    sh, eh = sh.strip(), eh.strip()

                    try:
                        sh_h, sh_m = map(int, sh.split(":"))
                        eh_h, eh_m = map(int, eh.split(":"))
                        duration = (eh_h * 60 + eh_m) - (sh_h * 60 + sh_m)
                    except ValueError:
                        duration = 90

                    forma_str = (item.get("forma") or "").lower()
                    form = "lecture" if "wyk" in forma_str else (
                        "lab" if "lab" in forma_str else (
                            "simulator" if "sym" in forma_str else "exercise"
                        )
                    )

                    room = item.get("sala")
                    is_remote = False
                    if room:
                        room_str = str(room).strip()
                        if room_str.upper() in ("OL", "BRAK SALI"):
                            is_remote = True
                            room = None
                        else:
                            room = room_str

                    # Wyznaczenie dnia tygodnia z daty ISO
                    try:
                        dt = datetime.strptime(date_iso, "%Y-%m-%d")
                        dow_map = {0: "MON", 1: "TUE", 2: "WED", 3: "THU", 4: "FRI", 5: "SAT", 6: "SUN"}
                        dow = dow_map.get(dt.weekday())
                    except Exception:
                        dow = None

                    raw_item = RawLesson(
                        subject=item.get("przedmiot", ""),
                        raw_subject=item.get("raw_przedmiot"),
                        start_time=sh,
                        end_time=eh,
                        duration_minutes=duration,
                        form=form,
                        teacher=item.get("prowadzacy"),
                        room=room,
                        remote=is_remote,
                        hideable=False,
                        day_of_week=dow,
                        start_date=date_iso,
                        interval_weeks=1,
                        weeks=1,
                        groups=[group_name],
                        occurrences=[{"date": date_iso, "number": 1, "of": 1}]
                    )
                    lessons_list.append(raw_item)

            result[group_name] = lessons_list

        return result
