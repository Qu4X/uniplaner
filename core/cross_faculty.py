"""
Moduł integracji międzywydziałowej (Cross-Faculty Institution Merge) w ramach jednej uczelni.
Agreguje pliki cross_reference.json poszczególnych wydziałów (tenantów), wykrywa kolizje
terminów sal i prowadzących oraz wzbogaca indeksy wydziałowe o zajętość z innych wydziałów.
"""
import os
import re
import json
import logging
from typing import Dict, List, Any, Optional, Set, Tuple
from collections import defaultdict

from core.normalizer import canonicalize_teacher_name, canonicalize_room_name

logger = logging.getLogger("core.cross_faculty")


def _parse_time_range(hours_str: str) -> Optional[Tuple[int, int]]:
    """
    Parsuje 'HH:MM - HH:MM' na minuty od północy: (start_minutes, end_minutes).
    """
    if not hours_str or "-" not in hours_str:
        return None
    try:
        parts = hours_str.split("-")
        sh, sm = map(int, parts[0].strip().split(":"))
        eh, em = map(int, parts[1].strip().split(":"))
        return (sh * 60 + sm, eh * 60 + em)
    except Exception:
        return None


def _times_overlap(range_a: Tuple[int, int], range_b: Tuple[int, int]) -> bool:
    """Sprawdza, czy dwa przedziały czasowe (w minutach) nakładają się na siebie."""
    return max(range_a[0], range_b[0]) < min(range_a[1], range_b[1])


def detect_conflicts(
    entries: List[Dict[str, Any]],
    conflict_type: str = "ROOM_CONFLICT",
    entity_name: str = ""
) -> List[Dict[str, Any]]:
    """
    Wykrywa kolizje w liście spotkań (slotów) danej encji (sali lub prowadzącego).
    Porównuje dni tygodnia, zakres godzin oraz wspólne daty realizacji w dates[].
    """
    conflicts = []
    n = len(entries)
    for i in range(n):
        entry_a = entries[i]
        time_a = _parse_time_range(entry_a.get("hours", ""))
        dates_a = set(entry_a.get("dates") or [])
        day_a = entry_a.get("day")

        for j in range(i + 1, n):
            entry_b = entries[j]
            # Kolizja zachodzi tylko wtedy, gdy spotkania są w tym samym dniu tygodnia
            if entry_a.get("day") != entry_b.get("day"):
                continue

            time_b = _parse_time_range(entry_b.get("hours", ""))
            if not time_a or not time_b or not _times_overlap(time_a, time_b):
                continue

            dates_b = set(entry_b.get("dates") or [])
            common_dates = dates_a.intersection(dates_b)

            # Jeśli nie ma pre-kalkulowanych dat, kolizję uznajemy przy nakładaniu godzin w tym samym dniu
            if (dates_a and dates_b and common_dates) or (not dates_a and not dates_b):
                # Pomiń jeśli to dokładnie ten sam plan i te same grupy (np. zduplikowany wpis połączonych grup)
                pid_a = entry_a.get("plan_id")
                pid_b = entry_b.get("plan_id")
                grp_a = set(entry_a.get("groups") or [])
                grp_b = set(entry_b.get("groups") or [])
                if pid_a and pid_b and pid_a == pid_b and grp_a and grp_b and grp_a == grp_b:
                    continue

                conflicts.append({
                    "type": conflict_type,
                    "entity": entity_name,
                    "day": day_a,
                    "hours_a": entry_a.get("hours"),
                    "hours_b": entry_b.get("hours"),
                    "common_dates": sorted(list(common_dates)) if common_dates else [],
                    "tenant_a": entry_a.get("source_tenant", "unknown"),
                    "faculty_a": entry_a.get("source_faculty", "unknown"),
                    "subject_a": entry_a.get("subject"),
                    "teacher_a": entry_a.get("teacher"),
                    "groups_a": entry_a.get("groups"),
                    "tenant_b": entry_b.get("source_tenant", "unknown"),
                    "faculty_b": entry_b.get("source_faculty", "unknown"),
                    "subject_b": entry_b.get("subject"),
                    "teacher_b": entry_b.get("teacher"),
                    "groups_b": entry_b.get("groups"),
                })

    return conflicts


