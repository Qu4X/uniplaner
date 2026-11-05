"""
Testy jednostkowe modułu core/normalizer.py
"""
import unittest
from core.normalizer import (
    strip_academic_degrees,
    canonicalize_teacher_name,
    canonicalize_room_name
)


class TestNormalizer(unittest.TestCase):

    def test_strip_academic_degrees(self):
        self.assertEqual(strip_academic_degrees("prof. UMG dr hab. Jan Kowalski, inż."), "Jan Kowalski")
        self.assertEqual(strip_academic_degrees("dr inż. Adam Nowak"), "Adam Nowak")
        self.assertEqual(strip_academic_degrees("mgr Anna Wiśniewska"), "Anna Wiśniewska")
        self.assertEqual(strip_academic_degrees("Kowalski Jan"), "Kowalski Jan")
        self.assertEqual(strip_academic_degrees("dr hab. inż. Janusz Nowak-Kowalski"), "Janusz Nowak-Kowalski")

    def test_canonicalize_teacher_name(self):
        aliases = {
            "Kowalski J.": "Kowalski Jan",
            "J. Kowalski": "Kowalski Jan"
        }
        self.assertEqual(canonicalize_teacher_name("dr Jan Kowalski"), "Jan Kowalski")
        self.assertEqual(canonicalize_teacher_name("Kowalski Jan"), "Kowalski Jan")
        self.assertEqual(canonicalize_teacher_name("Kowalski J.", aliases=aliases), "Kowalski Jan")
        self.assertEqual(canonicalize_teacher_name("dr inż. jan nowak"), "Jan Nowak")
        self.assertEqual(canonicalize_teacher_name("nowak-kowalska anna"), "Nowak-Kowalska Anna")

    def test_canonicalize_room_name(self):
        aliases = {
            "aula": "Aula Główna",
            "basen": "Hala Sportowa - Basen"
        }
        self.assertEqual(canonicalize_room_name("n-102"), "N102")
        self.assertEqual(canonicalize_room_name("N 102"), "N102")
        self.assertEqual(canonicalize_room_name("sala N102"), "N102")
        self.assertEqual(canonicalize_room_name("c-136"), "C136")
        self.assertEqual(canonicalize_room_name("102", default_building_prefix="N"), "N102")
        self.assertEqual(canonicalize_room_name("aula", aliases=aliases), "Aula Główna")
        self.assertEqual(canonicalize_room_name("AULA", aliases=aliases), "Aula Główna")


if __name__ == "__main__":
    unittest.main()
