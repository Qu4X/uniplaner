# Specyfikacja Kontraktu Danych Planu Zajęć v1

Wersja kontraktu: `1`  
Status: Zaakceptowany (Faza 0)  
Data utworzenia: 2026-10-19  

Niniejszy dokument definiuje jednolity format danych generowanych przez orkiestrator (`core/writer.py`) dla wszystkich źródeł planów (UMG Arktur, SGGW SharePoint/XLSX, NST PDF). Frontend aplikacji czyta wyłącznie pliki zgodne z tą specyfikacją.

---

## 1. Indeks Planów: `plans.json`

Katalog: `dist/data/plans.json` (lub `dist/<tenant>/data/plans.json`)

```json
{
  "$schema": "../docs/schemas/plans.schema.json",
  "schema_version": 1,
  "tenant": "umg_wn",
  "generated_at": "2026-10-19T20:00:00Z",
  "plans": [
    {
      "id": "561",
      "institution": "umg",
      "faculty": "wn",
      "name": "Transport Morski sem. 1",
      "study_mode": "full_time",
      "semester_number": 1,
      "version_token": "wer. 3 [2026-09-30 17:12]",
      "published_at": "2026-09-30T17:12:00",
      "archived": false,
      "groups": ["GR.01", "GR.02"]
    }
  ]
}
```

### Pola `PlanMetadata`:
* `id` (`string`, wymagane): Unikalny identyfikator planu w ramach tenanta (np. `"561"`, `"wmw_sem_1"`).
* `institution` (`string`, wymagane): Kod uczelni (np. `"umg"`, `"sggw"`).
* `faculty` (`string`, wymagane): Kod wydziału (np. `"wn"`, `"wmw"`).
* `name` (`string`, wymagane): Znormalizowana, czytelna nazwa kierunku i semestru bez śmieciowych prefiksów (np. `"Transport Morski sem. 1"`).
* `study_mode` (`enum: ["full_time", "part_time"]`, wymagane): Tryb studiów (stacjonarne / niestacjonarne).
* `semester_number` (`integer`, opcjonalne, `null`): Numer semestru (1..12).
* `version_token` (`string`, wymagane): Token wykrywania zmian (np. `"wer. 3 [2026-09-30 17:12]"` dla Arktura, SHA-256 pobranego arkusza dla SharePoint).
* `published_at` (`string ISO`, opcjonalne, `null`): Data publikacji planu przez dziekanat.
* `archived` (`boolean`, domyślnie `false`): Czy plan jest archiwalny (archiwizowany dopiero po zakończeniu sesji poprawkowej).
* `groups` (`array of string`, wymagane): Lista unikalnych grup studenckich w danym planie.

---

## 2. Harmonogram Grupy: `schedules/{plan_id}_{group}.json`

Katalog: `dist/data/schedules/{plan_id}_{safe_group}.json`  
Reguła nazwy grupy: `re.sub(r'[^\w-]', '_', group)` (Kontrakt 1).

```json
{
  "$schema": "../../docs/schemas/schedule.schema.json",
  "schema_version": 1,
  "plan_id": "561",
  "group": "GR.01",
  "generated_at": "2026-10-19T20:00:00Z",
  "lessons": [
    {
      "id": "a3f9c21e8d91",
      "subject": "Matematyka",
      "raw_subject": "Mat",
      "teacher": "Milczek Beata",
      "room": "Aula",
      "form": "lecture",
      "hideable": false,
      "remote": false,
      "day_of_week": "MON",
      "start_time": "12:15",
      "end_time": "13:45",
      "duration_minutes": 90,
      "start_date": "2026-10-05",
      "interval_weeks": 1,
      "half_semester": null,
      "groups": [],
      "occurrences": [
        { "date": "2026-10-05", "number": 1, "of": 15 },
        { "date": "2026-10-12", "number": 2, "of": 15 },
        { "date": "2026-11-05", "number": 5, "of": 15 }
      ]
    }
  ]
}
```

### Pola `Lesson`:
* `id` (`string`, wymagane): Deterministyczny skrót SHA-256 (pierwsze 12–16 znaków) liczony w `core/ids.py`:
  `sha256(f"{subject}|{form}|{day_of_week}|{start_time}|{end_time}|{room}|{half_semester}|{interval_weeks}|{start_date_or_first_occ}")`
  Dla planów NST zamiast `day_of_week`/`start_date` stosuje się datę pierwszego wystąpienia z `occurrences`.
