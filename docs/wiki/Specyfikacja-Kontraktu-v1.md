# Specyfikacja Kontraktu v1 (Schedule Data Contract) 📋

**Kontrakt v1** to ujednolicony format danych harmonogramu zajęć obowiązujący w całej platformie **Uniplaner**.

Dzięki Kontraktowi v1 uniwersalny frontend PWA (`web/`) oraz generator kalendarzy ICS (`core/ics.py`) mogą obsłużyć dowolny plan zajęć w ten sam deterministyczny sposób, niezależnie od tego, czy źródłem danych był HTML, arkusz Excel z SharePointa, czy plik PDF.

---

## 1. Dwa modele wejściowe

Wtyczka w Pythonie (`sources/<uczelnia>/<wydzial>/`) operuje wyłącznie na dwóch modelach z `sources.base`:

1. **`PlanMetadata`** — metadane pojedynczego planu studiów.
2. **`RawLesson`** — pojedyncza jednostka zajęć dydaktycznych.

---

## 2. Model `PlanMetadata`

Zwracany przez metodę `discover()` Twojego adaptera:

| Pole | Typ | Wymagane? | Opis i przykład |
| :--- | :---: | :---: | :--- |
| `id` | `str` | **TAK** | Unikalny identyfikator planu (np. `"inf_s1"`, `"wet_rok2"`) |
| `name` | `str` | **TAK** | Czytelna nazwa dla studenta (np. `"Informatyka sem. 1"`) |
| `institution` | `str` | **TAK** | Skrót uczelni (np. `"PW"`, `"UMG"`, `"SGGW"`) |
| `faculty` | `str` | **TAK** | Wydział (np. `"MiNI"`, `"WN"`, `"WMW"`) |
| `groups` | `List[str]` | **TAK** | Lista dostępnych grup w planie (np. `["GR 1", "GR 2"]`) |
| `version_token` | `str` | *Opcjonalne* | Znacznik wersji zapobiegający zbędnemu ponownemu pobieraniu |
| `published_at` | `str` | *Opcjonalne* | Data publikacji planu przez dziekanat (`"YYYY-MM-DD HH:MM"`) |

---

## 3. Model `RawLesson`

Zwracany przez metodę `fetch_schedule(plan_id)` dla każdej grupy:

```python
from sources.base import RawLesson

RawLesson(
    subject="Programowanie Obiektowe",
    raw_subject="POB",               # Oryginalny skrót z systemu uczelni
    start_time="10:15",              # Format HH:MM (24-godzinny)
    end_time="11:45",                # Format HH:MM (24-godzinny)
    duration_minutes=90,             # Czas trwania w minutach
    teacher="prof. dr hab. Adam Nowak",
    room="C-204",                    # Numer lub nazwa sali
    form="lab",                      # Zobacz dozwolone formy poniżej
    day_of_week="TUE",               # MON | TUE | WED | THU | FRI | SAT | SUN
    hideable=True,                   # Czy student może ukryć te zajęcia w UI?
    occurrences=None                 # Zobacz sekcję "Tryb regularny vs zjazdowy"
)
```

---

## 4. Dopuszczalne formy zajęć (`form`)

Pole `form` w obiekcie `RawLesson` decyduje o kolorystycznym oznaczeniu krawędzi karty zajęć oraz filtrowaniu w PWA:

| Wartość pola `form` | Etykieta w interfejsie | Domyślny kolor | Przeznaczenie |
| :--- | :--- | :--- | :--- |
| `lecture` | Wykład | 🟡 Żółty / Bursztynowy | Wykłady audytoryjne |
| `exercise` | Ćwiczenia | 🔵 Błękitny / Morski | Ćwiczenia tablicowe, lektoraty |
| `lab` | Laboratorium | 🔴 Magenta / Czerwony | Pracownie komputerowe, laboratoria |
| `simulator` | Symulator | 🟣 Fioletowy | Symulatory nawigacyjne, lotnicze itp. |
| `clinic` | Klinika | 🟢 Szmaragdowy | Zajęcia kliniczne (weterynaria, medycyna) |
| `project` | Projekt | 🟠 Pomarańczowy | Zajęcia projektowe |
| `seminar` | Seminarium | 🟤 Brązowy | Seminaria magisterskie/dyplomowe |
| `elective` | Fakultet | 🔷 Granatowy / Indigo | Przedmioty obieralne |
| `other` | Inne | ⚪ Szary | Pozostałe formy |

---

## 5. Dwa tryby działania: Regularny vs Zjazdowy

Platforma wspiera dwa sposoby definiowania wystąpień spotkań:

### Tryb A: Regularna siatka tygodniowa (Studia stacjonarne)
Gdy zajęcia odbywają się cyklicznie w określonym dniu tygodnia:
- Ustawiasz `day_of_week="MON"` (odpowiednio `TUE`, `WED`, `THU`, `FRI`).
- Pole `occurrences` zostawiasz puste (`None`).
- **Silnik platformy (`core/expand.py`) automatycznie wylicza konkretne daty spotkań**, biorąc pod uwagę kalendarz akademicki, święta, ferie oraz zarządzenia rektorskie o zamianach dni tygodnia!

### Tryb B: Harmonogram konkretnych dat (Zjazdy zaoczne / NST)
Gdy harmonogram ma nieregularny charakter (np. weekendowe zjazdy w podanych datach):
- Wypełniasz listę `occurrences` z konkretnymi datami ISO:
```python
occurrences = [
    {"date": "2026-10-10", "number": 1, "of": 5},
    {"date": "2026-10-24", "number": 2, "of": 5},
    {"date": "2026-11-07", "number": 3, "of": 5}
]
```
W tym trybie frontend natychmiast wyświetla zajęcia w podanych dniach bez stosowania zamian rektorskich.

---

## 6. Ukrywanie zajęć fakultatywnych (`hideable`)

Jeśli na Twoim wydziale studenci mają podział na grupy językowe lub wybieralne laboratoria (np. *Grupa A* i *Grupa B* w tym samym slocie), ustaw:
```python
hideable = True
```
Dzięki tej fladze w interfejsie aplikacji pojawi się ikona oka 👁️, umożliwiająca studentowi ukrycie grupy, do której nie uczęszcza.
