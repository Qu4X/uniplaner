"""
tests/test_sggw_adapter.py — Testy jednostkowe dla adaptera SGGW WMW (Faza 8).
"""
import os
import unittest
from sources.sggw_weta.adapter import SggwExcelSource
from sources.sggw_weta.parser import (
    extract_groups_from_text,
    parse_time_bounds,
    extract_room_and_subject
)
from core.build import load_tenant_config, get_tenant_sources

FIXTURE_PATH = os.path.join(os.path.dirname(__file__), "fixtures", "semestr_7.xlsx")


class TestSggwAdapter(unittest.TestCase):

    def test_parser_utilities(self):
        all_groups = [f"gr. {i}" for i in range(1, 8)]

        # extract_groups_from_text
        self.assertEqual(extract_groups_from_text("Wykład ogólny", all_groups), all_groups)
        self.assertEqual(extract_groups_from_text("Chirurgia gr. 1 Wolica", all_groups), ["gr. 1"])
        self.assertEqual(extract_groups_from_text("Badanie mięsa ćw. gr. 1, 2 sale", all_groups), ["gr. 1", "gr. 2"])

        # parse_time_bounds
        self.assertEqual(parse_time_bounds("od 8:30 do 10:45", "08:15", "11:00"), ("08:30", "10:45"))
        self.assertEqual(parse_time_bounds("Wykład ogólny", "08:15", "09:00"), ("08:15", "09:00"))

        # extract_room_and_subject
        sub, room, _ = extract_room_and_subject("Higiena pasz w.\naud 7 b. 24")
        self.assertEqual(sub, "Higiena pasz")
        self.assertEqual(room, "aud 7 b. 24")

    def test_discover_wmw_plans(self):
        source = SggwExcelSource()
        plans = source.discover()
        self.assertEqual(len(plans), 6)
        plan_ids = [p.id for p in plans]
        self.assertIn("wmw_sem_1", plan_ids)
        self.assertIn("wmw_sem_7", plan_ids)
        for p in plans:
            self.assertEqual(p.institution, "SGGW")
            self.assertEqual(p.faculty, "WMW")
            self.assertEqual(p.study_mode, "full_time")
            self.assertTrue(len(p.version_token) > 0)

    def test_fetch_schedule_from_fixture(self):
        if not os.path.exists(FIXTURE_PATH):
            self.skipTest(f"Fixture {FIXTURE_PATH} nie istnieje")

        source = SggwExcelSource()
        schedules = source.fetch_schedule("wmw_sem_7", custom_xlsx_path=FIXTURE_PATH)

        self.assertIsInstance(schedules, dict)
        expected_groups = [f"gr. {i}" for i in range(1, 8)]
        for g in expected_groups:
            self.assertIn(g, schedules, f"Brak grupy {g} w wynikach adaptera")
            lessons = schedules[g]
            self.assertTrue(len(lessons) > 0, f"Grupa {g} powinna mieć sparsowane lekcje")

        # Sprawdzenie wykładu w poniedziałek dla gr. 1
        gr1_lessons = schedules["gr. 1"]
        lectures = [l for l in gr1_lessons if l.day_of_week == "MON" and l.form == "lecture"]
        self.assertTrue(len(lectures) > 0, "Powinien istnieć wykład w poniedziałek")
        lecture = lectures[0]
        self.assertEqual(lecture.start_time, "08:15")
        self.assertEqual(lecture.end_time, "09:00")
        self.assertEqual(lecture.duration_minutes, 45)

    def test_tenant_config_and_sources_registration(self):
        config = load_tenant_config("sggw_weta")
        self.assertEqual(config["id"], "sggw_weta")
        self.assertEqual(config["institution"], "SGGW")
        self.assertTrue(config["features"]["lesson_hiding"]["bulk_electives_dialog"])
        self.assertTrue(config["features"]["voting"]["enabled"])
        self.assertIn("academic_calendar", config)

        sources = get_tenant_sources("sggw_weta")
        self.assertEqual(len(sources), 1)
        self.assertEqual(sources[0].source_id, "sggw_weta_excel")


if __name__ == "__main__":
    unittest.main()
