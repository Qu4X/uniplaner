"""
tests/test_agh_wtk_adapter.py — Testy jednostkowe adaptera AGH WTK (Space Technologies).
"""
import unittest
from unittest.mock import patch, MagicMock
from sources.agh.wtk.adapter import (
    parse_unitime_csv,
    clean_subject_name,
    is_hideable_lesson,
    determine_row_semester,
    is_matching_track,
    AghWtkSource,
    GROUPS_SEM0,
    GROUPS_SEM2
)


SAMPLE_CSV = """\"Nazwa\",\"Grupa\",\"Typ\",\"Tytuł\",\"Uwaga\",\"Dzień tygodnia\",\"Pierwszy dzień\",\"Ostatni dzień\",\"Ogłoszony początek\",\"Ogłoszony koniec\",\"Miejsce\",\"Pojemność\",\"Prowadzący / Odpowiedzialny\",\"E-mail\",\"Żądane usługi\",\"Zatwierdzony\",
\"TK-SPT-2 BoE (1rok)[sem0]\",\"1\",\"Wykład\",\"Basics of electronics (1rok)[sem0]\",,\"Pn\",\"05.10.2026\",\"19.10.2026\",\"08:00\",\"09:30\",\"D-12 1.08-1.11\",\"50\",\"prof. dr hab. Jan Kowalski\",\"kowalski@agh.edu.pl\",,\"23.09.2026\",
\"TK-SPT-2 SE2 (2rok)[sem2]\",\"1\",\"Zajęcia seminaryjne\",\"Space engineering II (2rok)[sem2]\",,\"Pn\",\"05.10.2026\",,\"13:15\",\"14:45\",\"C-6 501\",\"30\",\"dr inż. Adam Nowak\",\"nowak@agh.edu.pl\",,\"23.09.2026\",
\"TK-SPT-2 SE2 (2rok)[sem2]\",\"1a\",\"Zajęcia seminaryjne\",\"Space engineering II (2rok)[sem2]\",,\"Pn\",\"25.01.2027\",,\"13:15\",\"14:00\",\"C-6 501\",\"30\",\"dr inż. Adam Nowak\",\"nowak@agh.edu.pl\",,\"23.09.2026\",
\"TK-SPT-2 SE2 (2rok)[sem2]\",\"2\",\"Zajęcia seminaryjne\",\"Space engineering II (2rok)[sem2]\",,\"Pn\",\"12.10.2026\",,\"13:15\",\"14:45\",\"C-6 501\",\"30\",\"dr inż. Adam Nowak\",\"nowak@agh.edu.pl\",,\"23.09.2026\",
\"TK-SPT-2 Aero (2rok)[2sem][OB Upstream]\",\"3\",\"CWL\",\"Aerodynamics and Aeroelasticity (2rok)[2sem][OB Upstream]\",,\"Śr\",\"07.10.2026\",\"21.10.2026\",\"09:45\",\"12:00\",\"D-3 1.11B\",\"20\",\"dr hab. inż. Piotr Wiśniewski\",\"wisniewski@agh.edu.pl\",,\"23.09.2026\",
\"TK-SPT-2 Bio (2rok)[2sem][OB Biomedical]\",\"1\",\"Wykład\",\"Bioastronautics (2rok)[2sem][OB Biomedical]\",,\"Wt\",\"27.10.2026\",,\"16:45\",\"18:15\",\"D-3 2.15\",\"30\",\"dr Jan Lekarz\",,,\"23.09.2026\",
\"TK-SPT-2 ML (2rok)[2sem][OB Downstream]\",\"1\",\"Wykład\",\"Machine Learning for space applications (2rok)[2sem][OB Downstream]\",,\"Cz\",\"08.10.2026\",,\"15:00\",\"16:30\",\"C-6 501\",\"40\",\"dr Informatyk\",,,\"23.09.2026\",
\"TK-SPT-2 GR (2rok)[2sem][EG]\",\"1\",\"Wykład\",\"General Relativity and Space Applications (2rok)[2sem][EG]\",,\"Pt\",\"09.10.2026\",,\"08:00\",\"09:30\",\"D-12 1.08\",\"50\",\"prof. Fizyk\",,,\"23.09.2026\",
\"TK-SPT-2 SJO\",\"941\",\"Lektorat\",\"SJO English for Space Technology C1\",,\"Śr\",\"07.10.2026\",,\"11:30\",\"13:00\",\"C-7 3.10\",\"25\",\"mgr Anna Lewandowska\",\"lewandowska@agh.edu.pl\",,\"23.09.2026\",
\"TK-SPT-2 SJO\",\"940\",\"Lektorat\",\"SJO TK_EfE(0sem)English for engineering (0 sem)\",,\"Cz\",\"08.10.2026\",,\"11:30\",\"13:00\",\"C-7 3.10\",\"25\",\"mgr Anna Lewandowska\",\"lewandowska@agh.edu.pl\",,\"23.09.2026\",
\"TK-SPT-2 Unscheduled\",\"1\",\"Zajęcia terenowe\",\"Space field research\",,\"\",\"\",,\"\",\"\",\"Terenowa\",\"100\",\"dr Ekspert\",,,\"nie zatwierdzone\",
"""


