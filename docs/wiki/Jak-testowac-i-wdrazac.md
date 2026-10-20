# Jak testować i wdrażać adapter (Testing & Quality Gates) 🧪

Jakość i stabilność to filary platformy **Uniplaner**. Każda zmiana i każdy nowy adapter przechodzi przez rygorystyczny zestaw testów automatycznych, zapobiegający awariom w produkcji.

Ten poradnik wyjaśnia, jak napisać test jednostkowy dla Twojej nowej wtyczki oraz jak poprawnie otworzyć Pull Request.

---

## 1. Dlaczego test jednostkowy z fixture'em jest kluczowy?

Strony i pliki uczelniane mogą z dnia na dzień zmienić strukturę lub przestać odpowiadać z powodu awarii serwera uczelni.

Aby testy nie zależały od dostępu do internetu ani od działania serwerów uczelni w trakcie kompilacji w CI (GitHub Actions), tworzymy tzw. **hermetyczny test jednostkowy na pliku testowym (fixture)**.

---

## 2. Przygotowanie pliku fixture

1. Pobierz przykładowy plik z planem z Twojej uczelni (np. jedną stronę HTML, jeden arkusz `.xlsx` lub fragment odpowiedzi JSON).
2. Zapisz go w katalogu:  
   📁 `tests/fixtures/<twoja_uczelnia>_sample.<ext>`

---

## 3. Przykładowy test w Pythonie

Utwórz plik testowy: `tests/test_<twoja_uczelnia>_adapter.py`:

```python
import os
import unittest
from sources.pw.mini.adapter import MyFacultyScheduleSource

class TestMyFacultyAdapter(unittest.TestCase):

    def setUp(self):
        # Ścieżka do zapisanego pliku fixture
        self.fixture_path = os.path.join(
            os.path.dirname(__file__), "fixtures", "pw_mini_sample.html"
        )

    def test_discover_returns_valid_plans(self):
        source = MyFacultyScheduleSource()
        plans = source.discover()
        
        self.assertTrue(len(plans) > 0, "Metoda discover() powinna zwrócić co najmniej jeden plan")
        first_plan = plans[0]
        self.assertEqual(first_plan.institution, "PW")
        self.assertEqual(first_plan.faculty, "MiNI")
        self.assertTrue(len(first_plan.groups) > 0)

    def test_fetch_schedule_maps_lessons_correctly(self):
        source = MyFacultyScheduleSource()
        
        # Testujemy parsowanie z lokalnego pliku fixture:
        with open(self.fixture_path, "r", encoding="utf-8") as f:
            sample_content = f.read()

        schedule = source.fetch_schedule("inf_s1", raw_content=sample_content)
        
        self.assertIn("GR 1", schedule, "Harmonogram powinien zawierać grupę 'GR 1'")
        lessons = schedule["GR 1"]
        self.assertTrue(len(lessons) > 0, "Grupa 1 powinna mieć sparsowane zajęcia")
        
        first_lesson = lessons[0]
        # Sprawdzamy kluczowe atrybuty Kontraktu v1:
        self.assertTrue(hasattr(first_lesson, "subject"))
        self.assertTrue(hasattr(first_lesson, "start_time"))
        self.assertTrue(hasattr(first_lesson, "end_time"))
        self.assertTrue(first_lesson.duration_minutes > 0)
        self.assertIn(first_lesson.form, [
            "lecture", "exercise", "lab", "simulator", "project", "seminar", "clinic", "elective", "other"
        ])

if __name__ == "__main__":
    unittest.main()
```

---

## 4. Uruchomienie zestawu testów lokalnie

Przed zgłoszeniem zmian uruchom wszystkie testy platformy:

```powershell
# 1. Testy modułowe Pythona (Twój nowy test zostanie automatycznie wykryty):
python -m unittest discover -s tests -p "test_*.py"

# 2. Testy regresyjne platformy:
python tests/test_backend.py

# 3. Testy frontendu (silnik spotkań, kalendarz, moduły):
npm test
```

Wszystkie testy muszą zakończyć się statusem **OK / PASS** (zielone).

---

## 5. Jak otworzyć Pull Request?

1. **Sformatuj commity zgodnie z [Conventional Commits](https://www.conventionalcommits.org/)**:
   ```
   feat(adapter): add timetable parser for PW MiNI
   test(adapter): add unit tests and fixtures for PW MiNI
   ```
2. **Wypchnij zmiany na swoją gałąź na GitHubie**:
   ```bash
   git checkout -b feat/add-pw-mini-adapter
   git push origin feat/add-pw-mini-adapter
   ```
3. **Otwórz Pull Request do `Qu4X/uniplaner` (gałąź `main`)**:
   - W opisie wklej link do oficjalnej strony z planami Twojej uczelni.
   - Załącz zrzut ekranu z lokalnego podglądu `http://localhost:8080`.
   - Automatyczny pipeline GitHub Actions uruchomi testy i po krótkim review wtyczka zostanie dołączona do oficjalnej platformy!
