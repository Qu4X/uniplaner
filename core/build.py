"""
Główny orchestrator kompilacji statycznej strony planów zajęć (core.build).
Zapewnia multi-tenantowość, detekcję zmian, fail-safe oraz generowanie JSON i ICS zgodnych z kontraktem v1.
"""
import os
import re
import json
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime

from sources.base import ScheduleSource, PlanMetadata, RawLesson
from core.contracts import GroupSchedule, Lesson, PlanEntry, PlansIndex
from core.ids import generate_lesson_id, compute_lesson_id
from core.expand import expand_occurrences
from core.validate import validate_schedule
from core.ics import generate_calendar_ics
from core.detector import ChangeDetector
from core.cross_ref import build_cross_reference_indexes

logger = logging.getLogger("core.build")


def sanitize_group_name(group: str) -> str:
    """Krytyczny kontrakt: sanityzacja nazwy grupy dla plików na dysku."""
    return re.sub(r'[^\w-]', '_', group)


class BuildOrchestrator:
    def __init__(
        self,
        tenant_config: Dict[str, Any],
        sources: List[ScheduleSource],
        dist_dir: str,
        state_file: Optional[str] = None
    ):
        self.tenant_config = tenant_config
        self.sources = sources
        self.dist_dir = dist_dir
        self.schedules_dir = os.path.join(self.dist_dir, "data", "schedules")
        self.calendars_dir = os.path.join(self.dist_dir, "calendars")
        self.data_dir = os.path.join(self.dist_dir, "data")
        self.state_file = state_file or os.path.join(self.dist_dir, ".build-state.json")
        self.detector = ChangeDetector(self.state_file)

        os.makedirs(self.schedules_dir, exist_ok=True)
        os.makedirs(self.calendars_dir, exist_ok=True)
        os.makedirs(self.data_dir, exist_ok=True)

    def run(
        self,
        force: bool = False,
        plan_filter: Optional[List[str]] = None,
        limit: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Główna pętla kompilacji:
        1. Discover na źródłach
        2. Detect changes
        3. Fetch, expand, validate, save JSON + ICS
        4. Cross-reference
        5. Save state
        """
        logger.info(f"Rozpoczynanie buildu dla tenanta: {self.tenant_config.get('id', 'default')}...")
        academic_calendar = self.tenant_config.get("academic_calendar") or {}

        # 1. Discover
        all_discovered: List[PlanMetadata] = []
        source_map: Dict[str, ScheduleSource] = {}
        for src in self.sources:
            try:
                plans = src.discover()
                for p in plans:
                    all_discovered.append(p)
                    source_map[p.id] = src
            except Exception as e:
                logger.error(f"Błąd podczas discover w źródle {src.source_id}: {e}")

        if plan_filter:
            all_discovered = [p for p in all_discovered if p.id in plan_filter]

        if limit and limit > 0:
            all_discovered = all_discovered[:limit]

        logger.info(f"Odkryto łącznie {len(all_discovered)} planów.")

        # 2. Change detection
        plans_to_fetch, plans_unchanged = self.detector.detect_changes(all_discovered, force=force)
        logger.info(f"Plany do pobrania: {len(plans_to_fetch)}, Plany niezmienione: {len(plans_unchanged)}")

        total_groups_processed = 0
        failed_plans: List[str] = []
        plans_metadata_dict: Dict[str, Any] = {}

        # Zachowaj istniejące metadane dla niezmienionych planów
        plans_json_path = os.path.join(self.data_dir, "plans.json")
        if os.path.exists(plans_json_path):
            try:
                with open(plans_json_path, "r", encoding="utf-8") as f:
                    old_index = json.load(f)
                    plans_metadata_dict = old_index.get("plans", {})
            except Exception:
                pass

        # 3. Przetwarzanie planów wymagających odświeżenia
        for plan in plans_to_fetch:
            src = source_map.get(plan.id)
            if not src:
                continue

            logger.info(f"Pobieranie i przetwarzanie planu {plan.id} ({plan.name})...")
            try:
                schedule_by_group = src.fetch_schedule(plan.id)
                if not schedule_by_group:
                    logger.warning(f"Plan {plan.id} zwrócił pusty harmonogram.")
                    continue

                groups = sorted(list(schedule_by_group.keys()))
                for grp in groups:
                    raw_lessons = schedule_by_group[grp]
                    contract_lessons: List[Lesson] = []

                    for rl in raw_lessons:
                        # Rozwinięcie wystąpień, jeśli adapter ich nie wyliczył (np. stacjonarne)
                        occurrences = rl.occurrences
                        if occurrences is None:
                            occurrences = expand_occurrences(rl, academic_calendar)

                        first_occ = occurrences[0]["date"] if occurrences else None
                        lesson_id = generate_lesson_id(
                            subject=rl.subject,
                            form=rl.form,
                            day_of_week=rl.day_of_week,
                            start_time=rl.start_time,
                            end_time=rl.end_time,
                            room=rl.room,
                            half_semester=rl.half_semester,
                            interval_weeks=rl.interval_weeks or 1,
                            start_date=rl.start_date,
                            first_occurrence_date=first_occ
                        )
                        lesson_dict: Lesson = {
                            "id": lesson_id,
                            "subject": rl.subject,
                            "raw_subject": rl.raw_subject or rl.subject,
                            "start_time": rl.start_time,
                            "end_time": rl.end_time,
                            "duration_minutes": rl.duration_minutes,
                            "form": rl.form,
                            "teacher": rl.teacher,
                            "room": rl.room,
                            "remote": rl.remote,
                            "hideable": rl.hideable,
                            "day_of_week": rl.day_of_week,
                            "occurrences": occurrences,
                            "groups": rl.groups
                        }
                        contract_lessons.append(lesson_dict)

                    group_schedule: GroupSchedule = {
                        "schema_version": 1,
                        "plan_id": plan.id,
                        "group": grp,
                        "lessons": contract_lessons
                    }

                    # Walidacja kontraktu
                    is_valid, val_errors = validate_schedule(group_schedule)
                    if not is_valid:
                        logger.warning(f"Ostrzeżenie walidacji {plan.id}_{grp}: {val_errors}")

                    # Zapis JSON
                    safe_grp = sanitize_group_name(grp)
                    json_path = os.path.join(self.schedules_dir, f"{plan.id}_{safe_grp}.json")
                    with open(json_path, "w", encoding="utf-8") as jf:
                        json.dump(group_schedule, jf, ensure_ascii=False, indent=2)

                    # Generowanie i zapis ICS
                    ics_data = generate_calendar_ics(group_schedule, grp)
                    ics_bytes = ics_data.encode("utf-8") if isinstance(ics_data, str) else ics_data
                    ics_path = os.path.join(self.calendars_dir, f"{plan.id}_{safe_grp}.ics")
                    with open(ics_path, "wb") as icsf:
                        icsf.write(ics_bytes)

                    total_groups_processed += 1

                # Sukces planu: odnotuj w stanie i metadanych
                self.detector.record_success(plan, len(groups))
                plans_metadata_dict[plan.id] = {
                    "id": plan.id,
                    "name": plan.name,
                    "institution": plan.institution,
                    "faculty": plan.faculty,
                    "study_mode": plan.study_mode,
                    "semester_number": plan.semester_number,
                    "published_at": plan.published_at,
                    "version_token": plan.version_token,
                    "groups": groups
                }

            except Exception as e:
                logger.error(f"Błąd przetwarzania planu {plan.id}: {e}", exc_info=True)
                failed_plans.append(plan.id)
                # Fail-safe: nie rzucamy błędu wyżej, zachowujemy poprzednie pliki jeśli były

        # Aktualizuj metadane dla planów, które pozostały niezmienione
        for plan in plans_unchanged:
            if plan.id not in plans_metadata_dict:
                plans_metadata_dict[plan.id] = {
                    "id": plan.id,
                    "name": plan.name,
                    "institution": plan.institution,
                    "faculty": plan.faculty,
                    "study_mode": plan.study_mode,
                    "semester_number": plan.semester_number,
                    "published_at": plan.published_at,
                    "version_token": plan.version_token,
                    "groups": plan.groups
                }

        # Zapis plans.json
        plans_index: PlansIndex = {
            "version": 1,
            "generated_at": datetime.now().isoformat(),
            "plans": plans_metadata_dict
        }
        with open(plans_json_path, "w", encoding="utf-8") as f:
            json.dump(plans_index, f, ensure_ascii=False, indent=2)

        # 4. Cross-reference
        logger.info("Budowanie połączonych indeksów wyszukiwarki cross_reference.json...")
        cross_ref_path = os.path.join(self.data_dir, "cross_reference.json")
        build_cross_reference_indexes(
            plans_metadata={"plans": plans_metadata_dict},
            schedules_dir=self.schedules_dir,
            output_path=cross_ref_path,
            curriculum_catalog_path=self.tenant_config.get("curriculum_catalog_path")
        )

        # 5. Zapis stanu
        self.detector.save_state()

        logger.info(
            f"Build zakończony: {total_groups_processed} przetworzonych grup w tej iteracji. "
            f"Błędy planów: {len(failed_plans)}"
        )
        return {
            "total_groups_processed": total_groups_processed,
            "failed_plans": failed_plans,
            "total_plans": len(plans_metadata_dict)
        }
