# Specyfikacja danych harmonogramu (v1) 📋

**Specyfikacja danych harmonogramu (v1)** to ujednolicony format danych harmonogramu zajęć obowiązujący w całej platformie **Uniplaner**.

Dzięki tej specyfikacji uniwersalny frontend PWA (`web/`) oraz generator subskrypcji kalendarza ICS (`core/ics.py`) obsługują plany w ten sam deterministyczny sposób, niezależnie od tego, czy źródłem danych był HTML dziekanatu, arkusz Excel z SharePointa, czy plik PDF.

---

## 1. Dwa modele wejściowe adaptera

Wtyczka w Pythonie (`sources/<uczelnia>/<wydzial>/`) operuje wyłącznie na dwóch modelach z modułu `sources.base`:

1. **`PlanMetadata`** — metadane pojedynczego planu studiów (zwracane przez `discover()`).
2. **`RawLesson`** — pojedyncza jednostka zajęć dydaktycznych (zwracana przez `fetch_schedule()`).

---

## 2. Model `PlanMetadata`

Zwracany przez metodę `discover()` Twojego adaptera. Reprezentuje podstawowe informacje o kierunku, roczniku i stopniu studiów:

| Pole | Typ | Wymagane? | Domyślnie | Opis i przykład |
| :--- | :---: | :---: | :---: | :--- |
| `id` | `str` | **TAK** | — | Unikalny identyfikator planu w ramach tenanta (np. `"inf_s1"`, `"wet_rok2"`) |
| `name` | `str` | **TAK** | — | Czytelna nazwa dla studenta (np. `"Informatyka sem. 1"`) |
| `institution` | `str` | **TAK** | — | Skrót uczelni (np. `"PW"`, `"UMG"`, `"SGGW"`) |
| `faculty` | `str` | **TAK** | — | Skrót lub nazwa wydziału (np. `"MiNI"`, `"WN"`, `"WMW"`) |
| `study_mode` | `str` | **TAK** | — | Tryb studiów: `"full_time"` (stacjonarne) lub `"part_time"` (niestacjonarne) |
| `groups` | `List[str]` | **TAK** | `[]` | Lista dostępnych grup w planie (np. `["GR 1", "GR 2"]`) |
| `semester_number` | `Optional[int]` | Nie | `None` | Numer semestru (np. `1`, `3`). Pomaga w dopasowaniu semestru letniego/zimowego |
| `version_token` | `str` | Nie | `""` | Znacznik wersji zapobiegający zbędnemu ponownemu pobieraniu (np. hash lub data modyfikacji) |
| `version` | `Optional[str]` | Nie | `None` | Czytelna wersja planu z systemu dziekanatu (np. `"wer. 3"`) |
| `published_at` | `Optional[str]` | Nie | `None` | Data publikacji planu przez dziekanat (`"YYYY-MM-DD HH:MM"`) |
| `archived` | `bool` | Nie | `False` | Flaga oznaczająca archiwalny plan studiów |

---

## 3. Model `RawLesson`

Zwracany przez metodę `fetch_schedule(plan_id)` dla każdej grupy:

```python
from sources.base import RawLesson

lesson = RawLesson(
    # --- Dane podstawowe ---
    subject="Programowanie Obiektowe",
    raw_subject="POB",               # Oryginalny skrót z systemu uczelni
    start_time="10:15",              # Format HH:MM (24-godzinny)
    end_time="11:45",                # Format HH:MM (24-godzinny)
    duration_minutes=90,             # Czas trwania w minutach
    teacher="prof. dr hab. Adam Nowak",
    room="C-204",                    # Numer lub nazwa sali
    form="lab",                      # lecture | exercise | lab | simulator | clinic | project | seminar | elective | other
    remote=False,                    # Czy zajęcia są zdalne (online)
    hideable=True,                   # Czy student może ukryć te zajęcia w UI (np. fakultet)
    groups=["GR 1"],                 # Grupy przypisane do tych zajęć

    # --- Reguły terminów i cykli (Studia stacjonarne) ---
    day_of_week="TUE",               # MON | TUE | WED | THU | FRI | SAT | SUN
    start_date="2026-10-01",         # Data pierwszego możliwego spotkania w semestrze (YYYY-MM-DD)
    interval_weeks=1,                # 1 = co tydzień, 2 = co dwa tygodnie
    start_week=1,                    # 1 = tydzień nieparzysty (A), 2 = tydzień parzysty (B)
    half_semester=None,              # 1 = tylko I połowa, 2 = tylko II połowa, None = cały semestr
    weeks=15,                        # Planowana łączna liczba tygodni semestru

    # --- Tryb zjazdowy / nieregularny (Studia niestacjonarne) ---
    occurrences=None                 # Jawna lista dat, jeśli plan podaje konkretne terminy zjazdów
)
```

---

## 4. Pola cykli i terminów w `RawLesson`

Oto szczegółowy opis pól sterujących terminami zajęć:

