# Konfiguracja tenanta (`config.json`)

Plik `config.json` w katalogu `tenants/<id_uczelni>/<id_wydzialu>/` zawiera metadane adaptera, listę włączonych modułów interfejsu oraz zasady zgłaszania błędów przez studentów.

Pozostałe pliki tenanta opisuje strona [Pliki i konfiguracja tenanta](Pliki-i-konfiguracja-tenanta).

---

## 1. Przykładowy plik `config.json`

```json
{
  "id": "pw_mini",
  "name": "Politechnika Warszawska — Wydział Matematyki i Nauk Informacyjnych",
  "short_name": "Plan MiNI",
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
    "lecture":  { "label": "Wykład",    "abbr": "W",  "badge_color": "#2563eb" },
    "exercise": { "label": "Ćwiczenia", "abbr": "Ćw", "badge_color": "#059669" }
  },

  "features": {
    "cross_reference": true,
    "free_rooms": true,
    "events": false,
    "lesson_hiding": { "enabled": true, "bulk_electives_dialog": false },
    "voting": { "enabled": false, "threshold": 10 },
    "changelog": true
  }
}
```

---

## 2. Opis pól

### Identyfikacja wydziału
- **`id`** (`string`, wymagane): unikalny identyfikator tenanta, np. `"umg_wn"`, `"sggw_weta"`. Służy m.in. jako prefiks kluczy w pamięci przeglądarki (`localStorage`).
- **`name`** (`string`, wymagane): pełna nazwa wyświetlana w aplikacji.
- **`short_name`** (`string`, wymagane): nazwa pod ikoną po zainstalowaniu aplikacji (np. `"Plan MiNI"`).
- **`institution`**, **`institution_full`** (`string`): skrót i pełna nazwa uczelni.
- **`faculty`**, **`faculty_full`** (`string`): skrót i pełna nazwa wydziału.
- **`source_url`**, **`source_label`** (`string`): oficjalny adres źródła planów i jego czytelna etykieta (pokazywane w stopce i w oknie „O aplikacji”).
- **`theme_color`** (`string`): kolor paska przeglądarki i manifestu PWA.
- **`locale`** (`string`): język interfejsu, np. `"pl"`.
- **`plugin_version`**, **`plugin_author`** (`string`): wersja adaptera oraz jego autor (np. koło naukowe, samorząd studencki lub imię i nazwisko).

---

## 3. Przełączniki modułów (`features`)

Funkcje aplikacji można włączać i wyłączać odpowiednio do potrzeb wydziału:

| Flaga modułu | Działanie |
| :--- | :--- |
| **`cross_reference`** | Wyszukiwarka powiązań (plan wybranego prowadzącego, sali lub przedmiotu) |
| **`free_rooms`** | Wyszukiwanie wolnych sal dydaktycznych |
| **`lesson_hiding`** | Ukrywanie przez studenta grup lektoratów i fakultetów, do których nie należy (`enabled`, `bulk_electives_dialog`) |
| **`changelog`** | Okno z historią aktualizacji i zmian w aplikacji |
| **`events`** | Moduł ogłoszeń i wydarzeń studenckich |
| **`voting`** | Moduł głosowania (`enabled`, `threshold`), np. na Salę Roku lub Wykładowcę Roku |

---

## 4. Kierowanie zgłoszeń błędów (`feedback`)

Platforma **Uniplaner** rozdziela dwa rodzaje zgłoszeń:
1. **Błędy w planie zajęć** (np. *„Zła sala dla grupy 2 w czwartek”*, *„Brak prowadzącego”*) trafiają **bezpośrednio do autora adaptera**.
2. **Błędy techniczne aplikacji** (np. *„Aplikacja nie instaluje się na iOS”*) trafiają do głównego repozytorium Uniplaner.

### Opcje konfiguracji
- **`plan_issues_url`**: adres repozytorium lub formularza GitHub Issues autora adaptera. Po wybraniu opcji „Zgłoś błąd w planie” student zostaje przekierowany pod ten adres.
- **`tally_form_id`**: opcjonalny identyfikator bezpłatnego formularza [Tally.so](https://tally.so/). Po jego podaniu formularz zgłoszeniowy otwiera się w oknie wewnątrz aplikacji.
- **`contact_email`**: adres e-mail do kontaktu w sprawach adaptera.

---

## 5. Rejestracja adaptera (`source_adapters`)

Lista klas Pythona odpowiedzialnych za pobieranie danych dla danego tenanta:

```json
"source_adapters": [
  "sources.pw.mini.adapter.MyFacultyScheduleSource"
]
```
Podczas kompilacji poleceniem `python -m core.build --tenant pw/mini` kompilator automatycznie importuje wskazaną klasę i uruchamia ją.
