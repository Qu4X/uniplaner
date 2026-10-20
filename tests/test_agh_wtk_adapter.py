"""
tests/test_agh_wtk_adapter.py — Testy jednostkowe adaptera AGH WTK (Space Technologies).
"""
import unittest
from unittest.mock import patch, MagicMock
from sources.agh.wtk.adapter import (
    parse_unitime_csv,
    clean_subject_name,
    is_hideable_lesson,
    AghWtkSource,
    STUDENT_GROUPS
)


SAMPLE_CSV = """\"Nazwa\",\"Grupa\",\"Typ\",\"Tytuł\",\"Uwaga\",\"Dzień tygodnia\",\"Pierwszy dzień\",\"Ostatni dzień\",\"Ogłoszony początek\",\"Ogłoszony koniec\",\"Miejsce\",\"Pojemność\",\"Prowadzący / Odpowiedzialny\",\"E-mail\",\"Żądane usługi\",\"Zatwierdzony\",
\"TK-SPT-2 BoE (1rok)[sem0]\",\"1\",\"Wykład\",\"Basics of electronics (1rok)[sem0]\",,\"Pn\",\"05.10.2026\",\"19.10.2026\",\"08:00\",\"09:30\",\"D-12 1.08-1.11\",\"50\",\"prof. dr hab. Jan Kowalski\",\"kowalski@agh.edu.pl\",,\"23.09.2026\",
\"TK-SPT-2 SE2 (2rok)[sem2]\",\"1\",\"Zajęcia seminaryjne\",\"Space engineering II (2rok)[sem2]\",,\"Pn\",\"05.10.2026\",,\"13:15\",\"14:45\",\"C-6 501\",\"30\",\"dr inż. Adam Nowak\",\"nowak@agh.edu.pl\",,\"23.09.2026\",
\"TK-SPT-2 SE2 (2rok)[sem2]\",\"1a\",\"Zajęcia seminaryjne\",\"Space engineering II (2rok)[sem2]\",,\"Pn\",\"25.01.2027\",,\"13:15\",\"14:00\",\"C-6 501\",\"30\",\"dr inż. Adam Nowak\",\"nowak@agh.edu.pl\",,\"23.09.2026\",
\"TK-SPT-2 SE2 (2rok)[sem2]\",\"2\",\"Zajęcia seminaryjne\",\"Space engineering II (2rok)[sem2]\",,\"Pn\",\"12.10.2026\",,\"13:15\",\"14:45\",\"C-6 501\",\"30\",\"dr inż. Adam Nowak\",\"nowak@agh.edu.pl\",,\"23.09.2026\",
\"TK-SPT-2 Aero (2rok)[2sem][OB Upstream]\",\"3\",\"CWL\",\"Aerodynamics and Aeroelasticity (2rok)[2sem][OB Upstream]\",,\"Śr\",\"07.10.2026\",\"21.10.2026\",\"09:45\",\"12:00\",\"D-3 1.11B\",\"20\",\"dr hab. inż. Piotr Wiśniewski\",\"wisniewski@agh.edu.pl\",,\"23.09.2026\",
\"TK-SPT-2 SJO\",\"941\",\"Lektorat\",\"SJO English for Space Technology C1\",,\"Śr\",\"07.10.2026\",,\"11:30\",\"13:00\",\"C-7 3.10\",\"25\",\"mgr Anna Lewandowska\",\"lewandowska@agh.edu.pl\",,\"23.09.2026\",
\"TK-SPT-2 Unscheduled\",\"1\",\"Zajęcia terenowe\",\"Space field research\",,\"\",\"\",,\"\",\"\",\"Terenowa\",\"100\",\"dr Ekspert\",,,\"nie zatwierdzone\",
"""


