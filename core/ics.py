"""
Generator plików kalendarza iCalendar (.ics) RFC 5545 zgodny z Kontraktem v1.
Konsumuje wyliczone wcześniej occurrences, nie duplikuje logiki kalendarza akademickiego.
"""
import re
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from icalendar import Calendar, Event


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


generate_calendar_ics = generate_group_ics

