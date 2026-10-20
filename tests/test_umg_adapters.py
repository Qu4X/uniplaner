"""
Testy jednostkowe adapterów UMG (arktur_html i arktur_nst) z fixture'ami.
"""
import unittest
import os
from sources.umg.wn.arktur_html import UmgArkturHtmlSource, is_hideable_simulator_lesson
from sources.umg.wn.arktur_nst import UmgArkturNstSource


class TestUmgAdapters(unittest.TestCase):

    def setUp(self):
        self.fixtures_dir = os.path.join(os.path.dirname(__file__), "..", "tests")

    def test_simulator_maneuvering_hideable_detection(self):
        """Podgrupy symulatora manewrowego są hideable, ale wykład ogólny w auli NIE."""
        sim_lesson = {
            "przedmiot": "Manewrowanie statkiem",
            "raw_przedmiot": "MS",
            "sala": "102"
        }
        self.assertTrue(is_hideable_simulator_lesson(sim_lesson))

        lecture_lesson = {
            "przedmiot": "Manewrowanie statkiem",
            "raw_przedmiot": "MS",
            "sala": "Aula"
        }
        self.assertFalse(is_hideable_simulator_lesson(lecture_lesson))

        math_lesson = {
            "przedmiot": "Matematyka",
            "raw_przedmiot": "Mat",
            "sala": "306"
        }
        self.assertFalse(is_hideable_simulator_lesson(math_lesson))

    def test_arktur_html_adapter_mapping_with_fixture(self):
        fixture_path = os.path.join(self.fixtures_dir, "strpza6_response.txt")
        if not os.path.exists(fixture_path):
            self.skipTest("Brak pliku fixture strpza6_response.txt")

        with open(fixture_path, "r", encoding="utf-8") as f:
            html_content = f.read()

        source = UmgArkturHtmlSource()
        res = source.fetch_schedule("556", html_content=html_content, groups_list=["1"])
        self.assertTrue(len(res) > 0, "Powinno zwrócić grupy dla fixture'a")
        first_group = list(res.keys())[0]
        lessons = res[first_group]
        self.assertTrue(len(lessons) > 0)
        first_l = lessons[0]
        self.assertTrue(hasattr(first_l, "subject"))
        self.assertTrue(hasattr(first_l, "start_time"))
        self.assertTrue(hasattr(first_l, "form"))
        self.assertIn(first_l.form, ["lecture", "exercise", "lab", "simulator", "project", "seminar", "elective", "other"])

    def test_arktur_nst_adapter_mapping(self):
        source = UmgArkturNstSource()
        # Mock fetch_schedule via monkeypatching parse_pdf_schedule
        from unittest.mock import patch
        mock_parsed = {
            "GR.01": {
                "2026-11-21": [
                    {
                        "przedmiot": "Podstawy nautyki w transporcie",
                        "raw_przedmiot": "PNT",
                        "prowadzacy": "dr Gil Mateusz",
                        "godziny": "13:30 - 15:55",
                        "sala": "C30",
                        "forma": "laboratorium",
                        "dzien": "Sobota",
                        "data": "2026-11-21",
                        "grupa": "GR.01"
                    }
                ]
            }
        }
        with patch("sources.umg.wn.arktur_nst.parse_pdf_schedule", return_value=mock_parsed):
            with patch("os.path.exists", return_value=True):
                res = source.fetch_schedule("nst_1", pdf_path="dummy.pdf")
                self.assertIn("GR.01", res)
                lessons = res["GR.01"]
                self.assertEqual(len(lessons), 1)
                l = lessons[0]
                self.assertEqual(l.subject, "Podstawy nautyki w transporcie")
                self.assertEqual(l.start_time, "13:30")
                self.assertEqual(l.end_time, "15:55")
                self.assertEqual(l.duration_minutes, 145)
                self.assertEqual(l.form, "lab")
                self.assertEqual(l.room, "C30")
                self.assertEqual(l.day_of_week, "SAT")
                self.assertIsNotNone(l.occurrences)
                self.assertEqual(len(l.occurrences), 1)
                self.assertEqual(l.occurrences[0]["date"], "2026-11-21")


if __name__ == "__main__":
    unittest.main()
