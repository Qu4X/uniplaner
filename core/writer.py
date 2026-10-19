"""
Zapis artefaktów wyjściowych (harmonogramów JSON, plików iCalendar .ics oraz indeksu planów) na dysk.
Zapewnia spójne kodowanie UTF-8, standardowe zakończenia linii w plikach .ics oraz sanityzację nazw plików.
"""
import os
import re
import json
from typing import Dict, Any, Union, Optional


def sanitize_group_name(group: str) -> str:
    """Krytyczny kontrakt Python <-> JS: sanityzacja nazwy grupy dla plików na dysku."""
    return re.sub(r"[^\w-]", "_", group)


def read_existing_group_schedule(schedules_dir: str, plan_id: str, group: str) -> Optional[Dict[str, Any]]:
    """Wczytuje poprzednią wersję harmonogramu grupy z dysku (jeśli istnieje), na potrzeby diffowania."""
    safe_grp = sanitize_group_name(group)
    json_path = os.path.join(schedules_dir, f"{plan_id}_{safe_grp}.json")
    if not os.path.exists(json_path):
        return None
    try:
        with open(json_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def write_group_schedule(schedules_dir: str, plan_id: str, group: str, schedule: Dict[str, Any]) -> str:
    """Zapisuje plik JSON harmonogramu grupy do katalogu docelowego."""
    os.makedirs(schedules_dir, exist_ok=True)
    safe_grp = sanitize_group_name(group)
    json_path = os.path.join(schedules_dir, f"{plan_id}_{safe_grp}.json")
    with open(json_path, "w", encoding="utf-8") as jf:
        json.dump(schedule, jf, ensure_ascii=False, indent=2)
    return json_path


def write_group_ics(calendars_dir: str, plan_id: str, group: str, ics_data: Union[str, bytes]) -> str:
    """Zapisuje plik kalendarza .ics binarnie (bez podwójnego \\r\\r\\n na Windows)."""
    os.makedirs(calendars_dir, exist_ok=True)
    safe_grp = sanitize_group_name(group)
    ics_bytes = ics_data.encode("utf-8") if isinstance(ics_data, str) else ics_data
    ics_path = os.path.join(calendars_dir, f"{plan_id}_{safe_grp}.ics")
    with open(ics_path, "wb") as icsf:
        icsf.write(ics_bytes)
    return ics_path


def write_plans_index(data_dir: str, index_data: Dict[str, Any]) -> str:
    """Zapisuje plik data/plans.json zgodny ze schematem PlansIndex."""
    os.makedirs(data_dir, exist_ok=True)
    plans_json_path = os.path.join(data_dir, "plans.json")
    with open(plans_json_path, "w", encoding="utf-8") as pf:
        json.dump(index_data, pf, ensure_ascii=False, indent=2)
    return plans_json_path
