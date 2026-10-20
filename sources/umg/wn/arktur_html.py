"""
Adapter źródła dla planów stacjonarnych UMG (system Arktur HTML).
Opakowuje arktur_client oraz arktur_parser (strefa chroniona bez zmian strukturalnych).
Mapuje dane na kontrakt RawLesson, w tym wylicza formę i flagę hideable dla symulatora.
"""
import re
import os
import json
import logging
from typing import List, Dict, Optional, Any

from sources.base import ScheduleSource, PlanMetadata, RawLesson
from sources.umg.wn.arktur_client import pobierz_liste_planow, pobierz_surowy_plan
from sources.umg.wn.arktur_parser import przetworz_plan_na_grafike, _wspolny_parser_html, LessonDict

logger = logging.getLogger("umg_arktur_html")

# Mapowanie wewnętrznych polskich nazw form UMG na enum kontraktu v1
FORM_PL_TO_CONTRACT = {
    "wyklad": "lecture",
    "cwiczenia": "exercise",
    "laboratorium": "lab",
    "symulator": "simulator",
    "projekt": "project",
    "seminarium": "seminar",
    "fakultet": "elective",
    "inne": "other"
}

DNI_PL_TO_DOW = {
    "PON": "MON",
    "WT": "TUE",
    "ŚR": "WED",
    "SR": "WED",
    "CZW": "THU",
    "PT": "FRI",
    "SOB": "SAT",
    "ND": "SUN"
}


def normalize_form_key(text: str) -> str:
    if not text:
        return ""
    text = text.strip().lower()
    return re.sub(r'[\s\-_.,/()]+', ' ', text).strip()


def parse_plan_title(raw_name: str) -> dict:
    """
    Ekstraktuje czystą nazwę kierunku/semestru, datę publikacji oraz wersję planu UMG.
    """
    if not raw_name:
        return {"clean_name": "", "published_at": None, "version": None}

    date_match = re.search(r'\[(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2})?)\]', raw_name)
    published_at = date_match.group(1) if date_match else None

    ver_match = re.search(r'\b(?:wer\.?|wersja)\s*(\d+)\b', raw_name, re.IGNORECASE)
    version = f"wer. {ver_match.group(1)}" if ver_match else None

    is_second_degree = bool(re.search(r'drugiego\s+stopnia|II\s+st', raw_name, re.IGNORECASE))

    clean = re.sub(r'^\[[^\]]+\]\s*', '', raw_name)
    clean = re.sub(r'\s*\[modyfikowany\]\s*', ' ', clean, flags=re.IGNORECASE)
    clean = re.sub(r'\s*\[\d{4}-\d{2}-\d{2}[^\]]*\]\s*(?:wer\.?\s*\d+)?', '', clean, flags=re.IGNORECASE)
    clean = re.sub(r'\s*\b(?:wer\.?|wersja)\s*\d+\b', '', clean, flags=re.IGNORECASE)
    clean = re.sub(r'\s*(?:pierwszego|drugiego)\s+stopnia\s*', ' ', clean, flags=re.IGNORECASE)
    clean = re.sub(r'\s*(?:I|II)\s+stopnia\s*', ' ', clean, flags=re.IGNORECASE)
    clean = re.sub(r'\s+', ' ', clean).strip()

    if is_second_degree and "II st" not in clean:
        clean += " (II st.)"

    return {
        "clean_name": clean or raw_name,
        "published_at": published_at,
        "version": version
    }


def get_plan_sort_key(plan_entry: tuple) -> tuple:
    """Klucz naturalnego sortowania planów: kierunek alfabetycznie, stopień, semestr rosnąco."""
    pid, pdata = plan_entry
    name = (pdata.get("clean_name") or pdata.get("name") or "") if isinstance(pdata, dict) else str(pdata)
    m_sem = re.search(r'\bsem\.?\s*(\d+)\b', name, re.IGNORECASE)
    sem_num = int(m_sem.group(1)) if m_sem else 0
    is_second_degree = bool(re.search(r'drugiego\s+stopnia|II\s+st', name, re.IGNORECASE))
    degree_order = 2 if is_second_degree else 1
    clean_major = re.sub(r'\bsem\.?\s*\d+\b', '', name, flags=re.IGNORECASE)
    clean_major = re.sub(r'\(II\s+st\.?\)', '', clean_major, flags=re.IGNORECASE)
    clean_major = re.sub(r'\s+', ' ', clean_major).strip()
    return (clean_major.lower(), degree_order, sem_num, name)


