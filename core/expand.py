"""
Rozwijanie wystąpień spotkań (occurrences) w Pythonie na podstawie reguł kalendarza akademickiego.
Port logiki z web/js/schedule-engine.js (getLessonMeetingInfo) oraz ics_export.py.
Zachowuje twarde zabezpieczenia: guard na nieznany dzień ('Inny') oraz limit MAX_ITER = 200.
"""
from datetime import datetime, date, timedelta
from typing import Dict, Any, List, Optional
from core.contracts import Occurrence

WEEKDAY_TO_DOW = {
    0: "MON",
    1: "TUE",
    2: "WED",
    3: "THU",
    4: "FRI",
    5: "SAT",
    6: "SUN"
}

DOW_TO_WEEKDAY = {v: k for k, v in WEEKDAY_TO_DOW.items()}

# Mapowanie polskich kodów z academic_calendar na DOW
PL_CODE_TO_DOW = {
    "PON": "MON",
    "WT": "TUE",
    "ŚR": "WED",
    "SR": "WED",
    "CZW": "THU",
    "PT": "FRI",
    "SOB": "SAT",
    "ND": "SUN"
}


def get_monday(d: date) -> date:
    return d - timedelta(days=d.weekday())


def is_teaching_day(iso_str: str, calendar: Dict[str, Any]) -> bool:
    if not calendar:
        return True
    holidays = calendar.get("holidays", {})
    if iso_str in holidays:
        return False
    periods = calendar.get("periods", [])
    if periods:
        for p in periods:
            if p.get("type") in ("break", "exam") and p.get("start") <= iso_str <= p.get("end"):
                return False
        teaching_periods = [p for p in periods if p.get("type") == "teaching"]
        if teaching_periods:
            min_teach = min(p["start"] for p in teaching_periods)
            max_teach = max(p["end"] for p in teaching_periods)
            if min_teach <= iso_str <= max_teach:
                return any(p["start"] <= iso_str <= p["end"] for p in teaching_periods)
            return True
    return True


def get_semester_period(
    lesson_start_iso: str,
    calendar: Dict[str, Any],
    semester_num: Optional[int] = None
) -> Optional[Dict[str, Any]]:
    if not calendar or not lesson_start_iso:
        return None
    teaching = [p for p in calendar.get("periods", []) if p.get("type") == "teaching"]
    if not teaching:
        return None

    if isinstance(semester_num, int):
        is_summer = (semester_num % 2 == 0)
        for p in teaching:
            name_lower = p.get("name", "").lower()
            if ("letni" in name_lower) if is_summer else ("zimowy" in name_lower):
                return p
        return None

    for p in teaching:
        if p["start"] <= lesson_start_iso <= p["end"]:
            return p

    if lesson_start_iso <= "2027-02-21":
        for p in teaching:
            if "zimowy" in p.get("name", "").lower():
                return p
        return teaching[0]

    for p in teaching:
        if "letni" in p.get("name", "").lower():
            return p
    return teaching[1] if len(teaching) > 1 else teaching[0]


def expand_occurrences(
    lesson: Dict[str, Any],
    calendar: Dict[str, Any],
    total_meetings: Optional[int] = None
) -> List[Occurrence]:
    """
    Wyznacza jawną listę wystąpień spotkań (occurrences) dla bloku zajęć.
    Dla planów NST: jeśli blok zajęć posiada już predefiniowane daty spotkań,
    zwraca je z nadanymi numerami spotkań.
    Dla planów stacjonarnych: realizuje pętlę tygodniową z uwzględnieniem
    dni wolnych, przerw dydaktycznych, zamian dni (daySwaps) i połówek semestru.
    """
    # 1. Sprawdź, czy blok zajęć ma już bezpośrednio podane daty (np. tryb NST)
    def _get(key, default=None):
        if isinstance(lesson, dict):
            return lesson.get(key, default)
        return getattr(lesson, key, default)

    existing_occurrences = _get("occurrences")
    if existing_occurrences and isinstance(existing_occurrences, list):
        # Sprawdź, czy mają już poprawne pola
        formatted = []
        tot = len(existing_occurrences)
        for idx, occ in enumerate(existing_occurrences):
            if isinstance(occ, dict) and "date" in occ:
                formatted.append({
                    "date": occ["date"],
                    "number": occ.get("number", idx + 1),
                    "of": occ.get("of", tot)
                })
            elif isinstance(occ, str):
                formatted.append({
                    "date": occ,
                    "number": idx + 1,
                    "of": tot
                })
        if formatted:
            return formatted

    start_date_str = _get("start_date")
    if not start_date_str:
        return []

    try:
        start_date = datetime.strptime(start_date_str, "%Y-%m-%d").date()
    except ValueError:
        return []

    dow = _get("day_of_week")
    # Guard: jeśli dow nie jest poprawnym dniem tygodnia ('Inny' itp.) -> unikaj iteracji
    if dow not in DOW_TO_WEEKDAY:
        return []

    target_total = total_meetings or _get("total_meetings") or _get("weeks") or 15
    interval = _get("interval_weeks", 1) or 1
    half_sem = _get("half_semester")
    sem_num = _get("semester") or _get("semestr")

    # Obsługa połówek semestru z kalendarza tenanta
    half_boundaries = calendar.get("half_boundaries", {})
    if half_sem == 2 and half_boundaries.get("half_2_start"):
        h2_start = datetime.strptime(half_boundaries["half_2_start"], "%Y-%m-%d").date()
        if start_date < h2_start:
            start_date = h2_start
            start_date_str = start_date.strftime("%Y-%m-%d")

    day_swaps = calendar.get("daySwaps", {})
    sem_period = get_semester_period(start_date_str, calendar, semester_num=sem_num)

    start_monday = get_monday(start_date)
    current_monday = start_monday
    occurrences: List[Occurrence] = []

    max_iter = 200
    safety_count = 0
    w_iter = 0

    while len(occurrences) < target_total and safety_count < max_iter:
        safety_count += 1
        is_cycle_week = (interval != 2) or (w_iter % 2 == 0)

        if is_cycle_week:
            for day_offset in range(7):
                day_date = current_monday + timedelta(days=day_offset)
                day_iso = day_date.strftime("%Y-%m-%d")

                if day_iso < start_date_str:
                    continue
                if sem_period and (day_iso < sem_period["start"] or day_iso > sem_period["end"]):
                    continue
                if not is_teaching_day(day_iso, calendar):
                    continue

                actual_dow = WEEKDAY_TO_DOW[day_date.weekday()]
                effective_dow = actual_dow

                if day_iso in day_swaps:
                    rep_pl = day_swaps[day_iso].get("replaceWith")
                    rep_dow = PL_CODE_TO_DOW.get(rep_pl, rep_pl)
                    if rep_dow in DOW_TO_WEEKDAY:
                        effective_dow = rep_dow

                if effective_dow == dow:
                    occurrences.append({
                        "date": day_iso,
                        "number": len(occurrences) + 1,
                        "of": target_total
                    })
                    if len(occurrences) >= target_total:
                        break

        current_monday += timedelta(days=7)
        w_iter += 1

    return occurrences
