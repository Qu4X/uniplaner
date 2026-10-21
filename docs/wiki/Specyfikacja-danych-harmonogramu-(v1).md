# Specyfikacja danych harmonogramu (v1)

**Specyfikacja danych harmonogramu (v1)** opisuje ujednolicony format danych obowiązujący w całej platformie **Uniplaner**.

Dzięki niej frontend PWA (`web/`) oraz generator kalendarza ICS (`core/ics.py`) przetwarzają plany w ten sam, deterministyczny sposób, niezależnie od tego, czy źródłem był HTML dziekanatu, arkusz Excel z SharePoint czy plik PDF.

---

## 1. Dwa modele wejściowe adaptera

Adapter (`sources/<uczelnia>/<wydzial>/`) korzysta wyłącznie z dwóch modeli z modułu `sources.base`:

1. **`PlanMetadata`** — metadane pojedynczego planu studiów (zwracane przez `discover()`).
2. **`RawLesson`** — pojedyncza jednostka zajęć dydaktycznych (zwracana przez `fetch_schedule()`).

---

## 2. Model `PlanMetadata`

Zwracany przez metodę `discover()`. Zawiera podstawowe informacje o kierunku, roczniku i stopniu studiów:

| Pole | Typ | Wymagane | Domyślnie | Opis i przykład |
| :--- | :---: | :---: | :---: | :--- |
| `id` | `str` | **Tak** | — | Unikalny identyfikator planu w ramach tenanta (np. `"inf_s1"`, `"wet_rok2"`) |
| `name` | `str` | **Tak** | — | Nazwa czytelna dla studenta (np. `"Informatyka sem. 1"`) |
| `institution` | `str` | **Tak** | — | Skrót uczelni (np. `"PW"`, `"UMG"`, `"SGGW"`) |
| `faculty` | `str` | **Tak** | — | Skrót lub nazwa wydziału (np. `"MiNI"`, `"WN"`, `"WMW"`) |
| `study_mode` | `str` | **Tak** | — | Tryb studiów: `"full_time"` (stacjonarne) lub `"part_time"` (niestacjonarne) |
| `groups` | `List[str]` | **Tak** | `[]` | Lista grup dostępnych w planie (np. `["GR 1", "GR 2"]`) |
| `semester_number` | `Optional[int]` | Nie | `None` | Numer semestru (np. `1`, `3`); ułatwia rozróżnienie semestru letniego i zimowego |
| `version_token` | `str` | Nie | `""` | Znacznik wersji pozwalający uniknąć zbędnego ponownego pobierania (np. skrót pliku lub data modyfikacji) |
| `version` | `Optional[str]` | Nie | `None` | Wersja planu w rozumieniu dziekanatu (np. `"wer. 3"`) |
| `published_at` | `Optional[str]` | Nie | `None` | Data publikacji planu przez dziekanat (`"YYYY-MM-DD HH:MM"`) |
| `archived` | `bool` | Nie | `False` | Oznaczenie planu archiwalnego |

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
    hideable=True,                   # Czy student może ukryć te zajęcia w interfejsie (np. fakultet)
    groups=["GR 1"],                 # Grupy przypisane do tych zajęć

    # --- Reguły terminów i cykli (studia stacjonarne) ---
    day_of_week="TUE",               # MON | TUE | WED | THU | FRI | SAT | SUN
    start_date="2026-10-01",         # Data pierwszego możliwego spotkania w semestrze (YYYY-MM-DD)
    interval_weeks=1,                # 1 = co tydzień, 2 = co dwa tygodnie
    start_week=1,                    # 1 = tydzień nieparzysty (A), 2 = tydzień parzysty (B)
    half_semester=None,              # 1 = tylko I połowa, 2 = tylko II połowa, None = cały semestr
    weeks=15,                        # Planowana łączna liczba tygodni semestru

    # --- Tryb zjazdowy / nieregularny (studia niestacjonarne) ---
    occurrences=None                 # Jawna lista dat, jeśli plan podaje konkretne terminy zjazdów
)
```

---

## 4. Pola cykli i terminów w `RawLesson`

Pola sterujące terminami zajęć:

| Pole | Typ | Domyślnie | Zastosowanie |
| :--- | :---: | :---: | :--- |
| `day_of_week` | `Optional[str]` | `None` | Dzień tygodnia: `"MON"`, `"TUE"`, `"WED"`, `"THU"`, `"FRI"`, `"SAT"`, `"SUN"`. |
| `start_date` | `Optional[str]` | `None` | Data rozpoczęcia semestru lub pierwszych możliwych zajęć (`"YYYY-MM-DD"`). Jeśli pole jest puste, silnik pobiera datę z `academic_calendar.json`. |
| `interval_weeks` | `int` | `1` | Częstotliwość spotkań: `1` — co tydzień, `2` — co dwa tygodnie. |
| `start_week` | `int` | `1` | Tydzień cyklu, w którym zajęcia się zaczynają: `1` — tydzień nieparzysty (A), `2` — tydzień parzysty (B). |
| `half_semester` | `Optional[int]` | `None` | Połowa semestru: `1` — I połowa, `2` — II połowa, `None` — cały semestr. Granicę określa `half_boundaries` w kalendarzu. |
| `weeks` | `int` | `15` | Liczba planowanych tygodni dydaktycznych w semestrze (zazwyczaj 15). |
| `occurrences` | `Optional[List[Dict]]` | `None` | Jawna lista dat zjazdów dla planów nieregularnych. Gdy jest podana, silnik pomija pętlę tygodniową. |

---

## 5. Dwa tryby wyznaczania terminów

### Tryb A: regularna siatka tygodniowa (studia stacjonarne)
Gdy zajęcia odbywają się w stały dzień tygodnia:
1. Ustaw `day_of_week="MON"` (odpowiednio `TUE`, `WED`, `THU`, `FRI`).
2. Pozostaw pole `occurrences` jako `None`.
3. Jeśli zajęcia odbywają się co dwa tygodnie lub tylko w jednej połowie semestru, ustaw odpowiednie parametry:

```python
# Przykład 1: laboratorium co 2 tygodnie w tygodniach nieparzystych (tydzień A)
RawLesson(
    subject="Fizyka - Lab",
    day_of_week="THU",
    interval_weeks=2,
    start_week=1,
    ...
)

