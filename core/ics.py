"""
Generator plików kalendarza iCalendar (.ics) RFC 5545 zgodny z Kontraktem v1.
Konsumuje wyliczone wcześniej occurrences, a dla wstecznej kompatybilności udostępnia też generuj_ics / generate_nst_ics.
"""
import os
import json
import re
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional
from icalendar import Calendar, Event

logger = logging.getLogger(__name__)

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_TENANT_CAL_PATH = os.path.join(_REPO_ROOT, "tenants", "umg_wn", "academic_calendar.json")
ACADEMIC_CALENDAR_PATH = _TENANT_CAL_PATH

WEEKDAY_TO_CODE = {0: "PON", 1: "WT", 2: "ŚR", 3: "CZW", 4: "PT", 5: "SOB", 6: "ND"}


def load_academic_calendar(path: Optional[str] = None) -> Dict[str, Any]:
    """Wczytuje konfigurację kalendarza akademickiego z academic_calendar.json"""
    target_path = path or ACADEMIC_CALENDAR_PATH
    if os.path.exists(target_path):
        try:
            with open(target_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Nie udało się wczytać kalendarza akademickiego ({target_path}): {e}")
    return {}


def format_location(room: Optional[str], remote: bool = False) -> str:
    if remote:
        return "Zdalnie / Online"
    if not room:
        return ""
    r = str(room).strip()
    if r.upper() == "OL":
        return "Zdalnie / Online"
    if r.lower().startswith(("sala", "aula", "basen")):
        return r
    return f"Sala {r}"


def generate_group_ics(
    schedule: Dict[str, Any],
    plan_name: str = "",
    institution_domain: str = "umg.edu.pl"
) -> str:
    """
    Tworzy ciąg znaków .ics na podstawie zwalidowanego słownika GroupSchedule (kontrakt v1).
    Każde wystąpienie z occurrences[] staje się komponentem VEVENT.
    """
    group_name = schedule.get("group", "")
    plan_id = schedule.get("plan_id", "")
    lessons = schedule.get("lessons", [])

    cal = Calendar()
    cal.add("prodid", f"-//Plan Zajec//{group_name}//{institution_domain}//")
    cal.add("version", "2.0")
    cal.add("x-wr-calname", f"Plan {group_name}")
    cal.add("x-wr-timezone", "Europe/Warsaw")

    for lesson in lessons:
        subject = lesson.get("subject", "Zajęcia")
        form = lesson.get("form", "")
        start_time_str = lesson.get("start_time", "")
        end_time_str = lesson.get("end_time", "")
        room = lesson.get("room")
        remote = lesson.get("remote", False)
        teacher = lesson.get("teacher")
        occurrences = lesson.get("occurrences", [])

        if not start_time_str or not end_time_str or not occurrences:
            continue

        try:
            sh, sm = map(int, start_time_str.split(":"))
            eh, em = map(int, end_time_str.split(":"))
        except ValueError:
            continue

        loc = format_location(room, remote)
        desc_lines = []
        if teacher:
            desc_lines.append(f"Prowadzący: {teacher}")
        else:
            desc_lines.append("Brak danych prowadzącego")
        if form:
            desc_lines.append(f"Forma: {form}")
        if group_name:
            desc_lines.append(f"Grupa: {group_name}")

        clean_subj = re.sub(r"[^\w-]", "", subject)[:20]

        for occ in occurrences:
            date_iso = occ.get("date")
            if not date_iso:
                continue

            try:
                y, m, d = map(int, date_iso.split("-"))
                dt_start = datetime(y, m, d, sh, sm)
                dt_end = datetime(y, m, d, eh, em)

                event = Event()
                summary_prefix = f"[{form.upper()}] " if form and form != "other" else ""
                event.add("summary", f"{summary_prefix}{subject}")
                event.add("dtstart", dt_start)
                event.add("dtend", dt_end)

                uid = f"{plan_id}_{group_name}_{date_iso}_{sh:02d}{sm:02d}_{clean_subj}@{institution_domain}"
                event.add("uid", uid)
                event.add("dtstamp", datetime.now(timezone.utc))

                if loc:
                    event.add("location", loc)

                occ_desc = list(desc_lines)
                m_num = occ.get("number")
                m_of = occ.get("of")
                if m_num and m_of:
                    occ_desc.append(f"Spotkanie: {m_num} z {m_of}")

                event.add("description", "\n".join(occ_desc))
                cal.add_component(event)
            except Exception:
                continue

    output = cal.to_ical()
    if isinstance(output, bytes):
        return output.decode("utf-8")
    return output


def _is_teaching_day(iso_str: str, cal_config: Optional[Dict[str, Any]]) -> bool:
    if not cal_config:
        return True
    holidays = cal_config.get("holidays", {})
    if iso_str in holidays:
        return False
    periods = cal_config.get("periods", [])
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


def _get_semester_period(lesson_start_iso: str, cal_config: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not cal_config or not lesson_start_iso:
        return None
    teaching = [p for p in cal_config.get("periods", []) if p.get("type") == "teaching"]
    for p in teaching:
        if p["start"] <= lesson_start_iso <= p["end"]:
            return p
    return None


def generuj_ics(dane_planu: Dict[str, Any], nazwa_grupy: str, academic_calendar: Optional[Dict[str, Any]] = None) -> str:
    """
    Generuje ciąg tekstowy iCalendar (.ics) zgodny z RFC 5545 na podstawie spłaszczonej siatki planu
    lub słownika GroupSchedule (Kontrakt v1).
    """
    if isinstance(dane_planu, dict) and "lessons" in dane_planu and isinstance(dane_planu.get("lessons"), list):
        return generate_group_ics(dane_planu, plan_name=nazwa_grupy)

    if academic_calendar is None:
        academic_calendar = load_academic_calendar()

    day_swaps = academic_calendar.get("daySwaps", {}) if academic_calendar else {}

    cal = Calendar()
    cal.add('prodid', f'-//UMG Navigator//{nazwa_grupy}//')
    cal.add('version', '2.0')
    cal.add('x-wr-calname', f'Plan {nazwa_grupy}')
    cal.add('x-wr-timezone', 'Europe/Warsaw')

    def _dodaj_event(info: Dict[str, Any], base_day: str) -> None:
        if not info.get("data_start"):
            return
        try:
            g_start, g_koniec = info['godziny'].split(' - ')
            start_date = datetime.strptime(info['data_start'], "%Y-%m-%d").date()
            start_t = datetime.strptime(g_start, "%H:%M").time()
            end_t = datetime.strptime(g_koniec, "%H:%M").time()

            sala = str(info.get('sala', '')).strip()
            loc = format_location(sala)

            prow = str(info.get('prowadzacy', '')).strip()
            desc_lines = []
            if prow:
                desc_lines.append(f"Prowadzący: {prow}")
            else:
                desc_lines.append("Brak danych prowadzącego")
            if nazwa_grupy:
                desc_lines.append(f"Grupa: {nazwa_grupy}")

            total_meetings = int(info.get("tygodnie", 1) or 1)
            step = int(info.get("co_ile", 1) or 1)

            sem_period = _get_semester_period(info['data_start'], academic_calendar)

            start_mon = start_date - timedelta(days=start_date.weekday())
            cur_mon = start_mon
            meeting_count = 0
            max_iter_weeks = 50
            w_iter = 0

            while meeting_count < total_meetings and w_iter < max_iter_weeks:
                is_cycle_week = (step != 2) or (w_iter % 2 == 0)
                if is_cycle_week:
                    for d_off in range(7):
                        day_date = cur_mon + timedelta(days=d_off)
                        day_iso = day_date.isoformat()

                        if day_iso < info['data_start']:
                            continue
                        if sem_period and (day_iso < sem_period['start'] or day_iso > sem_period['end']):
                            continue
                        if not _is_teaching_day(day_iso, academic_calendar):
                            continue

                        weekday_code = WEEKDAY_TO_CODE.get(day_date.weekday())
                        if day_iso in day_swaps:
                            effective_day = day_swaps[day_iso].get("replaceWith", weekday_code)
                            swap_note = day_swaps[day_iso].get("note")
                        else:
                            effective_day = weekday_code
                            swap_note = None

                        if effective_day == base_day:
                            meeting_count += 1
                            event_start = datetime.combine(day_date, start_t)
                            event_end = datetime.combine(day_date, end_t)

                            event = Event()
                            event.add('summary', info['przedmiot'])
                            event.add('dtstart', event_start)
                            event.add('dtend', event_end)

                            clean_subj = re.sub(r'[^a-zA-Z0-9_-]', '_', info.get('raw_przedmiot') or info['przedmiot'])
                            uid = (f"{nazwa_grupy}_{event_start.strftime('%Y%m%dT%H%M%S')}"
                                   f"_{clean_subj}@umg.edu.pl")
                            event.add('uid', uid)
                            event.add('dtstamp', datetime.now(timezone.utc))

                            if loc:
                                event.add('location', loc)

                            event_desc = list(desc_lines)
                            event_desc.append(f"Spotkanie: {meeting_count} z {total_meetings}")
                            if swap_note:
                                event_desc.append(f"ℹ️ {swap_note}")
                            event.add('description', "\n".join(event_desc))

                            cal.add_component(event)

                            if meeting_count >= total_meetings:
                                break

                cur_mon += timedelta(days=7)
                w_iter += 1

        except (ValueError, KeyError) as e:
            logger.warning(f"ICS - pominięto ({e}): {info.get('przedmiot', '?')} @ {info.get('data_start', '?')}")

    for dzien_nazwa, sloty in dane_planu.items():
        if not isinstance(sloty, dict):
            continue
        for slot, slot_data in sloty.items():
            if isinstance(slot_data, dict) and "przedmiot" in slot_data:
                _dodaj_event(slot_data, dzien_nazwa)
            elif isinstance(slot_data, dict):
                for col_idx, info in slot_data.items():
                    if isinstance(info, dict) and "przedmiot" in info:
                        _dodaj_event(info, dzien_nazwa)

    output = cal.to_ical()
    if isinstance(output, bytes):
        return output.decode("utf-8")
    return output


def generate_nst_ics(nst_group_schedule: Dict[str, List[Dict[str, Any]]], group_name: str) -> str:
    """
    Generates an iCal (.ics) calendar for part-time (NST) studies group
    based on explicit session calendar dates.
    """
    cal = Calendar()
    cal.add('prodid', '-//Plan Zajec WN UMG (Niestacjonarne)//umg.edu.pl//')
    cal.add('version', '2.0')
    cal.add('x-wr-calname', f"Plan WN (NST) - {group_name}")
    cal.add('x-wr-timezone', 'Europe/Warsaw')

    for date_iso, lessons in nst_group_schedule.items():
        for lesson in lessons:
            try:
                hours_str = lesson.get("godziny", "")
                if not hours_str or "-" not in hours_str:
                    continue
                parts = hours_str.split("-")
                if len(parts) != 2:
                    continue
                start_h, end_h = parts[0].strip(), parts[1].strip()
                if not (re.match(r"^\d{1,2}:\d{2}$", start_h) and re.match(r"^\d{1,2}:\d{2}$", end_h)):
                    continue
                sh, sm = map(int, start_h.split(":"))
                eh, em = map(int, end_h.split(":"))

                y, m, d = map(int, date_iso.split("-"))
                dt_start = datetime(y, m, d, sh, sm)
                dt_end = datetime(y, m, d, eh, em)

                event = Event()
                subj = lesson.get("przedmiot", "Zajęcia")
                forma = lesson.get("forma", "")
                summary = f"[{forma.upper()}] {subj}" if forma else subj
                event.add('summary', summary)
                event.add('dtstart', dt_start)
                event.add('dtend', dt_end)

                clean_subj = re.sub(r'[^\w]', '', subj)[:20]
                uid = f"nst_{group_name}_{date_iso}_{sh:02d}{sm:02d}_{clean_subj}@umg.edu.pl"
                event.add('uid', uid)
                event.add('dtstamp', datetime.now(timezone.utc))

                sala = lesson.get("sala", "")
                if sala and sala != "brak sali":
                    event.add('location', sala)

                desc_lines = []
                if lesson.get("prowadzacy"):
                    desc_lines.append(f"Prowadzący: {lesson['prowadzacy']}")
                if lesson.get("forma"):
                    desc_lines.append(f"Forma: {lesson['forma']}")
                desc_lines.append(f"Grupa: {group_name}")
                event.add('description', "\n".join(desc_lines))

                cal.add_component(event)
            except Exception as e:
                logger.warning(f"ICS NST pominięto lekcję: {e}")

    output = cal.to_ical()
    if isinstance(output, bytes):
        return output.decode("utf-8")
    return output


generuj_ics_nst = generate_nst_ics
generate_ics = generuj_ics