class TestAghWtkAdapter(unittest.TestCase):

    def test_clean_subject_name(self):
        raw = "Human Spaceflight: Medical and Technological Challenges (2rok)[2sem][OB Biomedical]"
        cleaned = clean_subject_name(raw)
        self.assertEqual(cleaned, "Human Spaceflight: Medical and Technological Challenges [OB Biomedical]")

        raw_sem = "Space Mission - Risk, Sustainability and Supply Chain Optimization (2rok)[sem2]"
        cleaned_sem = clean_subject_name(raw_sem)
        self.assertEqual(cleaned_sem, "Space Mission - Risk, Sustainability and Supply Chain Optimization")

    def test_is_hideable_lesson(self):
        self.assertTrue(is_hideable_lesson("Aerodynamics [OB Upstream]", "CWL"))
        self.assertTrue(is_hideable_lesson("Human Spaceflight [OB Biomedical]", "Wykład"))
        self.assertTrue(is_hideable_lesson("SJO English C1", "Lektorat"))
        self.assertFalse(is_hideable_lesson("Space engineering II", "Zajęcia seminaryjne"))

    def test_parse_unitime_csv(self):
        schedules = parse_unitime_csv(SAMPLE_CSV)

        # Powinny być dokładnie 4 grupy
        self.assertEqual(set(schedules.keys()), set(STUDENT_GROUPS))

        # 1. Wykład powinien trafić do wszystkich grup
        for g in STUDENT_GROUPS:
            lectures = [l for l in schedules[g] if l.form == "lecture"]
            self.assertTrue(len(lectures) >= 1)
            self.assertEqual(lectures[0].subject, "Basics of electronics")
            self.assertEqual(lectures[0].start_time, "08:00")
            self.assertEqual(lectures[0].end_time, "09:30")
            self.assertEqual(lectures[0].duration_minutes, 90)
            # 05.10.2026 do 19.10.2026 co tydzień = 3 wystąpienia
            self.assertEqual(len(lectures[0].occurrences), 3)
            self.assertEqual(lectures[0].occurrences[0]["date"], "2026-10-05")
            self.assertEqual(lectures[0].occurrences[2]["date"], "2026-10-19")

        # 2. Zajęcia grupy 1 i podgrupy 1a powinny trafić do Grupy 1
        g1_seminars = [l for l in schedules["Grupa 1"] if l.form == "seminar"]
        self.assertEqual(len(g1_seminars), 2)
        # Jedno spotkanie regularne + jedno spotkanie 1a
        dates_g1 = [occ["date"] for s in g1_seminars for occ in s.occurrences]
        self.assertIn("2026-10-05", dates_g1)
        self.assertIn("2027-01-25", dates_g1)

        # Grupa 2 nie powinna mieć seminarium grupy 1
        g2_seminars = [l for l in schedules["Grupa 2"] if l.form == "seminar"]
        dates_g2 = [occ["date"] for s in g2_seminars for occ in s.occurrences]
        self.assertIn("2026-10-12", dates_g2)
        self.assertNotIn("2026-10-05", dates_g2)

        # 3. Zajęcia grupy 3 (CWL) powinny trafić do Grupy 3
        g3_labs = [l for l in schedules["Grupa 3"] if l.form == "lab"]
        self.assertEqual(len(g3_labs), 1)
        self.assertTrue(g3_labs[0].hideable)
        self.assertEqual(g3_labs[0].occurrences[0]["date"], "2026-10-07")
        self.assertEqual(g3_labs[0].occurrences[2]["date"], "2026-10-21")

        # 4. Lektorat SJO (grupa 941) powinien być dostępny we wszystkich grupach jako hideable
        for g in STUDENT_GROUPS:
            lektoraty = [l for l in schedules[g] if "English" in l.subject]
            self.assertEqual(len(lektoraty), 1)
            self.assertTrue(lektoraty[0].hideable)

        # 5. Nieplanowane wiersze (Unscheduled) powinny być pominięte
        all_lessons = [l for g in STUDENT_GROUPS for l in schedules[g]]
        self.assertFalse(any("Unscheduled" in l.subject for l in all_lessons))

    def test_discover_metadata(self):
        source = AghWtkSource()
        with patch("requests.head") as mock_head:
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.headers = {"Last-Modified": "Wed, 21 Oct 2026 00:00:00 GMT"}
            mock_head.return_value = mock_resp

            plans = source.discover()
            self.assertEqual(len(plans), 1)
            p = plans[0]
            self.assertEqual(p.id, "agh_wtk_spt_2")
            self.assertEqual(p.institution, "AGH")
            self.assertEqual(p.faculty, "WTK")
            self.assertEqual(p.groups, STUDENT_GROUPS)
            self.assertEqual(p.study_mode, "full_time")


if __name__ == "__main__":
    unittest.main()