# Przykład 2: laboratorium co 2 tygodnie w tygodniach parzystych (tydzień B)
RawLesson(
    subject="Chemia - Lab",
    day_of_week="THU",
    interval_weeks=2,
    start_week=2,
    ...
)

# Przykład 3: wykład prowadzony tylko w II połowie semestru
RawLesson(
    subject="Prawo Morskie",
    day_of_week="MON",
    half_semester=2,
    ...
)
```

**Działanie automatyczne:** silnik platformy (`core/expand.py`) wyznacza na podstawie `academic_calendar.json` dokładne daty spotkań, uwzględniając dni wolne, przerwy dydaktyczne, zamiany dni oraz granicę połów semestru (`half_boundaries`).

### Tryb B: harmonogram konkretnych dat (studia niestacjonarne, zjazdy)
Gdy plan opiera się na zjazdach weekendowych lub blokach rotacyjnych, a nie na stałym dniu tygodnia, wypełnij listę `occurrences` konkretnymi datami w formacie ISO:
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
W tym trybie platforma przypisuje podane daty bezpośrednio, bez stosowania zamian dni.

---

## 6. Dopuszczalne formy zajęć (`form`)

Pole `form` określa kolor obramowania karty, filtry i etykiety w interfejsie:

| Wartość `form` | Etykieta w interfejsie | Domyślny kolor | Przeznaczenie |
| :--- | :--- | :--- | :--- |
| `lecture` | Wykład | Żółty / bursztynowy | Wykłady audytoryjne |
| `exercise` | Ćwiczenia | Błękitny / morski | Ćwiczenia tablicowe, lektoraty językowe |
| `lab` | Laboratorium | Magenta / czerwony | Pracownie komputerowe i laboratoryjne |
| `simulator` | Symulator | Fioletowy | Symulatory nawigacyjne, lotnicze itp. |
| `clinic` | Klinika | Szmaragdowy | Zajęcia kliniczne (weterynaria, medycyna) |
| `project` | Projekt | Pomarańczowy | Zajęcia projektowe |
| `seminar` | Seminarium | Brązowy | Seminaria dyplomowe i magisterskie |
| `elective` | Fakultet | Granatowy / indygo | Przedmioty obieralne |
| `other` | Inne | Szary | Pozostałe formy |

Kolory i etykiety form można zmienić w pliku `config.json` danego tenanta.

---

## 7. Model wynikowy `Lesson` (generowany w `dist/`)

Po przetworzeniu przez kompilator (`core/build.py`) każde zajęcia w pliku harmonogramu grupy (np. `p_gr1.json`) mają wygenerowaną tablicę `occurrences`:

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

Dzięki temu frontend i kalendarz ICS nie muszą interpretować cykli parzystości ani dni wolnych — otrzymują gotowe, zwalidowane daty spotkań.