def classify_lesson_form(
    lesson: LessonDict,
    plan_name: str,
    curriculum_catalog: Optional[Dict[str, Any]] = None,
    manual_config: Optional[Dict[str, Any]] = None,
    total_groups: Optional[int] = None
) -> str:
    """Klasyfikuje formę zajęć UMG (wyklad, cwiczenia, laboratorium, symulator)."""
    manual = manual_config or {}
    catalog = curriculum_catalog or {}

    przedmiot = lesson.get("przedmiot", "")
    raw_przedmiot = lesson.get("raw_przedmiot", "")
    sala = (lesson.get("sala") or "").strip()
    colspan = lesson.get("colspan", 1)
    arktur_kolor = lesson.get("arktur_kolor", "default")
    norm_sub = normalize_form_key(przedmiot)
    norm_raw = normalize_form_key(raw_przedmiot)

    # 1. Manualne nadpisania po nazwie przedmiotu
    sub_overrides = manual.get("override_by_subject", {})
    if norm_sub in sub_overrides:
        return sub_overrides[norm_sub]
    if norm_raw in sub_overrides:
        return sub_overrides[norm_raw]

    # 2. Weryfikacja sali
    room_lower = sala.lower()
    room_overrides = manual.get("override_by_room", {})
    if room_lower in room_overrides:
        return room_overrides[room_lower]

    for pattern, form in manual.get("room_regex", []):
        if re.search(pattern, room_lower, re.IGNORECASE):
            return form

    # 3. Aula lub magenta
    if room_lower in ("aula", "audytorium"):
        return "wyklad"
    if arktur_kolor == "magenta":
        return "laboratorium"

    # 4. Sprawdzenie, czy zajęcia łączą cały rocznik
    threshold = 4 if not total_groups else min(4, total_groups)
    is_cohort_wide = colspan >= threshold

    # 5. Sprawdzenie w siatce WN
    m_sem = re.search(r'\bsem\.?\s*(\d+)\b', plan_name, re.IGNORECASE)
    sem_str = m_sem.group(1) if m_sem else None
    norm_plan = normalize_form_key(plan_name)
    matched_major_data = None
    for m_key, m_val in catalog.get("majors", {}).items():
        if m_key in norm_plan:
            matched_major_data = m_val
            break

    curriculum_entry = None
    if matched_major_data and sem_str and sem_str in matched_major_data.get("semesters", {}):
        sem_subs = matched_major_data["semesters"][sem_str]
        curriculum_entry = sem_subs.get(norm_sub) or sem_subs.get(norm_raw)

    if curriculum_entry:
        if curriculum_entry.get("single_form"):
            return curriculum_entry["single_form"]
        if is_cohort_wide and curriculum_entry.get("A", 0) > 0:
            return "wyklad"
        forms = curriculum_entry.get("forms", [])
        if "symulator" in forms and "cwiczenia" not in forms and "laboratorium" not in forms:
            return "symulator"
        if "cwiczenia" in forms and "laboratorium" in forms:
            if any(re.search(p, room_lower) for p in [r'\blab\b', r'\bprac\b', r'\bmw\b', r'h\d+', r'\d+a\b']) or "," in sala:
                return "laboratorium"
            if colspan > 1:
                return "cwiczenia"
            if curriculum_entry.get("C", 0) >= curriculum_entry.get("L", 0):
                return "cwiczenia"
            return "laboratorium"
        if "cwiczenia" in forms:
            return "cwiczenia"
        if "laboratorium" in forms:
            return "laboratorium"
        if "symulator" in forms:
            return "symulator"

    if norm_sub in catalog.get("global_single_forms", {}):
        return catalog["global_single_forms"][norm_sub]
    if norm_raw in catalog.get("global_single_forms", {}):
        return catalog["global_single_forms"][norm_raw]

    if is_cohort_wide:
        return "wyklad"

    return "cwiczenia"