class TestAghWtkAdapter(unittest.TestCase):

    def test_determine_row_semester(self):
        self.assertEqual(determine_row_semester("Basics of electronics (1rok)[sem0]", "TK-SPT-2 BoE"), 0)
        self.assertEqual(determine_row_semester("SJO TK_EfE(0sem)English for engineering (0 sem)", "SJO"), 0)
        self.assertEqual(determine_row_semester("Space engineering II (2rok)[sem2]", "TK-SPT-2 SE2"), 2)
        self.assertEqual(determine_row_semester("Aerodynamics (2rok)[2sem][OB Upstream]", "TK-SPT-2 Aero"), 2)

    def test_is_matching_track(self):
        up_sub = "Aerodynamics and Aeroelasticity [OB Upstream]"
        down_sub = "Machine Learning [OB Downstream]"
        bio_sub = "Bioastronautics [OB Biomedical]"
        eg_sub = "General Relativity [EG]"
        common_sub = "Space engineering II"

        # Upstream track
        self.assertTrue(is_matching_track(up_sub, "upstream"))
        self.assertTrue(is_matching_track(common_sub, "upstream"))
        self.assertTrue(is_matching_track(eg_sub, "upstream"))
        self.assertFalse(is_matching_track(down_sub, "upstream"))
        self.assertFalse(is_matching_track(bio_sub, "upstream"))

        # Downstream track
        self.assertTrue(is_matching_track(down_sub, "downstream"))
        self.assertTrue(is_matching_track(common_sub, "downstream"))
        self.assertFalse(is_matching_track(up_sub, "downstream"))
        self.assertFalse(is_matching_track(bio_sub, "downstream"))

        # Biomedical track
        self.assertTrue(is_matching_track(bio_sub, "biomedical"))
        self.assertTrue(is_matching_track(common_sub, "biomedical"))
        self.assertFalse(is_matching_track(up_sub, "biomedical"))
        self.assertFalse(is_matching_track(down_sub, "biomedical"))

        # All tracks
        self.assertTrue(is_matching_track(up_sub, "all"))
        self.assertTrue(is_matching_track(down_sub, "all"))
        self.assertTrue(is_matching_track(bio_sub, "all"))

    def test_clean_subject_name(self):
        raw = "Human Spaceflight: Medical and Technological Challenges (2rok)[2sem][OB Biomedical]"
        cleaned = clean_subject_name(raw)
        self.assertEqual(cleaned, "Human Spaceflight: Medical and Technological Challenges [OB Biomedical]")

        raw_sem = "Space Mission - Risk, Sustainability and Supply Chain Optimization (2rok)[sem2]"
        cleaned_sem = clean_subject_name(raw_sem)
        self.assertEqual(cleaned_sem, "Space Mission - Risk, Sustainability and Supply Chain Optimization")

        raw_sem0 = "SJO TK_EfE(0sem)English for engineering (0 sem)"
        cleaned_sem0 = clean_subject_name(raw_sem0)
        self.assertNotIn("(0sem)", cleaned_sem0)
        self.assertNotIn("(0 sem)", cleaned_sem0)

    def test_is_hideable_lesson(self):
        # W widoku ogólnym (all) wszystkie specjalności są hideable
        self.assertTrue(is_hideable_lesson("Aerodynamics [OB Upstream]", "CWL", target_track="all"))
        # W widoku dedykowanej ścieżki jej przedmioty są obowiązkowe (nie hideable)
        self.assertFalse(is_hideable_lesson("Aerodynamics [OB Upstream]", "CWL", target_track="upstream"))
        # Fakultety ogólne i lektoraty zawsze są hideable
        self.assertTrue(is_hideable_lesson("General Relativity [EG]", "Wykład", target_track="upstream"))
        self.assertTrue(is_hideable_lesson("SJO English C1", "Lektorat", target_track="upstream"))
        self.assertFalse(is_hideable_lesson("Space engineering II", "Zajęcia seminaryjne", target_track="upstream"))

    def test_parse_unitime_csv_sem2_upstream(self):
        schedules = parse_unitime_csv(SAMPLE_CSV, target_semester=2, target_track="upstream")

        self.assertEqual(set(schedules.keys()), set(GROUPS_SEM2))

        # Powinny być obecne przedmioty wspólne i Upstream
        all_upstream_lessons = [l for g in GROUPS_SEM2 for l in schedules[g]]
        self.assertTrue(any("Aerodynamics" in l.subject for l in all_upstream_lessons))
        self.assertTrue(any("Space engineering" in l.subject for l in all_upstream_lessons))
        self.assertTrue(any("General Relativity" in l.subject for l in all_upstream_lessons))

        # NIE powinno być przedmiotów z Downstream, Biomedical ani Semestru 0
        self.assertFalse(any("Bioastronautics" in l.subject for l in all_upstream_lessons))
        self.assertFalse(any("Machine Learning" in l.subject for l in all_upstream_lessons))
        self.assertFalse(any("Basics of electronics" in l.subject for l in all_upstream_lessons))

        # W planie Upstream przedmiot Aerodynamics jest obowiązkowy (hideable=False)
        g3_labs = [l for l in schedules["Grupa 3"] if "Aerodynamics" in l.subject]
        self.assertEqual(len(g3_labs), 1)
        self.assertFalse(g3_labs[0].hideable)

        # Przedmiot [EG] jest do wyboru (hideable=True)
        eg_lessons = [l for l in schedules["Grupa 1"] if "General Relativity" in l.subject]
        self.assertEqual(len(eg_lessons), 1)
        self.assertTrue(eg_lessons[0].hideable)

    def test_parse_unitime_csv_sem0(self):
        schedules = parse_unitime_csv(SAMPLE_CSV, target_semester=0)

        self.assertEqual(set(schedules.keys()), set(GROUPS_SEM0))

        # Wykład Basics of electronics powinien trafić do Grupy 1 i Grupy 2
        for g in GROUPS_SEM0:
            lectures = [l for l in schedules[g] if l.form == "lecture"]
            self.assertEqual(len(lectures), 1)
            self.assertEqual(lectures[0].subject, "Basics of electronics")

        # Nie powinno być przedmiotów z semestru 2
        all_sem0_lessons = [l for g in GROUPS_SEM0 for l in schedules[g]]
        self.assertFalse(any("Space engineering" in l.subject for l in all_sem0_lessons))
        self.assertFalse(any("Aerodynamics" in l.subject for l in all_sem0_lessons))

    def test_discover_metadata(self):
        source = AghWtkSource()
        with patch("requests.head") as mock_head:
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.headers = {"Last-Modified": "Wed, 21 Oct 2026 00:00:00 GMT"}
            mock_head.return_value = mock_resp

            plans = source.discover()
            self.assertEqual(len(plans), 5)

            plan_ids = [p.id for p in plans]
            self.assertIn("agh_wtk_spt_sem0", plan_ids)
            self.assertIn("agh_wtk_spt_sem2_upstream", plan_ids)
            self.assertIn("agh_wtk_spt_sem2_downstream", plan_ids)
            self.assertIn("agh_wtk_spt_sem2_biomedical", plan_ids)
            self.assertIn("agh_wtk_spt_sem2_all", plan_ids)


if __name__ == "__main__":
    unittest.main()
