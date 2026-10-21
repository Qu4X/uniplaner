"""
sources/agh/wtk/adapter.py — Adapter źródła planu zajęć dla AGH WTK (Space Technologies).
Pobiera i przetwarza dane z publicznego eksportu systemu UniTime (plan.agh.edu.pl).
Obsługuje podział na semestry oraz dedykowane ścieżki specjalnościowe:
- Semestr 0 (I rok - wyrównawczy)
- Semestr 2 (Upstream)
- Semestr 2 (Downstream)
- Semestr 2 (Biomedical)
- Semestr 2 (Wszystkie ścieżki)
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
    "Konwersatorium": "exercise",
    "Zajęcia seminaryjne": "seminar",
    "Ćwiczenia projektowe": "project",
    "Lektorat": "elective",
    "Zajęcia terenowe": "other"
}

GROUPS_SEM0 = ["Grupa 1", "Grupa 2"]
GROUPS_SEM2 = ["Grupa 1", "Grupa 2", "Grupa 3", "Grupa 4"]


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
    Usuwa techniczne oznaczenia rocznika i semestru, np. (1rok)[sem0], (2rok)[2sem], (0sem),
    zachowując informację o specjalnościach np. [OB Upstream], [OB Biomedical], [EG].
    """
    cleaned = re.sub(r'\s*\([12]rok\)\[(?:\d*sem|sem\d*|\d+)\]\s*', ' ', raw_name)
    cleaned = re.sub(r'\s*\(\s*0\s*sem\s*\)\s*', ' ', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'\s{2,}', ' ', cleaned).strip()
    return cleaned


def determine_row_semester(title: str, nazwa: str) -> int:
    """
    Identyfikuje semestr zajęć (0 dla I roku - semestr wyrównawczy, 2 dla II roku).
    """
    combined = f"{title} {nazwa}".lower()
    if "[sem0]" in combined or "(0sem)" in combined or "(0 sem)" in combined or "(1rok)" in combined:
        return 0
    return 2


def is_matching_track(raw_subject: str, target_track: Optional[str]) -> bool:
    """
    Sprawdza, czy przedmiot pasuje do wybranej ścieżki specjalnościowej:
    - target_track=None lub 'all': pasuje wszystko
    - target_track='upstream': pasują wspólne, [eg], lektoraty oraz [ob upstream]
    - target_track='downstream': pasują wspólne, [eg], lektoraty oraz [ob downstream]
    - target_track='biomedical': pasują wspólne, [eg], lektoraty oraz [ob biomedical]
    """
    if not target_track or target_track == "all":
        return True

    low = raw_subject.lower()
    if target_track == "upstream":
        if "[ob downstream]" in low or "[ob biomedical]" in low:
            return False
        return True
    elif target_track == "downstream":
        if "[ob upstream]" in low or "[ob biomedical]" in low:
            return False
        return True
    elif target_track == "biomedical":
        if "[ob upstream]" in low or "[ob downstream]" in low:
            return False
        return True

    return True


def is_hideable_lesson(raw_subject: str, typ_str: str, target_track: Optional[str] = None) -> bool:
    """
    Określa, czy zajęcia mogą być ukrywane przez studenta:
    - W widoku konkretnej ścieżki (np. Upstream), przedmioty tej ścieżki są obowiązkowe (nie hideable),
      natomiast fakultety ogólne [EG] oraz lektoraty SJO są hideable.
    - W widoku ogólnym (all) wszystkie przedmioty specjalnościowe są hideable.
    """
    lower_raw = raw_subject.lower()
    lower_typ = typ_str.lower()
    if "lektorat" in lower_typ or "lektorat" in lower_raw or "sjo" in lower_raw:
        return True
    if "[eg]" in lower_raw:
        return True

    if not target_track or target_track == "all":
        if "[ob " in lower_raw:
            return True

    return False


