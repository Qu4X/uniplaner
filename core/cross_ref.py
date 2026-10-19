"""
Budowanie indeksów wyszukiwarki sal, wykładowców i przedmiotów (cross_reference.json).
Obsługuje zarówno format kontraktu v1 (GroupSchedule), jak i format legacy UMG.
"""
import os
import re
import json
import logging
from datetime import datetime
from typing import Dict, List, Any, Optional, Set

logger = logging.getLogger("core.cross_ref")

DNI_ORDER = {"PON": 1, "WT": 2, "ŚR": 3, "CZW": 4, "PT": 5, "SOB": 6, "ND": 7}
DOW_TO_PL = {
    "MON": "PON",
    "TUE": "WT",
    "WED": "ŚR",
    "THU": "CZW",
    "FRI": "PT",
    "SAT": "SOB",
    "SUN": "ND"
}


def _is_same_cycle(
    entry: Dict[str, Any],
    co_ile: int,
    od_tyg: int,
    polowa_sem: Optional[int],
    data_start: str
) -> bool:
    """Weryfikuje, czy wpis planu należy do tego samego cyklu i połowy semestru."""
    return (
        entry.get("co_ile", 1) == co_ile
        and entry.get("od_tyg", 1) == od_tyg
        and entry.get("polowa_sem") == polowa_sem
        and entry.get("data_start", "") == data_start
    )


