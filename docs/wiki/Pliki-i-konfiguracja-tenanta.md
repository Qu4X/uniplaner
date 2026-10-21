# Pliki i struktura katalogu tenanta (`tenants/...`)

W platformie **Uniplaner** każdy wydział lub uczelnia ma własny, odizolowany katalog konfiguracyjny:  
`tenants/<id_uczelni>/<id_wydzialu>/`

Katalog zawiera elementy identyfikacji wizualnej, motyw CSS, oficjalny kalendarz akademicki, słowniki oraz ustawienia funkcjonalne.

---

## 1. Zestawienie plików tenanta

W katalogu tenanta może znajdować się **siedem plików**:

| Plik | Status | Format | Rola |
| :--- | :---: | :---: | :--- |
| **`config.json`** | **Obowiązkowy** | JSON | Metadane, przełączniki modułów (`features`), definicje form i kolorów (`forms`), kierowanie zgłoszeń błędów, rejestracja adapterów. |
| **`academic_calendar.json`** | **Obowiązkowy** | JSON | Kalendarz akademicki: okresy zajęć (`periods`), dni wolne (`holidays`), zamiany dni (`daySwaps`), granica połów semestru (`half_boundaries`). |
| **`icon.png`** | **Obowiązkowy** | PNG (512×512) | Ikona aplikacji PWA i logo tenanta. Pełny kwadrat **bez zaokrąglonych rogów** (maskę 20% nakłada platforma). |
| **`theme.css`** | **Obowiązkowy** | CSS | Zmienne kolorystyczne uczelni (`--accent`, `--bg-primary`, `--text-primary` itp.) dla trybu jasnego i ciemnego. |
| **`aliases.json`** | *Opcjonalny* | JSON | Słownik ujednolicający nazwy przedmiotów i prowadzących (poprawia literówki dziekanatu, scala warianty nazw w wyszukiwarce). |
| **`changelog.json`** | *Opcjonalny* | JSON | Historia zmian w planach wydziału (automatycznie łączona z globalnym dziennikiem zmian). |
| **`events.json`** | *Opcjonalny* | JSON | Kalendarium wydarzeń wydziałowych (ogłoszenia kół naukowych, webinary, dni otwarte, terminy rekrutacji). |

---

## 2. `config.json` — konfiguracja główna

Plik `config.json` określa tożsamość wydziału oraz włącza i wyłącza moduły interfejsu.

```json
{
  "id": "pw_mini",
  "name": "Politechnika Warszawska — Wydział Matematyki i Nauk Informacyjnych",
  "short_name": "Plan MiNI",
  "icon": "📐",
  "theme_color": "#005a9c",
  "institution": "PW",
  "institution_full": "Politechnika Warszawska (PW)",
  "faculty": "MiNI",
  "faculty_full": "Wydział Matematyki i Nauk Informacyjnych",
  "source_url": "https://mini.pw.edu.pl/plany",
  "source_label": "mini.pw.edu.pl",
  "locale": "pl",
  "plugin_version": "1.0.0",
  "plugin_author": "Klub Informatyków MiNI",

  "feedback": {
    "plan_issues_url": "https://github.com/twoj-login/mini-plan/issues/new",
    "tally_form_id": "mK31zP",
    "contact_email": "kontakt@mini-plan.pl"
  },

  "source_adapters": [
    "sources.pw.mini.adapter.MyFacultyScheduleSource"
  ],

  "forms": {
    "lecture":   { "label": "Wykład",       "abbr": "W",    "badge_color": "#2563eb" },
    "exercise":  { "label": "Ćwiczenia",    "abbr": "Ćw",   "badge_color": "#059669" },
    "lab":       { "label": "Laboratorium", "abbr": "Lab",  "badge_color": "#7c3aed" },
    "project":   { "label": "Projekt",      "abbr": "Pr",   "badge_color": "#8b5cf6" },
    "seminar":   { "label": "Seminarium",   "abbr": "Sem",  "badge_color": "#6366f1" }
  },

  "features": {
    "cross_reference": true,
    "free_rooms": true,
    "events": false,
    "lesson_hiding": {
      "enabled": true,
      "bulk_electives_dialog": false
    },
    "voting": {
      "enabled": false,
      "threshold": 10
    },
    "changelog": true
  }
}
```

