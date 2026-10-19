"""
Obliczanie różnic między wersjami planów zajęć.
Wykrywa dodane, usunięte oraz zmodyfikowane lekcje pomiędzy dwoma zestawami GroupSchedule.
"""
from typing import Dict, List, Any, Optional
from core.contracts import GroupSchedule, Lesson


def diff_schedules(
    old_schedule: Optional[GroupSchedule],
    new_schedule: GroupSchedule
) -> Dict[str, Any]:
    """
    Porównuje dwa obiekty GroupSchedule i zwraca podsumowanie zmian:
    {
        "has_changes": bool,
        "added": List[Lesson],
        "removed": List[Lesson],
        "modified": List[Dict[str, Any]]
    }
    """
    if not old_schedule:
        return {
            "has_changes": True,
            "added": new_schedule.get("lessons", []),
            "removed": [],
            "modified": []
        }

    old_lessons_by_id = {l["id"]: l for l in old_schedule.get("lessons", []) if "id" in l}
    new_lessons_by_id = {l["id"]: l for l in new_schedule.get("lessons", []) if "id" in l}

    added: List[Lesson] = []
    removed: List[Lesson] = []
    modified: List[Dict[str, Any]] = []

    for lid, new_l in new_lessons_by_id.items():
        if lid not in old_lessons_by_id:
            added.append(new_l)
        else:
            old_l = old_lessons_by_id[lid]
            field_changes = {}
            for field in ("room", "teacher", "form", "remote", "start_time", "end_time"):
                if old_l.get(field) != new_l.get(field):
                    field_changes[field] = {
                        "old": old_l.get(field),
                        "new": new_l.get(field)
                    }
            if field_changes:
                modified.append({
                    "lesson_id": lid,
                    "subject": new_l.get("subject"),
                    "changes": field_changes
                })

    for lid, old_l in old_lessons_by_id.items():
        if lid not in new_lessons_by_id:
            removed.append(old_l)

    has_changes = bool(added or removed or modified)
    return {
        "has_changes": has_changes,
        "added": added,
        "removed": removed,
        "modified": modified
    }