def is_hideable_simulator_lesson(lesson: LessonDict) -> bool:
    """Określa, czy dane zajęcia na UMG to podgrupa symulatora manewrowego."""
    p = (lesson.get("przedmiot") or "").lower()
    raw_p = (lesson.get("raw_przedmiot") or "").lower()
    room = (lesson.get("sala") or "").lower()

    is_maneuvering = (
        "manewrowani" in p
        or "manewrowani" in raw_p
        or raw_p == "ms"
        or "sym-man" in p
        or "sym-man" in raw_p
    )
    if not is_maneuvering:
        return False
    if "aula" in room or "audytorium" in room:
        return False
    return True


_SOURCE_DIR = os.path.dirname(os.path.abspath(__file__))
_FORMS_DIR = os.path.join(_SOURCE_DIR, "forms")
_SUBJECTS_DIR = os.path.join(_SOURCE_DIR, "subjects")
CURRICULUM_FORMS_PATH = os.path.join(_FORMS_DIR, "wn_curriculum_forms.json")
FORMS_MANUAL_PATH = os.path.join(_FORMS_DIR, "forms_manual.json")
SUBJECTS_CATALOG_PATH = os.path.join(_SUBJECTS_DIR, "wn_subjects_catalog.json")


def load_curriculum_forms(path: Optional[str] = None) -> Dict[str, Any]:
    """Wczytuje oficjalny katalog siatek godzinowych WN z wn_curriculum_forms.json"""
    target_path = path or (CURRICULUM_FORMS_PATH if os.path.exists(CURRICULUM_FORMS_PATH) else os.path.join(_SOURCE_DIR, "wn_curriculum_forms.json"))
    if os.path.exists(target_path):
        try:
            with open(target_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Nie udało się wczytać curriculum forms ({target_path}): {e}")
    return {}


def load_forms_manual(path: Optional[str] = None) -> Dict[str, Any]:
    """Wczytuje manualne nadpisania form zajęć z forms_manual.json"""
    target_path = path or (FORMS_MANUAL_PATH if os.path.exists(FORMS_MANUAL_PATH) else os.path.join(_SOURCE_DIR, "forms_manual.json"))
    if os.path.exists(target_path):
        try:
            with open(target_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Nie udało się wczytać forms_manual.json ({target_path}): {e}")
    return {}


class UmgArkturHtmlSource:
    source_id = "umg_arktur_html"

    def __init__(self, data_dir: Optional[str] = None):
        self.source_dir = _SOURCE_DIR
        self.data_dir = data_dir or _FORMS_DIR
        self.curriculum_catalog = self._load_json("wn_curriculum_forms.json")
        self.manual_config = self._load_json("forms_manual.json")

    def _load_json(self, filename: str) -> Dict[str, Any]:
        for directory in (_FORMS_DIR, _SUBJECTS_DIR, self.source_dir, self.data_dir):
            if not directory:
                continue
            p = os.path.join(directory, filename)
            if os.path.exists(p):
                try:
                    with open(p, "r", encoding="utf-8") as f:
                        return json.load(f)
                except Exception:
                    pass
        return {}

    def discover(self, raw_plans: Optional[Any] = None) -> List[PlanMetadata]:
        plans_raw = raw_plans if raw_plans is not None else pobierz_liste_planow()
        discovered: List[PlanMetadata] = []

        if isinstance(plans_raw, dict):
            iterable = [{"id": pid, "nazwa": name, "grupy": []} for name, pid in plans_raw.items()]
        else:
            iterable = list(plans_raw or [])

        for p in iterable:
            pid = str(p.get("id"))
            name = p.get("nazwa", "")

            # Pomiń niestacjonarne w adapterze źródła HTML
            if "niestacjonarne" in name.lower():
                continue

            # Parsowanie metadanych wersji i semestru
            date_match = re.search(r'\[(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2})?)\]', name)
            published_at = date_match.group(1) if date_match else None
            ver_match = re.search(r'\b(?:wer\.?|wersja)\s*(\d+)\b', name, re.IGNORECASE)
            version = f"wer. {ver_match.group(1)}" if ver_match else "wer. 1"
            version_token = f"{version} [{published_at}]" if published_at else version

            m_sem = re.search(r'\bsem\.?\s*(\d+)\b', name, re.IGNORECASE)
            sem_num = int(m_sem.group(1)) if m_sem else None

            # Czysta nazwa
            clean = re.sub(r'^\[[^\]]+\]\s*', '', name)
            clean = re.sub(r'\s*\[modyfikowany\]\s*', ' ', clean, flags=re.IGNORECASE)
            clean = re.sub(r'\s*\[\d{4}-\d{2}-\d{2}[^\]]*\]\s*(?:wer\.?\s*\d+)?', '', clean, flags=re.IGNORECASE)
            clean = re.sub(r'\s*\b(?:wer\.?|wersja)\s*\d+\b', '', clean, flags=re.IGNORECASE)
            clean = re.sub(r'\s*(?:pierwszego|drugiego)\s+stopnia\s*', ' ', clean, flags=re.IGNORECASE)
            clean = re.sub(r'\s*(?:I|II)\s+stopnia\s*', ' ', clean, flags=re.IGNORECASE)
            clean = re.sub(r'\s+', ' ', clean).strip()
            if "drugiego stopnia" in name.lower() or "ii st" in name.lower():
                if "II st" not in clean:
                    clean += " (II st.)"

            groups = p.get("grupy", [])
            discovered.append(PlanMetadata(
                id=pid,
                institution="umg",
                faculty="wn",
                name=clean or name,
                study_mode="full_time",
                semester_number=sem_num,
                version_token=version_token,
                published_at=published_at,
                version=version,
                groups=groups
            ))

        return discovered

    def fetch_schedule(self, plan_id: str, html_content: Optional[str] = None, groups_list: Optional[List[str]] = None) -> Dict[str, List[RawLesson]]:
        if html_content is not None:
            html_text = html_content
            grupy = groups_list or []
        else:
            html_text, grupy = pobierz_surowy_plan(plan_id)

        if not html_text:
            return {}

        parsed_schedule = _wspolny_parser_html(html_text)
        schedule_by_group: Dict[str, List[RawLesson]] = {}

        # Jeśli grupy nie były podane z zewnątrz, odczytaj je z nagłówków komórek
        if not grupy:
            grupy = [f"GR_{i+1}" for i in range(12)]  # fallback

        for grupa in grupy:
            dane_plaskie, _, _ = przetworz_plan_na_grafike(
                html_text, grupa, grupy, _parsed_schedule=parsed_schedule
            )

            group_lessons: List[RawLesson] = []
            for day_pl, slots in dane_plaskie.items():
                dow = DNI_PL_TO_DOW.get(day_pl, day_pl)
                for slot_key, l in slots.items():
                    hours = l.get("godziny", "")
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

                    form_pl = classify_lesson_form(
                        l,
                        plan_name="",
                        curriculum_catalog=self.curriculum_catalog,
                        manual_config=self.manual_config,
                        total_groups=len(grupy)
                    )
                    form_contract = FORM_PL_TO_CONTRACT.get(form_pl, "other")

                    room = l.get("sala")
                    is_remote = False
                    if room:
                        room_str = str(room).strip()
                        if room_str.upper() == "OL":
                            is_remote = True
                            room = None
                        else:
                            room = room_str

                    raw_item = RawLesson(
                        subject=l.get("przedmiot", ""),
                        raw_subject=l.get("raw_przedmiot"),
                        start_time=sh,
                        end_time=eh,
                        duration_minutes=duration,
                        form=form_contract,
                        teacher=l.get("prowadzacy"),
                        room=room,
                        remote=is_remote,
                        hideable=is_hideable_simulator_lesson(l),
                        day_of_week=dow,
                        start_date=l.get("data_start"),
                        interval_weeks=l.get("co_ile", 1) or 1,
                        half_semester=l.get("polowa_sem"),
                        weeks=l.get("tygodnie", 15) or 15,
                        groups=[grupa]
                    )
                    group_lessons.append(raw_item)

            schedule_by_group[grupa] = group_lessons

        return schedule_by_group
