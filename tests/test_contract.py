"""
Testy jednostkowe kontraktu danych v1 i walidatora (core/validate.py, core/ids.py).
"""
import unittest
from core.ids import generate_lesson_id
from core.validate import (
    validate_lesson,
    validate_group_schedule,
    validate_plans_index,
    ValidationError
)


class TestContractV1(unittest.TestCase):

    def test_generate_lesson_id_deterministic(self):
        id1 = generate_lesson_id(
            subject="Matematyka",
            form="lecture",
            day_of_week="MON",
            start_time="08:00",
            end_time="09:30",
            room="Aula",
            start_date="2026-10-05"
        )
        id2 = generate_lesson_id(
            subject="Matematyka",
            form="lecture",
            day_of_week="MON",
            start_time="08:00",
            end_time="09:30",
            room="Aula",
            start_date="2026-10-05"
        )
        self.assertEqual(id1, id2)
        self.assertEqual(len(id1), 16)

    def test_generate_lesson_id_half_semester_collision_free(self):
        """Ten sam przedmiot, sala i godziny w 1. i 2. połowie semestru muszą mieć różne ID."""
        id_half1 = generate_lesson_id(
            subject="Nawigacja",
            form="lab",
            day_of_week="WT",
            start_time="10:00",
            end_time="11:30",
            room="306",
            half_semester=1,
            start_date="2026-10-05"
        )
        id_half2 = generate_lesson_id(
            subject="Nawigacja",
            form="lab",
            day_of_week="WT",
            start_time="10:00",
            end_time="11:30",
            room="306",
            half_semester=2,
            start_date="2026-10-05"
        )
        self.assertNotEqual(id_half1, id_half2)

    def test_validate_lesson_success_and_defaults(self):
        raw = {
            "id": "1234567890abcdef",
            "subject": "Fizyka",
            "start_time": "11:45",
            "end_time": "13:15",
            "duration_minutes": 90,
            "form": "exercise",
            "occurrences": [
                {"date": "2026-10-06", "number": 1, "of": 15}
            ]
        }
        validated = validate_lesson(raw)
        self.assertEqual(validated["subject"], "Fizyka")
        self.assertIsNone(validated["room"])
        self.assertFalse(validated["remote"])
        self.assertFalse(validated["hideable"])
        self.assertEqual(validated["interval_weeks"], 1)

    def test_validate_lesson_missing_required_fields(self):
        with self.assertRaises(ValidationError) as ctx:
            validate_lesson({"subject": "Informatyka"})
        self.assertIn("brakuje wymaganego pola", str(ctx.exception))

    def test_validate_lesson_invalid_form(self):
        raw = {
            "id": "1234567890abcdef",
            "subject": "Fizyka",
            "start_time": "11:45",
            "end_time": "13:15",
            "duration_minutes": 90,
            "form": "wyklad_nieznany",
            "occurrences": []
        }
        with self.assertRaises(ValidationError) as ctx:
            validate_lesson(raw)
        self.assertIn("form musi należeć do", str(ctx.exception))

    def test_validate_group_schedule(self):
        valid_sched = {
            "schema_version": 1,
            "plan_id": "561",
            "group": "GR_1",
            "generated_at": "2026-10-19T20:00:00Z",
            "lessons": [
                {
                    "id": "a1b2c3d4e5f60718",
                    "subject": "Matematyka",
                    "start_time": "08:00",
                    "end_time": "09:30",
                    "duration_minutes": 90,
                    "form": "lecture",
                    "occurrences": [{"date": "2026-10-05", "number": 1, "of": 15}]
                }
            ]
        }
        ok, errors = validate_group_schedule(valid_sched)
        self.assertTrue(ok)
        self.assertEqual(errors, [])

    def test_validate_plans_index(self):
        valid_index = {
            "schema_version": 1,
            "tenant": "umg_wn",
            "generated_at": "2026-10-19T20:00:00Z",
            "plans": [
                {
                    "id": "561",
                    "institution": "umg",
                    "faculty": "wn",
                    "name": "Transport Morski sem. 1",
                    "study_mode": "full_time",
                    "version_token": "wer. 1",
                    "groups": ["GR_1"]
                }
            ]
        }
        ok, errors = validate_plans_index(valid_index)
        self.assertTrue(ok)
        self.assertEqual(errors, [])

    def test_validate_umg_wn_tenant_config(self):
        import json
        import os
        config_path = os.path.join(os.path.dirname(__file__), "..", "tenants", "umg_wn", "config.json")
        self.assertTrue(os.path.exists(config_path), "Brak pliku tenants/umg_wn/config.json")

        with open(config_path, "r", encoding="utf-8") as f:
            cfg = json.load(f)

        self.assertEqual(cfg.get("id"), "umg_wn")
        self.assertTrue(isinstance(cfg.get("name"), str))
        self.assertEqual(cfg.get("locale"), "pl")
        self.assertIn("forms", cfg)
        for expected_form in ("lecture", "exercise", "lab", "simulator"):
            self.assertIn(expected_form, cfg["forms"])
            self.assertIn("label", cfg["forms"][expected_form])
            self.assertIn("badge_color", cfg["forms"][expected_form])

        features = cfg.get("features", {})
        self.assertTrue(features.get("cross_reference"))
        self.assertTrue(features.get("free_rooms"))
        self.assertTrue(features.get("events"))
        self.assertTrue(isinstance(features.get("lesson_hiding"), dict))
        self.assertTrue(features["lesson_hiding"].get("enabled"))
        self.assertTrue(isinstance(features.get("voting"), dict))
        self.assertFalse(features["voting"].get("enabled"))
        self.assertTrue(features.get("changelog"))


if __name__ == "__main__":
    unittest.main()