def load_institution_aliases(institution_id: str, repo_root: str) -> Dict[str, Any]:
    """Wczytuje wspólne aliasy uczelniane z tenants/<institution_id>/_common/aliases.json."""
    common_aliases_path = os.path.join(repo_root, "tenants", institution_id, "_common", "aliases.json")
    if os.path.exists(common_aliases_path):
        try:
            with open(common_aliases_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Błąd podczas wczytywania {common_aliases_path}: {e}")
    return {"teachers": {}, "rooms": {}, "subjects": {}}


def merge_institution_cross_references(
    institution_id: str,
    dist_dir: str,
    repo_root: str,
    tenants_list: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """
    Główny punkt wejścia agregacji międzywydziałowej dla danej uczelni:
    1. Znajduje wszystkie wydziały uczelni w dist_dir.
    2. Wczytuje i sanityzuje ich pliki cross_reference.json.
    3. Wykrywa kolizje w salach oraz w planach prowadzących.
    4. Zapisuje raport kolizji dist/<institution_id>/reports/conflicts.json.
    5. Wzbogaca cross_reference.json każdego wydziału o obcą zajętość sal (non-destructive).
    """
    logger.info(f"=== Rozpoczynanie agregacji międzywydziałowej dla uczelni: {institution_id} ===")
    common_aliases = load_institution_aliases(institution_id, repo_root)
    teacher_aliases = common_aliases.get("teachers", {})
    room_aliases = common_aliases.get("rooms", {})

    # Wykryj katalogi wydziałów w dist/
    inst_dist_dir = os.path.join(dist_dir, institution_id)
    if not os.path.exists(inst_dist_dir):
        logger.warning(f"Katalog uczelni {inst_dist_dir} nie istnieje.")
        return {}

    faculty_dirs = []
    for item in os.listdir(inst_dist_dir):
        p = os.path.join(inst_dist_dir, item)
        if os.path.isdir(p) and item not in ("reports", "data", "assets"):
            faculty_dirs.append(item)

    if len(faculty_dirs) < 2:
        logger.info(f"Uczelnia {institution_id} ma {len(faculty_dirs)} wydział(ów) w dist. Pomijanie agregacji wielowydziałowej.")
        return {"faculties": faculty_dirs, "conflicts": []}

    # Wczytaj cross_reference.json każdego wydziału
    faculty_data: Dict[str, Dict[str, Any]] = {}
    for fac in faculty_dirs:
        cr_path = os.path.join(inst_dist_dir, fac, "data", "cross_reference.json")
        if os.path.exists(cr_path):
            try:
                with open(cr_path, "r", encoding="utf-8") as f:
                    faculty_data[fac] = json.load(f)
            except Exception as e:
                logger.error(f"Nie udało się wczytać {cr_path}: {e}")

    # Agregacja sal i wykładowców
    all_rooms_entries: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    all_teachers_entries: Dict[str, List[Dict[str, Any]]] = defaultdict(list)

    for fac, cr in faculty_data.items():
        tenant_slug = f"{institution_id}/{fac}"

        # 1. Prowadzący
        for raw_t_name, slots in cr.get("teachers", {}).items():
            canon_t = canonicalize_teacher_name(raw_t_name, aliases=teacher_aliases)
            for s in slots:
                entry = dict(s)
                entry["source_faculty"] = fac.upper()
                entry["source_tenant"] = tenant_slug
                entry["canonical_teacher"] = canon_t
                all_teachers_entries[canon_t].append(entry)

        # 2. Sale
        for raw_r_name, days_dict in cr.get("rooms", {}).items():
            canon_r = canonicalize_room_name(raw_r_name, aliases=room_aliases)
            for day, slots in days_dict.items():
                for s in slots:
                    entry = dict(s)
                    entry["day"] = day
                    entry["source_faculty"] = fac.upper()
                    entry["source_tenant"] = tenant_slug
                    entry["canonical_room"] = canon_r
                    all_rooms_entries[canon_r].append(entry)

    # Weryfikacja kolizji (Conflict Detection)
    all_conflicts: List[Dict[str, Any]] = []

    # Kolizje sal
    for r_name, entries in all_rooms_entries.items():
        r_conflicts = detect_conflicts(entries, conflict_type="ROOM_CONFLICT", entity_name=r_name)
        all_conflicts.extend(r_conflicts)

    # Kolizje prowadzących
    for t_name, entries in all_teachers_entries.items():
        t_conflicts = detect_conflicts(entries, conflict_type="TEACHER_CONFLICT", entity_name=t_name)
        all_conflicts.extend(t_conflicts)

    if all_conflicts:
        logger.warning(f"Wykryto {len(all_conflicts)} potencjalnych kolizji międzywydziałowych na uczelni {institution_id}!")
        for c in all_conflicts[:5]:
            logger.warning(
                f"  [{c['type']}] {c['entity']} ({c['day']}): {c['faculty_a']} ({c['subject_a']}) vs {c['faculty_b']} ({c['subject_b']})"
            )
        if len(all_conflicts) > 5:
            logger.warning(f"  ... i {len(all_conflicts) - 5} kolejnych kolizji (zobacz raport).")

    # Zapis raportu kolizji
    reports_dir = os.path.join(inst_dist_dir, "reports")
    os.makedirs(reports_dir, exist_ok=True)
    report_file = os.path.join(reports_dir, "conflicts.json")
    with open(report_file, "w", encoding="utf-8") as rf:
        json.dump({
            "institution": institution_id,
            "total_conflicts": len(all_conflicts),
            "conflicts": all_conflicts
        }, rf, ensure_ascii=False, indent=2)
    logger.info(f"Zapisano raport kolizji w: {report_file}")

    # Wzbogacenie indeksów wydziałowych o obcą zajętość (Non-destructive merge)
    for fac, cr in faculty_data.items():
        cr_path = os.path.join(inst_dist_dir, fac, "data", "cross_reference.json")
        rooms_dict = cr.get("rooms", {})
        teachers_dict = cr.get("teachers", {})

        # Wstrzyknij obce zajęcia do sal tego wydziału
        enriched_rooms_count = 0
        for canon_r, all_slots in all_rooms_entries.items():
            foreign_slots = [s for s in all_slots if s.get("source_faculty") != fac.upper()]
            if not foreign_slots:
                continue

            # Znajdź klucz sali w cr tego wydziału lub utwórz
            target_key = None
            for existing_k in rooms_dict.keys():
                if canonicalize_room_name(existing_k, aliases=room_aliases) == canon_r:
                    target_key = existing_k
                    break
            
            if not target_key:
                # Jeśli sala jest ogólnouczelniana i wydział o niej wie
                target_key = canon_r
                rooms_dict[target_key] = {"PON": [], "WT": [], "ŚR": [], "CZW": [], "PT": [], "SOB": [], "ND": []}

            # Dodaj obce sloty
            for fs in foreign_slots:
                day = fs.get("day", "PON")
                if day not in rooms_dict[target_key]:
                    rooms_dict[target_key][day] = []
                
                # Bezpieczna kopia wpisu obcego wydziału
                slot_copy = {
                    "slot": fs.get("slot"),
                    "hours": fs.get("hours"),
                    "subject": f"[{fs.get('source_faculty')}] {fs.get('subject')}",
                    "teacher": fs.get("teacher"),
                    "groups": fs.get("groups"),
                    "plan_id": fs.get("plan_id"),
                    "plan_name": fs.get("plan_name"),
                    "weeks": fs.get("weeks"),
                    "data_start": fs.get("data_start"),
                    "co_ile": fs.get("co_ile", 1),
                    "od_tyg": fs.get("od_tyg", 1),
                    "polowa_sem": fs.get("polowa_sem"),
                    "dates": fs.get("dates", []),
                    "source_faculty": fs.get("source_faculty"),
                    "foreign_booking": True
                }
                rooms_dict[target_key][day].append(slot_copy)
                enriched_rooms_count += 1

        # Zaktualizuj plik wydziału
        cr["rooms"] = rooms_dict
        with open(cr_path, "w", encoding="utf-8") as out_f:
            json.dump(cr, out_f, ensure_ascii=False, indent=2)

    logger.info(f"Pomyślnie zsynchronizowano dane międzywydziałowe dla {len(faculty_dirs)} wydziałów uczelni {institution_id}.")
    return {
        "institution": institution_id,
        "faculties": faculty_dirs,
        "conflicts": all_conflicts
    }