| Pole | Typ | Domyślnie | Zastosowanie |
| :--- | :---: | :---: | :--- |
| `day_of_week` | `Optional[str]` | `None` | Dzień tygodnia: `"MON"`, `"TUE"`, `"WED"`, `"THU"`, `"FRI"`, `"SAT"`, `"SUN"`. |
| `start_date` | `Optional[str]` | `None` | Data inauguracji semestru lub pierwszych możliwych zajęć (`"YYYY-MM-DD"`). Jeśli puste, silnik pobiera datę z `academic_calendar.json`. |
| `interval_weeks` | `int` | `1` | Częstotliwość spotkań: `1` oznacza zajęcia cotygodniowe; `2` oznacza zajęcia co dwa tygodnie. |
| `start_week` | `int` | `1` | W którym tygodniu cyklu ruszają zajęcia: `1` dla tygodni nieparzystych (tydzień A), `2` dla tygodni parzystych (tydzień B). |
| `half_semester` | `Optional[int]` | `None` | Połówka semestru: `1` dla I połowy; `2` dla II połowy; `None` dla całego semestru. Granicę definiuje `half_boundaries` w kalendarzu. |
| `weeks` | `int` | `15` | Liczba planowanych tygodni dydaktycznych w semestrze (zazwyczaj 15). |
| `occurrences` | `Optional[List[Dict]]` | `None` | Jawna lista dat zjazdów dla planów nieregularnych. Gdy jest podana, silnik pomija pętlę tygodniową. |

---

## 5. Dwa tryby działania: Siatka tygodniowa vs Terminy zjazdowe

### Tryb A: Regularna siatka tygodniowa (Studia stacjonarne)
Gdy zajęcia odbywają się w stały dzień tygodnia:
1. Ustawiasz `day_of_week="MON"` (odpowiednio `TUE`, `WED`, `THU`, `FRI`).
2. Pole `occurrences` pozostawiasz jako `None`.
3. Jeśli zajęcia odbywają się co dwa tygodnie lub w połówce semestru, konfigurujesz odpowiednie parametry:

```python
# Przykład 1: Laboratorium co 2 tygodnie w tygodniach nieparzystych (Tydzień A)
RawLesson(
    subject="Fizyka - Lab",
    day_of_week="THU",
    interval_weeks=2,
    start_week=1,
    ...
)

# Przykład 2: Laboratorium co 2 tygodnie w tygodniach parzystych (Tydzień B)
RawLesson(
    subject="Chemia - Lab",
    day_of_week="THU",
    interval_weeks=2,
    start_week=2,
    ...
)

# Przykład 3: Wykład prowadzony tylko w II połowie semestru
RawLesson(
    subject="Prawo Morskie",
    day_of_week="MON",
    half_semester=2,
    ...
)
```

**Co dzieje się automatycznie:** Silnik platformy (`core/expand.py`) na podstawie `academic_calendar.json` wyznacza dokładne daty spotkań z uwzględnieniem dni wolnych, ferii, zamian dni rektorskich oraz granicy połówek semestru (`half_boundaries`).

### Tryb B: Harmonogram konkretnych dat (Studia niestacjonarne / Zjazdy)
Gdy plan nie opiera się na regularnym dniu tygodnia, lecz na konkretnych zjazdach weekendowych lub blokach rotacyjnych:
- Wypełniasz listę `occurrences` z konkretnymi datami ISO:
```python
RawLesson(
    subject="Nawigacja Zintegrowana",
    occurrences=[
        {"date": "2026-10-10", "number": 1, "of": 4},
        {"date": "2026-10-24", "number": 2, "of": 4},
        {"date": "2026-11-14", "number": 3, "of": 4},
        {"date": "2026-12-05", "number": 4, "of": 4}
    ],
    ...
)
```
W tym trybie platforma bezpośrednio przypisuje podane daty bez stosowania zamian rektorskich.

---

## 6. Dopuszczalne formy zajęć (`form`)

Pole `form` decyduje o kolorystyce obramowania karty, filtrach i etykietach w interfejsie PWA:

| Wartość pola `form` | Etykieta w interfejsie | Domyślny kolor | Przeznaczenie |
| :--- | :--- | :--- | :--- |
| `lecture` | Wykład | 🟡 Żółty / Bursztynowy | Wykłady audytoryjne |
| `exercise` | Ćwiczenia | 🔵 Błękitny / Morski | Ćwiczenia tablicowe, lektoraty językowe |
| `lab` | Laboratorium | 🔴 Magenta / Czerwony | Pracownie komputerowe i laboratoryjne |
| `simulator` | Symulator | 🟣 Fioletowy | Symulatory nawigacyjne, lotnicze itp. |
| `clinic` | Klinika | 🟢 Szmaragdowy | Zajęcia kliniczne (weterynaria, medycyna) |
| `project` | Projekt | 🟠 Pomarańczowy | Zajęcia projektowe |
| `seminar` | Seminarium | 🟤 Brązowy | Seminaria dyplomowe i magisterskie |
| `elective` | Fakultet | 🔷 Granatowy / Indigo | Przedmioty obieralne |
| `other` | Inne | ⚪ Szary | Pozostałe formy |

Kolory i etykiety form można personalizować w pliku `config.json` danego tenanta.

---

## 7. Wynikowy model `Lesson` (generowany w `dist/`)

Po przetworzeniu przez silnik kompilacji (`core/build.py`), każda lekcja w pliku harmonogramu grupy (np. `p_gr1.json`) posiada wygenerowaną tablicę `occurrences`:

```json
{
  "id": "mat_1",
  "subject": "Matematyka",
  "start_time": "08:00",
  "end_time": "09:30",
  "duration_minutes": 90,
  "form": "lecture",
  "day_of_week": "MON",
  "occurrences": [
    { "date": "2026-10-05", "number": 1, "of": 15 },
    { "date": "2026-10-12", "number": 2, "of": 15 },
    { "date": "2026-10-19", "number": 3, "of": 15 }
  ]
}
```

Dzięki temu frontend oraz kalendarz ICS nie muszą znać ani interpretować cykli parzystości ani świąt — otrzymują gotowe, zwalidowane daty spotkań.
