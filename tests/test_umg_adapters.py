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

    def test_n102_and_n306_simulator_override(self):
        """Wszystkie zajęcia w salach N102 i N306 na UMG WN są klasyfikowane jako symulator."""
        from sources.umg.wn.arktur_html import classify_lesson_form, load_forms_manual, load_curriculum_forms
        from sources.umg.wn.nst_parser import _extract_lesson_details

        forms_cfg = load_forms_manual()
        curr_cat = load_curriculum_forms()

        for room in ("N102", "n102", "102", "N306", "n306", "306", "N-102", "N-306", "sala N102", "sala N306"):
            lesson = {
                "przedmiot": "Nawigacja",
                "raw_przedmiot": "Naw",
                "sala": room,
                "colspan": 1
            }
            form_classified = classify_lesson_form(lesson, "Transport Morski sem. 3", curr_cat, forms_cfg)
            self.assertEqual(form_classified, "symulator", f"Sala {room} powinna być symulatorem w classify_lesson_form")

        # Test parsera NST
        parsed_n102 = _extract_lesson_details("Nawigacja dr Kowalski N102", fallback_room="", time_range="08:00 - 09:30", day_name="Sobota", date_iso="2026-11-21", group_name="GR.01")
        self.assertIsNotNone(parsed_n102)
        self.assertEqual(parsed_n102["forma"], "symulator", "Zajęcia w N102 w NST powinny mieć formę symulator")

        parsed_n306 = _extract_lesson_details("Manewrowanie ĆW prof Nowak N306", fallback_room="", time_range="08:00 - 09:30", day_name="Sobota", date_iso="2026-11-21", group_name="GR.01")
        self.assertIsNotNone(parsed_n306)
        self.assertEqual(parsed_n306["forma"], "symulator", "Zajęcia w N306 w NST powinny mieć formę symulator mimo oznaczenia ĆW")

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
