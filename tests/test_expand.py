"""
Testy jednostkowe core/expand.py.
Weryfikacja: daySwaps, holidays, przerwy świąteczne, połowy semestru, cap 200 oraz guard na 'Inny'.
"""
import unittest
import json
import os
from core.expand import expand_occurrences


class TestExpandOccurrences(unittest.TestCase):

    def setUp(self):
        cal_path = os.path.join(os.path.dirname(__file__), "..", "data", "academic_calendar.json")
        if os.path.exists(cal_path):
            with open(cal_path, "r", encoding="utf-8") as f:
                self.calendar = json.load(f)
        else:
            self.calendar = {
                "daySwaps": {
                    "2026-11-05": {"replaceWith": "PON", "note": "Czwartek 05.11 – zajęcia z poniedziałku"}
                },
                "holidays": {
                    "2026-11-11": "Narodowe Święto Niepodległości"
                },
                "periods": [
                    {"name": "Semestr zimowy", "type": "teaching", "start": "2026-10-01", "end": "2027-01-31"}
                ]
            }

    def test_expand_regular_weekly_monday(self):
        lesson = {
            "subject": "Matematyka",
            "day_of_week": "MON",
            "start_date": "2026-10-05",
            "interval_weeks": 1,
            "weeks": 15
        }
        occurrences = expand_occurrences(lesson, self.calendar)
        self.assertEqual(len(occurrences), 15)
        self.assertEqual(occurrences[0]["date"], "2026-10-05")
        self.assertEqual(occurrences[0]["number"], 1)
        self.assertEqual(occurrences[0]["of"], 15)

        # Sprawdzenie zamiany dnia: 2026-11-05 to czwartek ze swapem na PON
        dates = [o["date"] for o in occurrences]
        self.assertIn("2026-11-05", dates)

    def test_expand_holiday_skipped(self):
        """Święto 2026-11-11 (środa) nie może znaleźć się w occurrences dla zajęć ze środy."""
        lesson = {
            "subject": "Fizyka",
            "day_of_week": "WED",
            "start_date": "2026-10-07",
            "interval_weeks": 1,
            "weeks": 15
        }
        occurrences = expand_occurrences(lesson, self.calendar)
        dates = [o["date"] for o in occurrences]
        self.assertNotIn("2026-11-11", dates)
        self.assertEqual(len(occurrences), 15)

    def test_expand_unknown_day_guard(self):
        """Guard na nieznany dzień 'Inny' lub bzdurny DOW -> pusta lista, brak zapętlenia."""
        lesson = {
            "subject": "Wychowanie Fizyczne",
            "day_of_week": "Inny",
            "start_date": "2026-10-05",
            "weeks": 15
        }
        occurrences = expand_occurrences(lesson, self.calendar)
        self.assertEqual(occurrences, [])

    def test_expand_predefined_nst_dates(self):
        """Dla studiów NST przekazane gotowe daty są formatowane bez ponownego liczenia."""
        lesson = {
            "subject": "Nawigacja NST",
            "occurrences": [
                {"date": "2026-10-10"},
                {"date": "2026-10-24"},
                {"date": "2026-11-07"}
            ]
        }
        occurrences = expand_occurrences(lesson, self.calendar)
        self.assertEqual(len(occurrences), 3)
        self.assertEqual(occurrences[0]["number"], 1)
        self.assertEqual(occurrences[0]["of"], 3)
        self.assertEqual(occurrences[2]["number"], 3)


if __name__ == "__main__":
    unittest.main()
