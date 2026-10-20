"""
sources/agh/wtk/adapter.py — Adapter źródła planu zajęć dla AGH WTK (Space Technologies).
Pobiera i przetwarza dane z publicznego eksportu systemu UniTime (plan.agh.edu.pl).
"""
import io
import csv
import re
import hashlib
import requests
from typing import List, Dict, Optional, Tuple, Set
from datetime import datetime, timedelta
from collections import defaultdict

from sources.base import ScheduleSource, PlanMetadata, RawLesson


UNITIME_EXPORT_URL = "https://plan.agh.edu.pl/UniTime/export"
DEFAULT_CURRICULUM = "TK-SPT-2"
DEFAULT_TERM = "Semestr zimowy2026AGH"

DAY_MAP = {
    "Pn": "MON",
    "Wt": "TUE",
    "Śr": "WED",
    "Cz": "THU",
    "Pt": "FRI",
    "So": "SAT",
    "Sob": "SAT",
    "Nd": "SUN"
}

FORM_MAP = {
    "Wykład": "lecture",
    "CWL": "lab",
    "CWA": "exercise",
    "Konwersatorium": "seminar",
    "Zajęcia seminaryjne": "seminar",
    "Ćwiczenia projektowe": "project",
    "Lektorat": "exercise",
    "Zajęcia terenowe": "other"
}

STUDENT_GROUPS = ["Grupa 1", "Grupa 2", "Grupa 3", "Grupa 4"]


def clean_time_str(t: str) -> str:
    parts = t.strip().split(":")
    if len(parts) == 2:
        return f"{int(parts[0]):02d}:{int(parts[1]):02d}"
    return t.strip()


def calculate_duration_minutes(start_time: str, end_time: str) -> int:
    sh, sm = map(int, start_time.split(":"))
    eh, em = map(int, end_time.split(":"))
    return (eh * 60 + em) - (sh * 60 + sm)


def clean_subject_name(raw_name: str) -> str:
    """
    Usuwa techniczne oznaczenia rocznika i semestru, np. (2rok)[2sem], (2rok)[sem2],
    zachowując informację o specjalnościach np. [OB Upstream], [OB Biomedical].
    """
    cleaned = re.sub(r'\s*\([12]rok\)\[(?:\d*sem|sem\d*|\d+)\]\s*', ' ', raw_name)
    cleaned = re.sub(r'\s{2,}', ' ', cleaned).strip()
    return cleaned


def is_hideable_lesson(raw_subject: str, typ_str: str) -> bool:
    """
    Określa, czy zajęcia mogą być ukrywane przez studenta (np. specjalności, lektoraty).
    """
    lower_raw = raw_subject.lower()
    lower_typ = typ_str.lower()
    if "lektorat" in lower_typ or "lektorat" in lower_raw or "sjo" in lower_raw:
        return True
    if "[ob " in lower_raw or "[eg]" in lower_raw:
        return True
    return False


