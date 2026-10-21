# Pliki i struktura katalogu tenanta (`tenants/...`) 📁

W architekturze platformy **Uniplaner** każdy wydział lub uczelnia posiada własny, odizolowany katalog konfiguracyjny:  
📁 `tenants/<id_uczelni>/<id_wydzialu>/`

Katalog ten zawiera wszystkie elementy tożsamości wizualnej, motyw CSS, oficjalny kalendarz akademicki, słowniki oraz ustawienia funkcjonalne.

---

## 1. Zestawienie wszystkich plików tenanta

W katalogu tenanta może znajdować się łącznie **7 plików**:

| Plik | Status | Wymagany format | Rola i przeznaczenie |
| :--- | :---: | :---: | :--- |
| **`config.json`** | **OBOWIĄZKOWY** | JSON | Główne metadane, przełączniki modułów (`features`), definicje form i kolorów (`forms`), routing feedbacku, rejestracja adapterów. |
| **`academic_calendar.json`** | **OBOWIĄZKOWY** | JSON | Kalendarz akademicki: okresy zajęć (`periods`), dni wolne (`holidays`), zamiany dni rektorskie (`daySwaps`), granica połówek semestru (`half_boundaries`). |
| **`icon.png`** | **OBOWIĄZKOWY (1 plik)** | PNG (512×512) | Główna ikona aplikacji PWA i logo tenanta. Pełny kwadrat **bez przyciętych rogów** (maska 20% nakładana jest automatycznie przez platformę). |
| **`theme.css`** | **OBOWIĄZKOWY** | CSS | Zmienne kolorystyczne uczelni (`--accent`, `--bg-primary`, `--text-primary` itp.) dla trybu jasnego i ciemnego. |
| **`aliases.json`** | *Opcjonalny* | JSON | Słownik normalizujący nazwy przedmiotów i wykładowców (usuwa literówki dziekanatu, scala warianty nazw w wyszukiwarce). |
| **`changelog.json`** | *Opcjonalny* | JSON | Historia zmian i aktualizacji planów dla tego wydziału (automatycznie scalana z changelogiem globalnym). |
| **`events.json`** | *Opcjonalny* | JSON | Kalendarium wydarzeń wydziałowych (ogłoszenia kół naukowych, webinary, dni otwarte, terminy rekrutacji). |

---

## 2. Plik 1: `config.json` (Konfiguracja główna)

Plik `config.json` określa tożsamość wydziału oraz włącza lub wyłącza moduły interfejsu.

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

### Kluczowe sekcje:
- **`source_adapters`**: Lista pełnych ścieżek klas adapterów w Pythonie (np. `sources.pw.mini.adapter.ScheduleSource`).
- **`forms`**: Konfiguracja etykiet i kolorów krawędzi kart zajęć dla poszczególnych form.
- **`features`**: Włączanie/wyłączanie wyszukiwarki sal/prowadzących (`cross_reference`), wolnych sal (`free_rooms`), ukrywania zajęć (`lesson_hiding`), głosowania (`voting`) i changeloga.
- **`feedback`**: Routing zgłoszeń błędów w planie (np. formularz [Tally.so](https://tally.so/) otwierany w oknie dialogowym).

---

## 3. Plik 2: `academic_calendar.json` (Kalendarz akademicki)

Kalendarz akademicki określa ramy czasowe semestru, przerwy świąteczne oraz zarządzenia rektorskie o zamianach dni tygodnia.

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

### Elementy kalendarza:
- **`periods`**: Przedziały dat dla okresów dydaktycznych (`teaching`), przerw (`break`) oraz sesji egzaminacyjnych (`exam`).
- **`holidays`**: Słownik pojedynczych dni wolnych od zajęć (`"YYYY-MM-DD": "Nazwa święta"`).
- **`daySwaps`**: Zarządzenia rektorskie zmieniające dzień tygodnia realizacji zajęć. Kody dni: `"PON"`, `"WT"`, `"ŚR"`, `"CZW"`, `"PT"`, `"SOB"`, `"ND"`.
- **`half_boundaries`**: Klucz `half_2_start` wskazuje datę rozpoczęcia II połowy semestru. Zajęcia oznaczone `half_semester=2` automatycznie startują od tego tygodnia!

---

## 4. Plik 3: `icon.png` (Jednolity zasób graficzny)

- **Wymiary**: Dokładnie `512×512 px` (PNG).
- **Tło**: Pełny kwadrat wypełniony kolorem uczelni lub białym.
- **Brak zaokrągleń w pliku**: 🛑 **Nie zaokrąglaj rogów w pliku PNG!** Strona Uniplaner w CSS sama nakłada identyczną dla wszystkich maskę `border-radius: 20%` (squircle) z obrysem kontrastowym.
- **Bezpieczny margines (Safe Zone)**: Pozostaw 10–15% odstępu od krawędzi, aby herb/symbol nie został ucięty po zaokrągleniu na telefonie lub w aplikacji.
- **Działanie buildu**: Z tego jednego pliku kompilator generuje `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `favicon.png` oraz logo w nagłówku i oknie „O aplikacji”.

---

## 5. Plik 4: `theme.css` (Motyw kolorystyczny)

Definiuje paletę kolorów interfejsu PWA dopasowaną do identyfikacji wizualnej uczelni:

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

/* Tryb ciemny (Dark Mode) */
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

## 6. Plik 5: `aliases.json` (Normalizacja nazw i prowadzących)

*Opcjonalny plik słownika.* Jeśli system dziekanatu publikuje niespójne nazwy (np. skróty, literówki, różne formy zapisu nazwiska wykładowcy), `aliases.json` automatycznie je czyści i ujednolica:

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

- Podczas kompilacji pole `lesson["subject"]` i `lesson["teacher"]` zostają zamienione na czystą, pełną nazwę.
- Oryginalna nazwa ze źródła zostaje zachowana w polu `raw_subject` do wglądu.
- Dzięki temu wyszukiwarka powiązań (cross-reference) bezbłędnie scala wszystkie grupy danego wykładowcy w jeden spójny plan!

---

## 7. Plik 6: `changelog.json` (Lokalna historia zmian)

*Opcjonalny plik.* Pozwala autorom wtyczki informować studentów swojego wydziału o specyficznych zmianach w planach (np. dodaniu nowych grup czy poprawkach sal):

```json
[
  {
    "date": "2026-10-15",
    "title": "Aktualizacja sal laboratoryjnych",
    "description": "Zaktualizowano przydział sal dla laboratoriów z Fizyki na semestrze 1."
  }
]
```

Podczas budowania kompilator automatycznie scala ten plik z changelogiem globalnym Uniplanera i dodaje prefiks wydziału (np. `[MiNI] Aktualizacja sal laboratoryjnych`).

---

## 8. Plik 7: `events.json` (Kalendarium wydarzeń)

*Opcjonalny plik.* Wykorzystywany, gdy w `config.json` włączono flagę `"events": true`. Wyświetla studentom karty nadchodzących wydarzeń wydziałowych:

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