### Najważniejsze sekcje
- **`source_adapters`**: lista pełnych ścieżek klas adapterów w Pythonie (np. `sources.pw.mini.adapter.ScheduleSource`).
- **`forms`**: etykiety i kolory krawędzi kart dla poszczególnych form zajęć.
- **`features`**: włączanie i wyłączanie wyszukiwarki sal i prowadzących (`cross_reference`), wolnych sal (`free_rooms`), ukrywania zajęć (`lesson_hiding`), głosowania (`voting`) i dziennika zmian.
- **`feedback`**: kierowanie zgłoszeń błędów w planie (np. formularz [Tally.so](https://tally.so/) otwierany w oknie dialogowym).

---

## 3. `academic_calendar.json` — kalendarz akademicki

Kalendarz określa ramy czasowe semestru, przerwy dydaktyczne oraz zarządzenia rektorskie o zamianach dni.

```json
{
  "daySwaps": {
    "2026-11-10": { "replaceWith": "PT", "note": "Wtorek 10.11 – zajęcia z piątku" },
    "2027-01-05": { "replaceWith": "ŚR", "note": "Wtorek 05.01 – zajęcia ze środy" }
  },
  "holidays": {
    "2026-11-01": "Wszystkich Świętych",
    "2026-11-11": "Święto Niepodległości",
    "2027-01-01": "Nowy Rok",
    "2027-01-06": "Święto Trzech Króli"
  },
  "periods": [
    { "name": "Zimowa przerwa świąteczna", "type": "break", "start": "2026-12-21", "end": "2027-01-03" },
    { "name": "Sesja egzaminacyjna zimowa", "type": "exam", "start": "2027-01-30", "end": "2027-02-12" },
    { "name": "Okres zajęć dydaktycznych – semestr zimowy", "type": "teaching", "start": "2026-10-01", "end": "2027-01-29" },
    { "name": "Okres zajęć dydaktycznych – semestr letni", "type": "teaching", "start": "2027-02-22", "end": "2027-06-15" }
  ],
  "half_boundaries": {
    "half_2_start": "2026-11-23"
  }
}
```

### Elementy kalendarza
- **`periods`**: przedziały dat dla okresów dydaktycznych (`teaching`), przerw (`break`) i sesji egzaminacyjnych (`exam`).
- **`holidays`**: słownik pojedynczych dni wolnych od zajęć (`"YYYY-MM-DD": "Nazwa święta"`).
- **`daySwaps`**: zarządzenia rektorskie zmieniające dzień realizacji zajęć. Kody dni: `"PON"`, `"WT"`, `"ŚR"`, `"CZW"`, `"PT"`, `"SOB"`, `"ND"`.
- **`half_boundaries`**: klucz `half_2_start` wskazuje datę rozpoczęcia II połowy semestru. Zajęcia oznaczone `half_semester=2` są planowane od tego tygodnia.

---

## 4. `icon.png` — zasób graficzny

- **Wymiary**: dokładnie `512×512 px` (PNG).
- **Tło**: pełny kwadrat wypełniony kolorem uczelni lub białym.
- **Bez zaokrągleń w pliku**: nie zaokrąglaj rogów w pliku PNG. Aplikacja sama nakłada jednakową dla wszystkich maskę `border-radius: 20%` z kontrastowym obrysem.
- **Strefa bezpieczna**: zachowaj 10–15% marginesu od krawędzi, aby herb lub symbol nie został ucięty po zaokrągleniu na telefonie lub w aplikacji.
- **Działanie kompilatora**: z tego jednego pliku kompilator generuje `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `favicon.png` oraz logo w nagłówku i w oknie „O aplikacji”.

---

## 5. `theme.css` — motyw kolorystyczny

Plik definiuje paletę kolorów interfejsu dopasowaną do identyfikacji wizualnej uczelni:

```css
:root {
  /* Kolor akcentu uczelni (przyciski, aktywne zakładki, nagłówki) */
  --accent: #005a9c;
  --accent-hover: #004273;
  --accent-light: rgba(0, 90, 156, 0.12);

  /* Tła */
  --bg-primary: #ffffff;
  --bg-secondary: #f4f6f9;

  /* Tekst */
  --text-primary: #1a202c;
  --text-secondary: #718096;
}

/* Tryb ciemny */
[data-theme="dark"] {
  --accent: #3182ce;
  --accent-hover: #4299e1;
  --accent-light: rgba(49, 130, 206, 0.2);

  --bg-primary: #121824;
  --bg-secondary: #1a2234;
  --text-primary: #f7fafc;
  --text-secondary: #a0aec0;
}
```

---

## 6. `aliases.json` — ujednolicanie nazw przedmiotów i prowadzących

*Plik opcjonalny.* Jeśli system dziekanatu publikuje niespójne nazwy (skróty, literówki, różne zapisy nazwiska prowadzącego), `aliases.json` ujednolica je automatycznie:

```json
{
  "subjects": {
    "Wsp. Syst. Naw.": "Współczesne Systemy Nawigacyjne",
    "Prog. Obiekt.": "Programowanie Obiektowe"
  },
  "teachers": {
    "dr J. Kowal": "dr Jan Kowalski",
    "dr Kowalski Jan": "dr Jan Kowalski"
  }
}
```

- Podczas kompilacji pola `lesson["subject"]` i `lesson["teacher"]` są zastępowane pełną, ujednoliconą nazwą.
- Oryginalna nazwa ze źródła pozostaje w polu `raw_subject`.
- Dzięki temu wyszukiwarka powiązań (cross-reference) łączy wszystkie grupy danego prowadzącego w jeden spójny plan.

---

## 7. `changelog.json` — lokalna historia zmian

*Plik opcjonalny.* Pozwala autorom adaptera informować studentów wydziału o zmianach w planach (np. o nowych grupach lub poprawionych salach):

```json
[
  {
    "date": "2026-10-15",
    "title": "Aktualizacja sal laboratoryjnych",
    "description": "Zaktualizowano przydział sal dla laboratoriów z Fizyki na semestrze 1."
  }
]
```

Podczas budowania kompilator łączy ten plik z globalnym dziennikiem zmian Uniplanera i dodaje prefiks wydziału (np. `[MiNI] Aktualizacja sal laboratoryjnych`).

---

## 8. `events.json` — kalendarium wydarzeń

*Plik opcjonalny.* Jest używany, gdy w `config.json` włączono flagę `"events": true`. Wyświetla studentom karty nadchodzących wydarzeń wydziałowych:

```json
[
  {
    "enabled": true,
    "id": "targi-pracy-2026",
    "date": "2026-11-20",
    "time_start": "10:00",
    "time_end": "15:00",
    "title": "Wydziałowe Targi Pracy IT",
    "description": "Spotkanie z przedstawicielami firm technologicznych w holu głównym.",
    "location": "Hol Główny Wydziału MiNI",
    "url": "https://mini.pw.edu.pl/targi",
    "button_text": "Więcej informacji",
    "type": "academic",
    "badge": "Kariera",
    "icon": "💼",
    "color": "#0d3b66"
  }
]
```
