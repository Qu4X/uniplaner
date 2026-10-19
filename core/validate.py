"""
Walidacja struktur danych zgodnych z Kontraktem v1.
"""
import re
from typing import Dict, Any, List, Tuple

VALID_FORMS = {
    "lecture",
    "exercise",
    "lab",
    "simulator",
    "project",
    "seminar",
    "elective",
    "other"
}

VALID_DAYS = {"MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN", None}
TIME_REGEX = re.compile(r"^\d{2}:\d{2}$")
DATE_REGEX = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class ValidationError(Exception):
    pass


def validate_occurrence(occ: Dict[str, Any], path: str = "occurrence") -> None:
    if not isinstance(occ, dict):
        raise ValidationError(f"{path} musi być słownikiem")
    if "date" not in occ or not DATE_REGEX.match(str(occ["date"])):
        raise ValidationError(f"{path}.date musi być w formacie YYYY-MM-DD: {occ.get('date')}")
    if "number" not in occ or not isinstance(occ["number"], int) or occ["number"] < 1:
        raise ValidationError(f"{path}.number musi być dodatnią liczbą całkowitą: {occ.get('number')}")
    if "of" not in occ or not isinstance(occ["of"], int) or occ["of"] < occ["number"]:
        raise ValidationError(f"{path}.of musi być liczbą całkowitą >= number: {occ.get('of')}")


def validate_lesson(lesson: Dict[str, Any], path: str = "lesson") -> Dict[str, Any]:
    """Waliduje lekcję i uzupełnia bezpieczne wartości domyślne."""
    if not isinstance(lesson, dict):
        raise ValidationError(f"{path} musi być słownikiem")

    required_fields = ["id", "subject", "start_time", "end_time", "duration_minutes", "form", "occurrences"]
    for rf in required_fields:
        if rf not in lesson:
            raise ValidationError(f"{path} brakuje wymaganego pola '{rf}'")

    if not isinstance(lesson["id"], str) or not lesson["id"].strip():
        raise ValidationError(f"{path}.id nie może być puste")

    if not isinstance(lesson["subject"], str) or not lesson["subject"].strip():
        raise ValidationError(f"{path}.subject nie może być puste")

    if not TIME_REGEX.match(lesson["start_time"]):
        raise ValidationError(f"{path}.start_time musi być w formacie HH:MM: {lesson['start_time']}")

    if not TIME_REGEX.match(lesson["end_time"]):
        raise ValidationError(f"{path}.end_time musi być w formacie HH:MM: {lesson['end_time']}")

    if not isinstance(lesson["duration_minutes"], int) or lesson["duration_minutes"] <= 0:
        raise ValidationError(f"{path}.duration_minutes musi być liczbą dodatnią: {lesson['duration_minutes']}")

    if lesson["form"] not in VALID_FORMS:
        raise ValidationError(f"{path}.form musi należeć do {sorted(list(VALID_FORMS))}: {lesson['form']}")

    dow = lesson.get("day_of_week")
    if dow not in VALID_DAYS:
        raise ValidationError(f"{path}.day_of_week musi należeć do {sorted([d for d in VALID_DAYS if d])}: {dow}")

    if not isinstance(lesson["occurrences"], list):
        raise ValidationError(f"{path}.occurrences musi być listą")

    for idx, occ in enumerate(lesson["occurrences"]):
        validate_occurrence(occ, f"{path}.occurrences[{idx}]")

    # Bezpieczne wartości domyślne
    validated = dict(lesson)
    validated.setdefault("raw_subject", None)
    validated.setdefault("teacher", None)
    validated.setdefault("room", None)
    validated.setdefault("remote", False)
    validated.setdefault("hideable", False)
    validated.setdefault("start_date", None)
    validated.setdefault("interval_weeks", 1)
    validated.setdefault("half_semester", None)
    validated.setdefault("groups", [])

    return validated


def validate_group_schedule(schedule: Dict[str, Any]) -> Tuple[bool, List[str]]:
    """Waliduje cały plik schedules/{plan_id}_{group}.json."""
    errors = []
    if not isinstance(schedule, dict):
        return False, ["Harmonogram musi być słownikiem JSON"]

    if schedule.get("schema_version") != 1:
        errors.append("schema_version musi wynosić 1")
    if not schedule.get("plan_id"):
        errors.append("Brak plan_id")
    if not schedule.get("group"):
        errors.append("Brak group")
    if not isinstance(schedule.get("lessons"), list):
        errors.append("Pole 'lessons' musi być listą")
    else:
        for idx, l in enumerate(schedule["lessons"]):
            try:
                validate_lesson(l, f"lessons[{idx}]")
            except ValidationError as ve:
                errors.append(str(ve))

    return len(errors) == 0, errors


def validate_plans_index(index_data: Dict[str, Any]) -> Tuple[bool, List[str]]:
    """Waliduje plik plans.json."""
    errors = []
    if not isinstance(index_data, dict):
        return False, ["Indeks planów musi być słownikiem JSON"]

    if index_data.get("schema_version") != 1:
        errors.append("schema_version musi wynosić 1")
    if not index_data.get("tenant"):
        errors.append("Brak tenant")
    if not isinstance(index_data.get("plans"), list):
        errors.append("Pole 'plans' musi być listą")
    else:
        req_p = ["id", "institution", "faculty", "name", "study_mode", "version_token", "groups"]
        for idx, p in enumerate(index_data["plans"]):
            if not isinstance(p, dict):
                errors.append(f"plans[{idx}] musi być słownikiem")
                continue
            for rf in req_p:
                if rf not in p:
                    errors.append(f"plans[{idx}] brakuje pola '{rf}'")
            if p.get("study_mode") not in ("full_time", "part_time"):
                errors.append(f"plans[{idx}].study_mode musi być full_time lub part_time: {p.get('study_mode')}")

    return len(errors) == 0, errors