def parse_unitime_csv(csv_content: str) -> Dict[str, List[RawLesson]]:
    reader = csv.DictReader(io.StringIO(csv_content))
    rows = list(reader)

    # 1. Filtruj wiersze bez zaplanowanego terminu
    valid_rows = [
        r for r in rows
        if r.get("Pierwszy dzień") and r.get("Ogłoszony początek") and r.get("Ogłoszony koniec")
    ]

    # 2. Sprawdź, które przedmioty mają alternatywne grupy (1..4), a które są jednoobsadowe
    parallel_subjects: Set[str] = set()
    for r in valid_rows:
        subj = r.get("Tytuł", "").strip()
        grp = r.get("Grupa", "").strip()
        if grp and grp[0] in ("2", "3", "4"):
            parallel_subjects.add(subj)

    # 3. Zgrupuj spotkania w unikalne bloki zajęć i zbierz wystąpienia (occurrences)
    # Klucz: (raw_subject, clean_subject, form, start, end, room, teacher, day_code, raw_grp, is_hideable)
    block_dates = defaultdict(set)

    for r in valid_rows:
        raw_subject = r.get("Tytuł", "").strip()
        clean_subject = clean_subject_name(raw_subject)
        typ_str = r.get("Typ", "").strip()
        form = FORM_MAP.get(typ_str, "other")
        start_time = clean_time_str(r.get("Ogłoszony początek", ""))
        end_time = clean_time_str(r.get("Ogłoszony koniec", ""))
        room = r.get("Miejsce", "").strip() or None
        teacher = r.get("Prowadzący / Odpowiedzialny", "").strip() or None
        day_str = r.get("Dzień tygodnia", "").strip()
        day_code = DAY_MAP.get(day_str, "MON")
        raw_grp = r.get("Grupa", "").strip()
        hideable = is_hideable_lesson(raw_subject, typ_str)

        key = (
            raw_subject,
            clean_subject,
            form,
            start_time,
            end_time,
            room,
            teacher,
            day_code,
            raw_grp,
            hideable,
            raw_subject not in parallel_subjects  # is_single_group_subject
        )

        first_d_str = r.get("Pierwszy dzień", "").strip()
        last_d_str = r.get("Ostatni dzień", "").strip()

        try:
            d1 = datetime.strptime(first_d_str, "%d.%m.%Y")
            if last_d_str:
                d2 = datetime.strptime(last_d_str, "%d.%m.%Y")
                curr = d1
                while curr <= d2:
                    block_dates[key].add(curr.strftime("%Y-%m-%d"))
                    curr += timedelta(days=7)
            else:
                block_dates[key].add(d1.strftime("%Y-%m-%d"))
        except ValueError:
            continue

    # 4. Utwórz instancje RawLesson i przypisz do właściwych grup studenckich
    schedule_by_group: Dict[str, List[RawLesson]] = {g: [] for g in STUDENT_GROUPS}

    for key, dates in block_dates.items():
        (
            raw_subject,
            clean_subject,
            form,
            start_time,
            end_time,
            room,
            teacher,
            day_code,
            raw_grp,
            hideable,
            is_single_group_subject
        ) = key

        sorted_dates = sorted(list(dates))
        total_of = len(sorted_dates)
        occurrences = [
            {"date": dt, "number": idx, "of": total_of}
            for idx, dt in enumerate(sorted_dates, start=1)
        ]
        start_date = sorted_dates[0] if sorted_dates else None
        duration = calculate_duration_minutes(start_time, end_time)

        # Ustal, które grupy powinny otrzymać tę lekcję
        target_groups: List[str] = []

        if form == "lecture":
            # Wykłady wspólne dla wszystkich grup
            target_groups = list(STUDENT_GROUPS)
        elif raw_grp.startswith("1"):
            target_groups = ["Grupa 1"]
        elif raw_grp.startswith("2"):
            target_groups = ["Grupa 2"]
        elif raw_grp.startswith("3"):
            target_groups = ["Grupa 3"]
        elif raw_grp.startswith("4"):
            target_groups = ["Grupa 4"]
        elif is_single_group_subject or raw_grp.startswith("9"):
            # Przedmioty jednoobsadowe lub lektoraty SJO
            target_groups = list(STUDENT_GROUPS)
        else:
            target_groups = list(STUDENT_GROUPS)

        lesson = RawLesson(
            subject=clean_subject,
            start_time=start_time,
            end_time=end_time,
            duration_minutes=duration,
            form=form,
            teacher=teacher,
            room=room,
            remote=False,
            hideable=hideable,
            raw_subject=raw_subject,
            day_of_week=day_code,
            start_date=start_date,
            interval_weeks=1,
            start_week=1,
            weeks=15,
            groups=target_groups,
            occurrences=occurrences
        )

        for tg in target_groups:
            if tg in schedule_by_group:
                schedule_by_group[tg].append(lesson)

    # Sortuj lekcje wewnątrz grup wg start_date, start_time
    for g in STUDENT_GROUPS:
        schedule_by_group[g].sort(
            key=lambda l: (
                l.start_date or "",
                l.start_time,
                l.subject
            )
        )

    return schedule_by_group


class AghWtkSource:
    source_id: str = "agh_wtk_source"

    def __init__(
        self,
        curriculum: str = DEFAULT_CURRICULUM,
        term: str = DEFAULT_TERM,
        base_url: str = UNITIME_EXPORT_URL
    ):
        self.curriculum = curriculum
        self.term = term
        self.base_url = base_url

    def discover(self) -> List[PlanMetadata]:
        version_token = "v1"
        try:
            params = {
                "output": "events.csv",
                "type": "curriculum",
                "name": self.curriculum,
                "term": self.term
            }
            # Szybki HEAD lub lekki GET z limitem do wyliczenia tokenu wersji
            resp = requests.head(self.base_url, params=params, timeout=10)
            if resp.status_code == 200:
                last_mod = resp.headers.get("Last-Modified") or resp.headers.get("ETag")
                if last_mod:
                    version_token = hashlib.md5(last_mod.encode("utf-8")).hexdigest()[:12]
                else:
                    version_token = datetime.now().strftime("%Y%m%d")
            else:
                version_token = datetime.now().strftime("%Y%m%d")
        except Exception:
            version_token = datetime.now().strftime("%Y%m%d")

        plan = PlanMetadata(
            id="agh_wtk_spt_2",
            institution="AGH",
            faculty="WTK",
            name="Space Technologies — II stopień",
            study_mode="full_time",
            semester_number=2,
            version_token=version_token,
            groups=list(STUDENT_GROUPS)
        )
        return [plan]

    def fetch_schedule(self, plan_id: str) -> Dict[str, List[RawLesson]]:
        params = {
            "output": "events.csv",
            "type": "curriculum",
            "name": self.curriculum,
            "term": self.term
        }
        resp = requests.get(self.base_url, params=params, timeout=30)
        resp.raise_for_status()
        resp.encoding = "utf-8"
        return parse_unitime_csv(resp.text)
