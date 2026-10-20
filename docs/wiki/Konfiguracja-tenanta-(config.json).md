# Konfiguracja tenanta (`config.json`) ⚙️

Plik `config.json` w katalogu `tenants/<id_uczelni>/<id_wydzialu>/` definiuje metadane wtyczki, włączone moduły interfejsu oraz reguły zgłaszania błędów przez studentów.

---

## 1. Kompletny przykład pliku `config.json`

```json
{
  "id": "pw_mini",
  "institution": "Politechnika Warszawska",
  "faculty": "Wydział Matematyki i Nauk Informacyjnych",
  "faculty_short": "MiNI",
  "pwa_title": "Plan MiNI",
  "schedule_url": "https://mini.pw.edu.pl/plany",
  "plugin_version": "1.0.0",
  "author": "Klub Informatyków MiNI",

  "features": {
    "search": true,
    "free_rooms": true,
    "events": false,
    "voting": false,
    "changelog": true,
    "lesson_hiding": true
  },

  "feedback": {
    "contact_email": "kontakt@mini-plan.pl",
    "plan_issues_url": "https://github.com/twoj-login/mini-plan/issues/new",
    "tally_form_id": "mK31zP"
  },

  "source_adapters": [
    "sources.pw.mini.adapter.MyFacultyScheduleSource"
  ]
}
```

---

## 2. Opis pól konfiguracyjnych

### Identyfikacja wydziału
- **`id`** (`string`, wymagane): Unikalny identyfikator tenanta, np. `"umg_wn"`, `"sggw_weta"`. Używany m.in. jako prefiks w pamięci przeglądarki (`localStorage`).
- **`institution`** (`string`, wymagane): Pełna nazwa uczelni, np. `"Politechnika Warszawska"`.
- **`faculty`** (`string`, wymagane): Pełna nazwa wydziału.
- **`faculty_short`** (`string`, opcjonalne): Krótki akronim wydziału do stopki, np. `"MiNI"`.
- **`pwa_title`** (`string`, wymagane): Nazwa wyświetlana na ekranie telefonu po zainstalowaniu PWA (np. `"Plan MiNI"`).
- **`schedule_url`** (`string`, wymagane): Oficjalny link do źródła planów na stronie uczelni (wyświetlany w stopce i oknie „O aplikacji”).
- **`author`** (`string`, opcjonalne): Nazwa autora wtyczki (np. koło naukowe, samorząd studencki lub imię i nazwisko).

---

## 3. Przełączniki modułów (`features`)

Możesz włączać lub wyłączać poszczególne funkcje aplikacji w zależności od specyfiki Twojego wydziału:

| Flaga modułu | Domyślnie | Opis działania |
| :--- | :---: | :--- |
| **`search`** | `true` | Wyszukiwarka powiązań (widok planu konkretnego wykładowcy, sali lub przedmiotu) |
| **`free_rooms`** | `true` | Narzędzie wyszukiwania wolnych sal dydaktycznych w czasie rzeczywistym |
| **`lesson_hiding`** | `true` | Opcja ukrywania przez studenta niewybranych grup lektoratów i fakultetów |
| **`changelog`** | `true` | Wyświetlanie modalu z historią aktualizacji i zmian w aplikacji |
| **`events`** | `false` | Moduł ogłoszeń i wydarzeń studenckich |
| **`voting`** | `false` | Moduł bezpiecznego głosowania (np. na Salę Roku lub Wykładowcę Roku) |

---

## 4. Routing zgłaszania błędów (`feedback`)

Platforma **Uniplaner** inteligentnie rozdziela dwa rodzaje zgłoszeń:
1. **Błędy w planie zajęć** (np. *„Zła sala dla grupy 2 w czwartek”*, *„Brak wpisanego wykładowcy”*) — trafiają **bezpośrednio do autora wtyczki**.
2. **Błędy techniczne platformy PWA** (np. *„Aplikacja nie instaluje się na iOS”*) — trafiają do ogólnego repozytorium Uniplaner.

### Opcje konfiguracji feedbacku wtyczki:
- **`plan_issues_url`**: Adres URL repozytorium lub formularza GitHub Issues autora wtyczki. Po kliknięciu „Zgłoś błąd w planie” student zostanie przekierowany pod ten link.
- **`tally_form_id`**: Opcjonalny identyfikator bezpłatnego formularza [Tally.so](https://tally.so/). Jeśli go podasz, formularz zgłoszeniowy otworzy się jako elegancki popup wewnątrz aplikacji!
- **`contact_email`**: Bezpośredni adres e-mail do kontaktu w sprawach wtyczki.

---

## 5. Rejestracja adaptera (`source_adapters`)

Lista klas w Pythonie odpowiedzialnych za pobieranie danych dla tego tenanta:

```json
"source_adapters": [
  "sources.pw.mini.adapter.MyFacultyScheduleSource"
]
```
Podczas kompilacji poleceniem `python -m core.build --tenant pw/mini`, silnik automatycznie zaimportuje i uruchomi wskazaną klasę.
