"""
Testy jednostkowe dla orchestratora, change detectora, diff i cross-reference (Faza 4).
"""
import os
import json
import tempfile
import unittest
from typing import Dict, List, Any

from sources.base import PlanMetadata, RawLesson
from core.contracts import GroupSchedule, Lesson
from core.detector import ChangeDetector
from core.diff import diff_schedules
from core.cross_ref import build_cross_reference_indexes
from core.build import BuildOrchestrator


class MockScheduleSource:
    source_id = "mock_source"

    def __init__(self, plans: List[PlanMetadata], schedules: Dict[str, Dict[str, List[RawLesson]]], fail_on_id: str = None):
        self.plans = plans
        self.schedules = schedules
        self.fail_on_id = fail_on_id

    def discover(self) -> List[PlanMetadata]:
        return list(self.plans)

    def fetch_schedule(self, plan_id: str) -> Dict[str, List[RawLesson]]:
        if self.fail_on_id and plan_id == self.fail_on_id:
            raise RuntimeError(f"Symulowany błąd sieciowy dla planu {plan_id}")
        return self.schedules.get(plan_id, {})


class TestOrchestrator(unittest.TestCase):

    def setUp(self):
        self.td = tempfile.TemporaryDirectory()
        self.state_file = os.path.join(self.td.name, ".build-state.json")

    def tearDown(self):
        self.td.cleanup()

    def test_change_detector_flow(self):
        detector = ChangeDetector(self.state_file)
        plans = [
            PlanMetadata(
                id="1", institution="umg", faculty="wn", name="Plan 1",
                study_mode="full_time", semester_number=1, version_token="v1"
            ),
            PlanMetadata(
                id="2", institution="umg", faculty="wn", name="Plan 2",
                study_mode="full_time", semester_number=3, version_token="v1"
            )
        ]

        # 1. Pierwszy przebieg: wszystko do pobrania
        to_fetch, unchanged = detector.detect_changes(plans)
        self.assertEqual(len(to_fetch), 2)
        self.assertEqual(len(unchanged), 0)

        # Symulacja sukcesu obu planów
        detector.record_success(plans[0], 2)
        detector.record_success(plans[1], 2)
        detector.save_state()

        # 2. Drugi przebieg z tym samym stanem: wszystko unchanged
        detector2 = ChangeDetector(self.state_file)
        to_fetch2, unchanged2 = detector2.detect_changes(plans)
        self.assertEqual(len(to_fetch2), 0)
        self.assertEqual(len(unchanged2), 2)

        # 3. Zmiana wersji w Plan 1
        plans_updated = [
            PlanMetadata(
                id="1", institution="umg", faculty="wn", name="Plan 1",
                study_mode="full_time", semester_number=1, version_token="v2"
            ),
            plans[1]
        ]
        to_fetch3, unchanged3 = detector2.detect_changes(plans_updated)
        self.assertEqual(len(to_fetch3), 1)
        self.assertEqual(to_fetch3[0].id, "1")
        self.assertEqual(len(unchanged3), 1)
        self.assertEqual(unchanged3[0].id, "2")

        # 4. Wymuszenie --force
        to_fetch_force, unchanged_force = detector2.detect_changes(plans, force=True)
        self.assertEqual(len(to_fetch_force), 2)
        self.assertEqual(len(unchanged_force), 0)

    def test_diff_schedules(self):
        l1: Lesson = {
            "id": "l1", "subject": "Matematyka", "raw_subject": "MAT",
            "start_time": "08:00", "end_time": "09:30", "duration_minutes": 90,
            "form": "lecture", "teacher": "Dr Kowalski", "room": "Aula",
            "remote": False, "hideable": False, "day_of_week": "MON",
            "occurrences": [{"date": "2026-10-05", "number": 1, "of": 15}]
        }
        old_sched: GroupSchedule = {
            "plan_id": "1", "group": "GR_1", "lessons": [l1]
        }

        # Zmiana sali i dodanie nowego przedmiotu
        l1_mod: Lesson = dict(l1)
        l1_mod["room"] = "101"
        l2: Lesson = {
            "id": "l2", "subject": "Fizyka", "raw_subject": "FIZ",
            "start_time": "09:45", "end_time": "11:15", "duration_minutes": 90,
            "form": "lab", "teacher": "Dr Nowak", "room": "Lab 1",
            "remote": False, "hideable": False, "day_of_week": "MON",
            "occurrences": [{"date": "2026-10-05", "number": 1, "of": 15}]
        }
        new_sched: GroupSchedule = {
            "plan_id": "1", "group": "GR_1", "lessons": [l1_mod, l2]
        }

        diff = diff_schedules(old_sched, new_sched)
        self.assertTrue(diff["has_changes"])
        self.assertEqual(len(diff["added"]), 1)
        self.assertEqual(diff["added"][0]["id"], "l2")
        self.assertEqual(len(diff["removed"]), 0)
        self.assertEqual(len(diff["modified"]), 1)
        self.assertEqual(diff["modified"][0]["lesson_id"], "l1")
        self.assertIn("room", diff["modified"][0]["changes"])
        self.assertEqual(diff["modified"][0]["changes"]["room"]["old"], "Aula")
        self.assertEqual(diff["modified"][0]["changes"]["room"]["new"], "101")

    def test_cross_ref_indexing_contract_v1(self):
        schedules_dir = os.path.join(self.td.name, "schedules")
        os.makedirs(schedules_dir, exist_ok=True)

        l1: Lesson = {
            "id": "l1", "subject": "Nawigacja", "raw_subject": "NAW",
            "start_time": "08:00", "end_time": "09:30", "duration_minutes": 90,
            "form": "lecture", "teacher": "Kpt. Nowak", "room": "202",
            "remote": False, "hideable": False, "day_of_week": "MON",
            "occurrences": [{"date": "2026-10-05", "number": 1, "of": 1}]
        }
        sched: GroupSchedule = {
            "plan_id": "100", "group": "GR 1", "lessons": [l1]
        }
        with open(os.path.join(schedules_dir, "100_GR_1.json"), "w", encoding="utf-8") as f:
            json.dump(sched, f)

        plans_meta = {
            "plans": {
                "100": {"name": "Nawigacja sem. 1", "groups": ["GR 1"]}
            }
        }
        out_path = os.path.join(self.td.name, "cross_reference.json")
        res = build_cross_reference_indexes(plans_meta, schedules_dir=schedules_dir, output_path=out_path)

        self.assertIn("Kpt. Nowak", res["teachers"])
        self.assertIn("202", res["rooms"])
        self.assertIn("Nawigacja", res["subjects"])
        # Sprawdzenie obecności pola dates (tablica z datami)
        room_entries = res["rooms"]["202"]["PON"]
        self.assertEqual(len(room_entries), 1)
        self.assertEqual(room_entries[0]["dates"], ["2026-10-05"])

    def test_build_orchestrator_fail_safe(self):
        p1 = PlanMetadata(id="p1", institution="umg", faculty="wn", name="Plan Pomyślny",
                          study_mode="full_time", semester_number=1, version_token="v1")
        p2 = PlanMetadata(id="p2", institution="umg", faculty="wn", name="Plan Wadliwy",
                          study_mode="full_time", semester_number=3, version_token="v1")

        rl1 = RawLesson(
            subject="Matematyka", raw_subject="MAT", start_time="08:00", end_time="09:30",
            duration_minutes=90, form="lecture", teacher="Dr K", room="101", remote=False,
            hideable=False, day_of_week="MON", start_date="2026-10-05", interval_weeks=1,
            weeks=1, occurrences=[{"date": "2026-10-05", "number": 1, "of": 1}]
        )
        mock_source = MockScheduleSource(
            plans=[p1, p2],
            schedules={"p1": {"1": [rl1]}},
            fail_on_id="p2"
        )

        dist_dir = os.path.join(self.td.name, "dist")
        orchestrator = BuildOrchestrator(
            tenant_config={"id": "test_tenant", "academic_calendar": {}},
            sources=[mock_source],
            dist_dir=dist_dir
        )

        res = orchestrator.run(force=True)
        # Fail-safe: p1 zakończył się sukcesem, p2 odnotowany jako błąd, ale build nie rzucił błędu
        self.assertEqual(res["total_groups_processed"], 1)
        self.assertEqual(res["failed_plans"], ["p2"])

        # Sprawdzenie czy p1 został wygenerowany w dist/
        p1_json = os.path.join(dist_dir, "data", "schedules", "p1_1.json")
        p1_ics = os.path.join(dist_dir, "calendars", "p1_1.ics")
        self.assertTrue(os.path.exists(p1_json))
        self.assertTrue(os.path.exists(p1_ics))

        # Sprawdzenie zgodności plans.json z validate_plans_index
        from core.validate import validate_plans_index
        with open(os.path.join(dist_dir, "data", "plans.json"), "r", encoding="utf-8") as f:
            plans_idx = json.load(f)
        ok, errs = validate_plans_index(plans_idx)
        self.assertTrue(ok, f"plans.json nie przeszedł walidacji: {errs}")

        # 2. Przebieg z błędną walidacją (ujemny duration_minutes): stary plik p1_1.json musi zostać nienaruszony
        rl_bad = RawLesson(
            subject="Zepsuty Przedmiot", raw_subject="BAD", start_time="08:00", end_time="07:00",
            duration_minutes=-60, form="lecture", teacher="Dr K", room="101", remote=False,
            hideable=False, day_of_week="MON", start_date="2026-10-05", interval_weeks=1,
            weeks=1, occurrences=[{"date": "2026-10-05", "number": 1, "of": 1}]
        )
        p1_v2 = PlanMetadata(id="p1", institution="umg", faculty="wn", name="Plan Pomyślny",
                             study_mode="full_time", semester_number=1, version_token="v2")
        bad_source = MockScheduleSource(plans=[p1_v2], schedules={"p1": {"1": [rl_bad]}})
        orchestrator2 = BuildOrchestrator(
            tenant_config={"id": "test_tenant", "academic_calendar": {}},
            sources=[bad_source],
            dist_dir=dist_dir
        )
        res2 = orchestrator2.run(force=False)
        self.assertEqual(res2["failed_plans"], ["p1"])
        with open(p1_json, "r", encoding="utf-8") as f:
            saved_p1 = json.load(f)
        self.assertEqual(saved_p1["lessons"][0]["subject"], "Matematyka")

    def test_winter_plan_archiving_after_exam_session(self):
        from core.build import is_winter_plan_archived
        cal = {
            "periods": [
                {"type": "teaching", "name": "Semestr zimowy", "start": "2026-10-01", "end": "2027-01-31"},
                {"type": "exam", "name": "Sesja zimowa", "start": "2027-02-01", "end": "2027-02-14"},
                {"type": "retake", "name": "Sesja poprawkowa zimowa", "start": "2027-02-15", "end": "2027-02-21"}
            ]
        }
        # Przed końcem sesji poprawkowej -> niezarchiwizowany
        self.assertFalse(is_winter_plan_archived(1, cal, "2027-02-18"))
        # Po końcu sesji poprawkowej -> zarchiwizowany
        self.assertTrue(is_winter_plan_archived(1, cal, "2027-02-22"))
        # Semestr letni (parzysty) -> niezarchiwizowany
        self.assertFalse(is_winter_plan_archived(2, cal, "2027-02-22"))


if __name__ == "__main__":
    unittest.main()