* `subject` (`string`, wymagane): Znormalizowana, pełna nazwa przedmiotu.
* `raw_subject` (`string`, opcjonalne, `null`): Oryginalna nazwa/skrót z siatki (np. `"Mat"`, `"Naw"`), używana przez wyszukiwarkę cross-reference.
* `teacher` (`string`, opcjonalne, `null`): Tytuł, imię i nazwisko prowadzącego. `null` lub brak, jeśli nieobsadzony.
* `room` (`string`, opcjonalne, `null`): Numer/nazwa sali (np. `"Aula"`, `"306"`, `"A-102"`). `null` dla zajęć bez sali.
* `remote` (`boolean`, domyślnie `false`): Flaga zajęć zdalnych (zastępuje magiczny ciąg `"OL"`).
* `form` (`enum`, wymagane):
  * `lecture` — Wykład
  * `exercise` — Ćwiczenia audytoryjne / tablicowe
  * `lab` — Laboratorium / pracownia komputerowa
  * `simulator` — Symulator
  * `project` — Projekt
  * `seminar` — Seminarium
  * `elective` — Fakultet / zajęcia do wyboru
  * `other` — Inne formy
* `hideable` (`boolean`, domyślnie `false`): Flaga wystawiana przez adapter. Informuje frontend, że dany termin może być indywidualnie ukryty przez studenta (np. podgrupy symulatora manewrowego na UMG lub fakultety na SGGW). Frontend nie sprawdza nazw przedmiotów, lecz pole `hideable`.
* `day_of_week` (`enum: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]`, opcjonalne, `null` dla NST): Bazowy dzień tygodnia z siatki planu.
* `start_time` (`string HH:MM`, wymagane): Godzina rozpoczęcia w strefie `Europe/Warsaw`.
* `end_time` (`string HH:MM`, wymagane): Godzina zakończenia w strefie `Europe/Warsaw`.
* `duration_minutes` (`integer`, wymagane): Czas trwania w minutach (np. 90). Używany bezpośrednio do wyliczania wysokości na osi czasu.
* `start_date` (`string YYYY-MM-DD`, opcjonalne, `null` dla NST): Data kalendarzowa pierwszych możliwych zajęć w semestrze.
* `interval_weeks` (`integer`, domyślnie `1`): Cykl powtarzalności (1 = co tydzień, 2 = co dwa tygodnie).
* `half_semester` (`integer: 1 | 2`, opcjonalne, `null`): Ograniczenie do pierwszej lub drugiej połowy semestru.
* `groups` (`array of string`, domyślnie `[]`): Informacja o podgrupach, dla których przeznaczone jest to wystąpienie (pusta tablica = cały rocznik / cała grupa).
* `occurrences` (`array of Occurrence`, wymagane):
  Lista faktycznych dat realizacji spotkań wyliczona przez backend (`core/expand.py`) na podstawie kalendarza akademickiego tenanta.
  ```json
  { "date": "2026-10-05", "number": 1, "of": 15 }
  ```
  * `date` (`string YYYY-MM-DD`): Data kalendarzowa spotkania.
  * `number` (`integer`): Kolejny numer spotkania (1..`of`).
  * `of` (`integer`): Łączna liczba planowanych spotkań w semestrze.

---

## 3. Semantyka Zamiany Dnia i Podglądu Dnia Bazowego (`baseDayPreview`)

Zgodnie z zasadą D5 z `CONTEXT.md` (podgląd nie liczy spotkań):
1. **Dzień realizowany**: Jeśli w dacie `D` (np. czwartek `2026-11-05`) zarządzenie rektora nakazuje realizację planu z poniedziałku (`replaceWith: "MON"`), to lekcje poniedziałkowe mają w swoich `occurrences` wpisaną datę `2026-11-05` i posiadają przypisany właściwy numer spotkania.
2. **Podgląd dnia bazowego**: Lekcje oryginalnie przypisane do czwartku (`day_of_week === "THU"`) **nie odbywają się w tym dniu** i nie posiadają wpisu `2026-11-05` w `occurrences`. Frontend w widoku czwartku wyświetla je w sekcji `baseDayPreview` jako czysty podgląd sal i godzin bez numeru spotkania.