def parse_unitime_csv(
    csv_content: str,
    target_semester: Optional[int] = None,
    target_track: Optional[str] = None
) -> Dict[str, List[RawLesson]]:
    reader = csv.DictReader(io.StringIO(csv_content))
    rows = list(reader)

    student_groups = GROUPS_SEM0 if target_semester == 0 else GROUPS_SEM2

    # 1. Filtruj wiersze bez zaplanowanego terminu, wg semestru i ścieżki
    valid_rows = []
    for r in rows:
        if not (r.get("Pierwszy dzień") and r.get("Ogłoszony początek") and r.get("Ogłoszony koniec")):
            continue
        row_sem = determine_row_semester(r.get("Tytuł", ""), r.get("Nazwa", ""))
        if target_semester is not None and row_sem != target_semester:
            continue
        if not is_matching_track(r.get("Tytuł", ""), target_track):
            continue
        valid_rows.append(r)

    # 2. Sprawdź, które przedmioty mają alternatywne grupy (1..4), a które są jednoobsadowe
    parallel_subjects: Set[str] = set()
    for r in valid_rows:
        subj = r.get("Tytuł", "").strip()
        grp = r.get("Grupa", "").strip()
        if grp and grp[0] in ("2", "3", "4"):
            parallel_subjects.add(subj)

    # 3. Zgrupuj spotkania w unikalne bloki zajęć i zbierz wystąpienia (occurrences)
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
        hideable = is_hideable_lesson(raw_subject, typ_str, target_track=target_track)

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
            raw_subject not in parallel_subjects
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
    schedule_by_group: Dict[str, List[RawLesson]] = {g: [] for g in student_groups}

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

        # Ustal grupy docelowe
        target_groups: List[str] = []

        if form == "lecture":
            target_groups = list(student_groups)
        elif raw_grp.startswith("1"):
            target_groups = ["Grupa 1"] if "Grupa 1" in student_groups else []
        elif raw_grp.startswith("2"):
            target_groups = ["Grupa 2"] if "Grupa 2" in student_groups else []
        elif raw_grp.startswith("3"):
            target_groups = ["Grupa 3"] if "Grupa 3" in student_groups else []
        elif raw_grp.startswith("4"):
            target_groups = ["Grupa 4"] if "Grupa 4" in student_groups else []
        elif is_single_group_subject or raw_grp.startswith("9"):
            target_groups = list(student_groups)
        else:
            target_groups = list(student_groups)

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

    # Sortuj lekcje wewnątrz grup
    for g in student_groups:
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

        plans = [
            PlanMetadata(
                id="agh_wtk_spt_sem0",
                institution="AGH",
                faculty="WTK",
                name="Space Technologies — Semestr 0 (I rok)",
                study_mode="full_time",
                semester_number=0,
                version_token=version_token,
                groups=list(GROUPS_SEM0)
            ),
            PlanMetadata(
                id="agh_wtk_spt_sem2_upstream",
                institution="AGH",
                faculty="WTK",
                name="Space Technologies — Semestr 2 (Upstream)",
                study_mode="full_time",
                semester_number=2,
                version_token=version_token,
                groups=list(GROUPS_SEM2)
            ),
            PlanMetadata(
                id="agh_wtk_spt_sem2_downstream",
                institution="AGH",
                faculty="WTK",
                name="Space Technologies — Semestr 2 (Downstream)",
                study_mode="full_time",
                semester_number=2,
                version_token=version_token,
                groups=list(GROUPS_SEM2)
            ),
            PlanMetadata(
                id="agh_wtk_spt_sem2_biomedical",
                institution="AGH",
                faculty="WTK",
                name="Space Technologies — Semestr 2 (Biomedical)",
                study_mode="full_time",
                semester_number=2,
                version_token=version_token,
                groups=list(GROUPS_SEM2)
            ),
            PlanMetadata(
                id="agh_wtk_spt_sem2_all",
                institution="AGH",
                faculty="WTK",
                name="Space Technologies — Semestr 2 (Wszystkie ścieżki)",
                study_mode="full_time",
                semester_number=2,
                version_token=version_token,
                groups=list(GROUPS_SEM2)
            )
        ]
        return plans

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

        if "sem0" in plan_id:
            return parse_unitime_csv(resp.text, target_semester=0)
        elif "upstream" in plan_id:
            return parse_unitime_csv(resp.text, target_semester=2, target_track="upstream")
        elif "downstream" in plan_id:
            return parse_unitime_csv(resp.text, target_semester=2, target_track="downstream")
        elif "biomedical" in plan_id:
            return parse_unitime_csv(resp.text, target_semester=2, target_track="biomedical")
        else:
            return parse_unitime_csv(resp.text, target_semester=2, target_track="all")
