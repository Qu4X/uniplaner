"""
Testy jednostkowe modułu core/cross_faculty.py
"""
import unittest
import os
import shutil
import tempfile
import json
from core.cross_faculty import (
    _parse_time_range,
    _times_overlap,
    detect_conflicts,
    merge_institution_cross_references
)


class TestCrossFaculty(unittest.TestCase):

    def test_parse_time_range(self):
        self.assertEqual(_parse_time_range("08:00 - 09:30"), (480, 570))
        self.assertEqual(_parse_time_range("10:15 - 11:45"), (615, 705))
        self.assertIsNone(_parse_time_range("niepoprawny format"))

    def test_times_overlap(self):
        # 08:00 - 09:30 vs 09:00 - 10:30 (nakładają się)
        self.assertTrue(_times_overlap((480, 570), (540, 630)))
        # 08:00 - 09:30 vs 09:30 - 11:00 (stykają się, ale nie nakładają)
        self.assertFalse(_times_overlap((480, 570), (570, 660)))
        # 08:00 - 09:30 vs 10:00 - 11:30 (rozłączne)
        self.assertFalse(_times_overlap((480, 570), (600, 690)))

    def test_detect_conflicts_room_with_common_dates(self):
        entries = [
            {
                "day": "PON",
                "hours": "10:00 - 11:30",
                "dates": ["2026-10-05", "2026-10-12"],
                "subject": "Nawigacja",
                "teacher": "Kowalski Jan",
                "source_faculty": "WN",
                "plan_id": "1",
                "groups": ["GR1"]
            },
            {
                "day": "PON",
                "hours": "10:30 - 12:00",
                "dates": ["2026-10-12", "2026-10-19"],  # wspólna data 2026-10-12
                "subject": "Mechanika",
                "teacher": "Nowak Piotr",
                "source_faculty": "WM",
                "plan_id": "2",
                "groups": ["GR2"]
            }
        ]
        conflicts = detect_conflicts(entries, conflict_type="ROOM_CONFLICT", entity_name="Aula")
        self.assertEqual(len(conflicts), 1)
        self.assertEqual(conflicts[0]["entity"], "Aula")
        self.assertIn("2026-10-12", conflicts[0]["common_dates"])

    def test_detect_conflicts_no_common_dates_alternating(self):
        # Dwa spotkania w tym samym slocie, ale w różne tygodnie (brak kolizji!)
        entries = [
            {
                "day": "PON",
                "hours": "10:00 - 11:30",
                "dates": ["2026-10-05", "2026-10-19"],
                "subject": "Nawigacja",
                "source_faculty": "WN",
                "plan_id": "1",
                "groups": ["GR1"]
            },
            {
                "day": "PON",
                "hours": "10:00 - 11:30",
                "dates": ["2026-10-12", "2026-10-26"],
                "subject": "Mechanika",
                "source_faculty": "WM",
                "plan_id": "2",
                "groups": ["GR2"]
            }
        ]
        conflicts = detect_conflicts(entries, conflict_type="ROOM_CONFLICT", entity_name="Aula")
        self.assertEqual(len(conflicts), 0)

    def test_merge_institution_cross_references(self):
        td = tempfile.mkdtemp()
        try:
            repo_root = td
            dist_dir = os.path.join(td, "dist")
            inst = "umg"
            
            # Utwórz strukturę wydziałów WN i WM
            wn_data = os.path.join(dist_dir, inst, "wn", "data")
            wm_data = os.path.join(dist_dir, inst, "wm", "data")
            os.makedirs(wn_data, exist_ok=True)
            os.makedirs(wm_data, exist_ok=True)

            # Utwórz wspólny słownik aliasów uczelni
            common_dir = os.path.join(repo_root, "tenants", inst, "_common")
            os.makedirs(common_dir, exist_ok=True)
            with open(os.path.join(common_dir, "aliases.json"), "w", encoding="utf-8") as af:
                json.dump({
                    "teachers": {
                        "Kowalski J.": "Jan Kowalski"
                    },
                    "rooms": {
                        "aula": "Aula"
                    }
                }, af)

            # Pliki cross_reference.json dla obu wydziałów
            cr_wn = {
                "teachers": {
                    "dr Jan Kowalski": [
                        {"day": "PON", "slot": 30, "hours": "08:00 - 09:30", "subject": "Nawigacja", "dates": ["2026-10-05"]}
                    ]
                },
                "rooms": {
                    "Aula": {
                        "PON": [
                            {"slot": 30, "hours": "08:00 - 09:30", "subject": "Nawigacja", "dates": ["2026-10-05"]}
                        ]
                    }
                }
            }

            cr_wm = {
                "teachers": {
                    "Kowalski J.": [
                        # Kolizja: Jan Kowalski o 08:30 uczy też na WM w ten sam dzień!
                        {"day": "PON", "slot": 36, "hours": "08:30 - 10:00", "subject": "Siłownie", "dates": ["2026-10-05"]}
                    ]
                },
                "rooms": {
                    "aula": {
                        # Kolizja: Aula o 08:30 zajęta też przez WM
                        "PON": [
                            {"slot": 36, "hours": "08:30 - 10:00", "subject": "Siłownie", "dates": ["2026-10-05"]}
                        ]
                    }
                }
            }

            with open(os.path.join(wn_data, "cross_reference.json"), "w", encoding="utf-8") as f:
                json.dump(cr_wn, f)
            with open(os.path.join(wm_data, "cross_reference.json"), "w", encoding="utf-8") as f:
                json.dump(cr_wm, f)

            # Wywołaj merge
            res = merge_institution_cross_references(inst, dist_dir=dist_dir, repo_root=repo_root)
            self.assertEqual(len(res["faculties"]), 2)
            
            # Sprawdź czy wykryto kolizje
            conflicts = res["conflicts"]
            self.assertEqual(len(conflicts), 2) # 1 sala + 1 prowadzący
            conflict_types = {c["type"] for c in conflicts}
            self.assertIn("ROOM_CONFLICT", conflict_types)
            self.assertIn("TEACHER_CONFLICT", conflict_types)

            # Sprawdź czy raport powstał na dysku
            report_path = os.path.join(dist_dir, inst, "reports", "conflicts.json")
            self.assertTrue(os.path.exists(report_path))

            # Sprawdź czy w WN wstrzyknięto obce zajęcia do Auli
            with open(os.path.join(wn_data, "cross_reference.json"), "r", encoding="utf-8") as f:
                updated_wn = json.load(f)
            aula_pon = updated_wn["rooms"]["Aula"]["PON"]
            self.assertEqual(len(aula_pon), 2)
            foreign_item = next(item for item in aula_pon if item.get("foreign_booking"))
            self.assertEqual(foreign_item["source_faculty"], "WM")
            self.assertTrue(foreign_item["subject"].startswith("[WM]"))

        finally:
            shutil.rmtree(td, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