def build_cross_reference_indexes(
    plans_metadata: Optional[Dict[str, Any]] = None,
    schedules_dir: str = "",
    output_path: Optional[str] = None,
    curriculum_catalog_path: Optional[str] = None
) -> Dict[str, Any]:
    """
    Buduje połączony indeks nauczycieli, sal i przedmiotów.
    Zwraca słownik indeksu i opcjonalnie zapisuje go do output_path.
    """
    if not schedules_dir or not os.path.exists(schedules_dir):
        logger.warning(f"Katalog planów nie istnieje: {schedules_dir}")
        return {}

    json_files = [f for f in os.listdir(schedules_dir) if f.endswith(".json") and f != "cross_reference.json"]
    if not json_files:
        logger.warning(f"Brak plików planów w katalogu: {schedules_dir}")
        return {}

    raw_plans = (plans_metadata or {}).get("plans", {})
    if isinstance(raw_plans, list):
        plans_dict = {str(p["id"]): p for p in raw_plans if isinstance(p, dict) and "id" in p}
    elif isinstance(raw_plans, dict):
        plans_dict = raw_plans
    else:
        plans_dict = {}

    if not plans_dict:
        logger.warning("Brak metadanych planów do budowy indeksów cross-reference.")

    # Wczytaj katalog przedmiotów (np. WN catalog)
    wn_catalog: Dict[str, Any] = {}
    if curriculum_catalog_path and os.path.exists(curriculum_catalog_path):
        try:
            with open(curriculum_catalog_path, "r", encoding="utf-8") as wf:
                wn_catalog = json.load(wf)
        except Exception as e:
            logger.warning(f"Nie udało się wczytać katalogu przedmiotów {curriculum_catalog_path}: {e}")

    wn_lower = {k.lower(): (k, v) for k, v in wn_catalog.items()}

    teachers_index: Dict[str, List[Dict[str, Any]]] = {}
    rooms_index: Dict[str, Dict[str, List[Dict[str, Any]]]] = {}
    subjects_index: Dict[str, Dict[str, Any]] = {}
    room_set: Set[str] = set()

    for plan_id_str, plan_info in plans_dict.items():
        plan_name = plan_info.get("name", f"Plan {plan_id_str}")
        groups = plan_info.get("groups", [])

        for group in groups:
            safe_group = re.sub(r'[^\w-]', '_', group)
            schedule_filename = f"{plan_id_str}_{safe_group}.json"
            schedule_path = os.path.join(schedules_dir, schedule_filename)
            if not os.path.exists(schedule_path):
                continue

            try:
                with open(schedule_path, "r", encoding="utf-8") as sf:
                    schedule_data = json.load(sf)
            except Exception as e:
                logger.error(f"Błąd odczytu {schedule_path}: {e}")
                continue

            entries_to_index: List[Dict[str, Any]] = []

            # 1. Format kontraktu v1: {"plan_id": ..., "group": ..., "lessons": [...]}
            if isinstance(schedule_data, dict) and "lessons" in schedule_data and isinstance(schedule_data["lessons"], list):
                for lesson in schedule_data["lessons"]:
                    dow = lesson.get("day_of_week") or ""
                    day_pl = DOW_TO_PL.get(dow, dow)
                    sh = lesson.get("start_time", "")
                    eh = lesson.get("end_time", "")
                    hours = f"{sh} - {eh}" if sh and eh else sh

                    # Wyznaczenie numeru slotu ze start_time (np. 08:00 -> 24 w siatce 15m)
                    slot = 0
                    if sh and ":" in sh:
                        try:
                            hh, mm = map(int, sh.split(":"))
                            slot = (hh * 60 + mm) // 15
                        except ValueError:
                            slot = 0

                    occurrences = lesson.get("occurrences", [])
                    data_start = occurrences[0]["date"] if occurrences else lesson.get("start_date", "")

                    item = {
                        "day": day_pl,
                        "slot": slot,
                        "hours": hours,
                        "subject": lesson.get("subject", ""),
                        "raw_subject": lesson.get("raw_subject") or lesson.get("subject", ""),
                        "teacher": lesson.get("teacher"),
                        "room": lesson.get("room"),
                        "group": group,
                        "plan_id": plan_id_str,
                        "plan_name": plan_name,
                        "weeks": len(occurrences) if occurrences else (lesson.get("weeks") or 1),
                        "data_start": data_start,
                        "co_ile": lesson.get("interval_weeks", 1) or 1,
                        "od_tyg": lesson.get("start_week", 1) or 1,
                        "polowa_sem": lesson.get("half_semester"),
                        "dates": [occ["date"] for occ in occurrences] if occurrences else []
                    }
                    entries_to_index.append(item)

            # 2. Format legacy full-time: {"PON": {"24": lesson_dict}}
            elif isinstance(schedule_data, dict):
                for key, val in schedule_data.items():
                    if isinstance(val, dict):
                        day = key
                        for slot_str, lesson in val.items():
                            try:
                                slot = int(str(slot_str).split('_')[0])
                            except ValueError:
                                slot = 0
                            hours = (lesson.get("godziny") or "").strip()
                            entries_to_index.append({
                                "day": day,
                                "slot": slot,
                                "hours": hours,
                                "subject": (lesson.get("przedmiot") or "").strip(),
                                "raw_subject": (lesson.get("raw_przedmiot") or lesson.get("przedmiot") or "").strip(),
                                "teacher": (lesson.get("prowadzacy") or "").strip(),
                                "room": (lesson.get("sala") or "").strip(),
                                "group": group,
                                "plan_id": plan_id_str,
                                "plan_name": plan_name,
                                "weeks": lesson.get("tygodnie", 1),
                                "data_start": lesson.get("data_start", ""),
                                "co_ile": int(lesson.get("co_ile", 1) or 1),
                                "od_tyg": int(lesson.get("od_tyg", 1) or 1),
                                "polowa_sem": lesson.get("polowa_sem"),
                                "dates": []
                            })
                    # Format legacy part-time (NST): {"2026-10-01": [lesson_dict, ...]}
                    elif isinstance(val, list):
                        date_iso = key
                        for idx, lesson in enumerate(val):
                            raw_day_name = lesson.get("dzien", "").strip()
                            day_name_to_code = {
                                "Poniedziałek": "PON", "Wtorek": "WT", "Środa": "ŚR",
                                "Czwartek": "CZW", "Piątek": "PT", "Sobota": "SOB", "Niedziela": "ND"
                            }
                            day_code = day_name_to_code.get(raw_day_name)
                            if not day_code:
                                try:
                                    dt = datetime.strptime(date_iso, "%Y-%m-%d")
                                    day_code = {0: "PON", 1: "WT", 2: "ŚR", 3: "CZW", 4: "PT", 5: "SOB", 6: "ND"}[dt.weekday()]
                                except Exception:
                                    day_code = "SOB"

                            hours = (lesson.get("godziny") or "").strip()
                            entries_to_index.append({
                                "day": day_code,
                                "slot": idx + 1,
                                "hours": hours,
                                "subject": (lesson.get("przedmiot") or "").strip(),
                                "raw_subject": (lesson.get("raw_przedmiot") or lesson.get("przedmiot") or "").strip(),
                                "teacher": (lesson.get("prowadzacy") or "").strip(),
                                "room": (lesson.get("sala") or "").strip(),
                                "group": group,
                                "plan_id": plan_id_str,
                                "plan_name": plan_name,
                                "weeks": 1,
                                "data_start": date_iso,
                                "co_ile": 1,
                                "od_tyg": 1,
                                "polowa_sem": None,
                                "dates": [date_iso]
                            })

            # Agregacja do indeksów
            for item in entries_to_index:
                subject = item["subject"]
                raw_subject = item["raw_subject"]
                teacher = item["teacher"]
                room = item["room"]
                day = item["day"]
                slot = item["slot"]
                hours = item["hours"]
                co_ile = item["co_ile"]
                od_tyg = item["od_tyg"]
                polowa_sem = item["polowa_sem"]
                data_start = item["data_start"]
                weeks = item["weeks"]
                dates = item["dates"]

                if not subject:
                    continue

                # 1. Nauczyciele
                if teacher and teacher != "Brak danych prowadzącego":
                    if teacher not in teachers_index:
                        teachers_index[teacher] = []

                    deduped = False
                    for entry in teachers_index[teacher]:
                        if (entry["day"] == day and entry["slot"] == slot and
                            entry["hours"] == hours and entry["subject"] == subject and
                            entry["room"] == room and entry["plan_id"] == plan_id_str and
                            _is_same_cycle(entry, co_ile, od_tyg, polowa_sem, data_start)):
                            if group not in entry["groups"]:
                                entry["groups"].append(group)
                            deduped = True
                            break
                    if not deduped:
                        teachers_index[teacher].append({
                            "day": day,
                            "slot": slot,
                            "hours": hours,
                            "subject": subject,
                            "raw_subject": raw_subject,
                            "room": room,
                            "groups": [group],
                            "plan_id": plan_id_str,
                            "plan_name": plan_name,
                            "weeks": weeks,
                            "data_start": data_start,
                            "co_ile": co_ile,
                            "od_tyg": od_tyg,
                            "polowa_sem": polowa_sem,
                            "dates": dates
                        })

                # 2. Sale (wykluczamy wirtualne 'OL' lub puste)
                if room and str(room).upper() != "OL":
                    room_str = str(room).strip()
                    room_set.add(room_str)
                    if room_str not in rooms_index:
                        rooms_index[room_str] = {d: [] for d in DNI_ORDER.keys()}

                    if day in rooms_index[room_str]:
                        deduped = False
                        for entry in rooms_index[room_str][day]:
                            if (entry["slot"] == slot and entry["hours"] == hours and
                                entry["subject"] == subject and entry["plan_id"] == plan_id_str and
                                _is_same_cycle(entry, co_ile, od_tyg, polowa_sem, data_start)):
                                if group not in entry["groups"]:
                                    entry["groups"].append(group)
                                if not entry.get("teacher") and teacher:
                                    entry["teacher"] = teacher
                                deduped = True
                                break
                        if not deduped:
                            rooms_index[room_str][day].append({
                                "slot": slot,
                                "hours": hours,
                                "subject": subject,
                                "teacher": teacher,
                                "groups": [group],
                                "plan_id": plan_id_str,
                                "plan_name": plan_name,
                                "weeks": weeks,
                                "data_start": data_start,
                                "co_ile": co_ile,
                                "od_tyg": od_tyg,
                                "polowa_sem": polowa_sem,
                                "dates": dates
                            })

                # 3. Przedmioty
                if subject not in subjects_index:
                    wn_match = wn_lower.get(subject.lower())
                    wn_meta = wn_match[1] if wn_match else {}
                    subjects_index[subject] = {
                        "subject": subject,
                        "raw_variants": [],
                        "teachers": [],
                        "majors": wn_meta.get("majors", []),
                        "syllabus_url": wn_meta.get("syllabus_url", ""),
                        "plans": {}
                    }

                if raw_subject and raw_subject not in subjects_index[subject]["raw_variants"]:
                    subjects_index[subject]["raw_variants"].append(raw_subject)
                if teacher and teacher not in subjects_index[subject]["teachers"]:
                    subjects_index[subject]["teachers"].append(teacher)

                if plan_id_str not in subjects_index[subject]["plans"]:
                    subjects_index[subject]["plans"][plan_id_str] = {
                        "plan_id": plan_id_str,
                        "plan_name": plan_name,
                        "groups": []
                    }
                if group not in subjects_index[subject]["plans"][plan_id_str]["groups"]:
                    subjects_index[subject]["plans"][plan_id_str]["groups"].append(group)

    # Sortowanie wpisów
    for teacher, entries in teachers_index.items():
        entries.sort(key=lambda x: (DNI_ORDER.get(x["day"], 99), x["slot"]))

    for room, days_dict in rooms_index.items():
        for d, r_entries in days_dict.items():
            r_entries.sort(key=lambda x: x["slot"])

    for sub, info in subjects_index.items():
        info["plans"] = list(info["plans"].values())
        info["teachers"].sort()
        info["raw_variants"].sort()

    room_list = sorted(list(room_set), key=lambda r: (0 if "aula" in r.lower() else 1, r))

    cross_reference_data = {
        "teachers": teachers_index,
        "rooms": rooms_index,
        "subjects": subjects_index,
        "room_list": room_list,
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M")
    }

    if output_path:
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as out_f:
            json.dump(cross_reference_data, out_f, ensure_ascii=False, indent=2)

    return cross_reference_data
