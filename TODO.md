# Uniplaner - Backlog / TODO

Rejestr decyzji, zaległości i planowanych usprawnień platformy Uniplaner oraz jej wtyczek wydziałowych.

---

## 📌 Do zrobienia w kolejnych krokach (kolejność priorytetów)

### 1. Platforma Uniplaner (Core & Web)
- [ ] **Widok zbiorczy dla wszystkich grup (`web/`)**: Dodanie widoku porównawczego (dzień / tydzień) prezentującego zajęcia wszystkich grup danego kierunku i semestru jednocześnie w przejrzystej siatce. Domena pomocnicza `aggregateAllGroupsSchedule` została już zaimplementowana w `schedule-engine.js`.
- [ ] **Platform Adapter (`web/js/platform-adapter.js`)**: Odizolowanie integracji PWA, Service Workera, detekcji iOS oraz generowania linków webcal za dedykowanym modułem/szwem (seam), redukując pozostałości w `web/app.js`.
- [ ] **Podgląd dnia bazowego przy zamianie rektorskiej (`web/`)**: W dniach z zamianą rektorską domyślnie pokazujemy dzień realizowany z oficjalnym licznikiem spotkań, ale dodajemy opcję informacyjną "Podgląd dnia bazowego" (pokazuje sale i godziny oryginalnego planu bez wyświetlania numeru spotkania).
- [ ] **Dokumentacja i GitHub Wiki**: Przygotowanie kompletnego poradnika ze zrzutami ekranu w GitHub Wiki dla autorów adapterów chcących dołączyć swoją uczelnię/wydział do Uniplanera.

### 2. Wtyczka UMG WN (`sources/umg/wn/`, `tenants/umg/wn/`)
- [ ] **Rozszerzenie profilu prowadzącego o konsultacje**: Scrapowanie dodatkowych danych ze stron UMG (terminy i sale dyżurów / konsultacji, katedra, kontakt) i prezentacja w modalu wykładowcy.
- [ ] **Zajętość i harmonogram pływalni UMG (`umg.edu.pl/basen/harmonogram`)**:
  - Scrapowanie cotygodniowej tabeli harmonogramu basenu UMG (status: otwarte / nieczynne, rezerwacje torów 1–6, wolne tory dla klientów/studentów).
  - Eksport do `dist/data/pool_schedule.json` podczas nocnego buildu.
  - Prezentacja dostępności torów w aplikacji (np. wzbogacenie sali `WF basen` w wyszukiwarce sal lub dedykowany kafel ze statusem "Czy popływam teraz?").
- [ ] **Weryfikacja reguły przedmiotów co 2 tygodnie w dni zamienione**: Ustalić z dziekanatem / studentami UMG, czy przedmiot dwutygodniowy może odbyć się dwukrotnie w jednym tygodniu w przypadku zamiany dnia (np. środa 16.12 i piątek 18.12).

---

## ✅ Zrealizowane funkcjonalności

### Architektura modularna i multi-tenant (Kamień milowy v3.11)
- [x] **Separacja Core i Tenantów**: Całkowity zakaz logiki specyficznej dla uczelni w `core/` i `web/`. Podział na `sources/<tenant>/` (adaptery pobierania) oraz `tenants/<tenant>/` (konfiguracja, motyw, kalendarz).
- [x] **Kontrakt v1 i Expander (`core/expand.py`)**: Eliminacja przeliczania spotkań w runtime frontendu (ADR-0002). Silnik działa w 100% na pre-kalkulowanych datach i wystąpieniach spotkań.
- [x] **Adapter SGGW WETA**: Pełna obsługa drugiego tenanta (Szkoła Główna Gospodarstwa Wiejskiego w Warszawie, Wydział Medycyny Weterynaryjnej) z parserem harmonogramów Excel (SharePoint) i dedykowanym motywem.
- [x] **Wzorzec i przewodnik adaptera**: Przygotowano katalog startowy `sources/_template/` oraz specyfikacje `docs/specs/contract-v1.md`, `docs/specs/tenant-config.md` i `docs/specs/adapter-guide.md`.
- [x] **Dynamiczny branding i routing feedbacku**:
  - Dynamiczny modal "O aplikacji" prezentujący platformę Uniplaner oraz kartę aktywnej wtyczki wydziałowej.
  - Elastyczne logo i ikony SVG/PNG z przezroczystością (brak na sztywno zaszytych barw tła).
  - Rozdział zgłoszeń błędów: błędy planu do autora wtyczki (formularz Tally / issues wtyczki), a błędy platformy do repozytorium Uniplaner.
  - Izolacja preferencji studenta w `localStorage` per-tenant (`${tenant_id}_selected_group`, itp.) z automatyczną migracją wsteczną.
  - Automatyczna normalizacja przedmiotów i wykładowców na podstawie `tenants/<tenant>/aliases.json`.
- [x] **Inteligentny detektor wersji planów (`core/detector.py`)**: Weryfikacja wersji przed pobieraniem pełnej siatki i zapytań AJAX.

### Prezentacja planu i interfejs (`web/`)
- [x] **Naturalne sortowanie listy planów w menu wyboru**: Sortowanie planów alfabetycznie po nazwie kierunku, a w ramach danego kierunku rosnąco po numerze semestru (`comparePlans`, `get_plan_sort_key`). Przetestowane w `tests/test_calendar.js` (Test 23) i `tests/test_backend.py` (Test 24).
- [x] **Oczyszczenie nazw kierunków w menu wyboru**: Parsowanie długich nazw uczelnianych (np. `[TM Sem 1] Transport Morski...` -> czyste `Transport Morski sem. 1`). Przetestowane w `tests/test_calendar.js` (Test 17) i `tests/test_backend.py` (Test 19).
- [x] **Data i wersja aktualizacji planu uczelnianego**: Wyciąganie znacznika czasu i wersji z nazwy planu na arktur (np. `[2026-09-14 17:55] wer. 2`) i wyświetlanie jako data publikacji planu w menu / panelu bocznym.
- [x] **Oznaczenie kolorystyczne form zajęć**: Rozróżnienie form dydaktycznych (wykład, ćwiczenia, laboratorium, symulator, klinika, projekt, seminarium) za pomocą akcentów kolorystycznych lewej krawędzi (`border-left-color`) na kartach zajęć.
- [x] **Dostępność sal z uwzględnieniem dat i cykli**: Funkcja wyszukiwania wolnych sal weryfikuje faktyczny stan zajęć w danej dacie (`getRoomOccupancyAt`): uwzględnia przedmioty zakończone z 1. połowy semestru, naprzemienne cykle co 2 tygodnie, dni wolne oraz zamiany rektorskie.
- [x] **Usprawnienia wyszukiwarki wolnych sal**:
  - Wybór dnia i godziny z popupu kalendarza (Dziś / Jutro / kalendarz HTML5).
  - Globalna dostępność sal ze wszystkich planów danego tenanta (`cross_reference.json`) w czasie polskim (`Europe/Warsaw`).
  - Szybkie filtrowanie sal po nazwie, podział na kafelki wolne i sekcję zajętych z informacją o kolejnych zajęciach.

### Scraping i parsowanie UMG (`sources/umg/wn/`)
- [x] **Bezpieczna detekcja grup II stopnia (np. `A1`, `B1`)**: Rozszerzenie regexu o format grup magisterskich (`^[A-E]\s*\d{1,2}$`), zapobiegający pomijaniu planów takich jak Morskie Systemy Transportowe i Logistyczne przy jednoczesnym blokowaniu śmieciowych komórek Arktura.
- [x] **Obsługa planów niestacjonarnych (NST)**: Scrapowanie i parsowanie planów w formacie PDF (`nst_client.py`, `nst_parser.py`), generowanie planów JSON i ICS per grupa, obsługa widoku NST w aplikacji webowej bez zamian rektorskich.

### Kalendarz ICS i Webcal (`core/ics.py`, `web/`)
- [x] **Spójność ICS z kalendarzem akademickim**: Funkcja `generuj_ics` uwzględnia dni wolne (`holidays`), przerwy (`breaks`) oraz zamiany dni (`daySwaps`), a pliki `.ics` generowane dla wszystkich grup są w 100% zsynchronizowane z kalendarzem rektorskim i widokiem Web.
- [x] **Nowoczesny modal subskrypcji w UI**: Dedykowane przyciski subskrypcji dla Google Calendar (Android / PC) oraz Apple Kalendarza (iOS / Mac), kopiowanie bezpośredniego adresu URL subskrypcji oraz pobieranie pliku `.ics` dla urządzeń offline.

### Logika kalendarza i spotkań (`core/expand.py`, `web/js/schedule-engine.js`)
- [x] **Twardy koniec semestru**: Zablokowano doliczanie spotkań w trakcie sesji egzaminacyjnej (`type === "exam"`), przerw oraz poza oficjalnym okresem dydaktycznym (`type === "teaching"`). Przetestowane TDD w `tests/test_calendar.js`.
- [x] **Schedule Engine**: Wyodrębnienie czystego silnika domenowego do `web/js/schedule-engine.js` (logika kalendarza akademickiego, zamiany dni, daty startu, `getLessonMeetingInfo`, `getRoomOccupancyAt`, `resolveWeekSchedule`, `buildScheduleIndex`). Pełne pokrycie testami TDD w `tests/test_schedule_engine.js` i `tests/test_calendar.js`.

### Moduły frontendu (`web/js/modules/`)
- [x] **Cross-Reference Modals**: Konsolidacja powielonego kodu w modalach wykładowców, sal, przedmiotów i wolnych sal w dedykowany moduł `web/js/modules/cross-reference.js` (`CrossRef.Engine`, `CrossRef.DataService`, `CrossRef.UI`). Pełna dostępność (a11y, Escape, focus trap), SWR cache, usunięcie długu z `web/app.js` oraz testy TDD w `tests/test_cross_reference.js` (8/8 PASS).
- [x] **Events / Wydarzenia studenckie**: Moduł powiadomień i wydarzeń akademickich sterowany z GitOps.
- [x] **Lesson Hiding**: Ukrywanie zajęć fakultatywnych i grup językowych, w których student nie uczestniczy.
- [x] **Głosowanie na salę roku / wykładowcę**: Bezpieczne, podpisane tokenami głosowanie zintegrowane z backendem Supabase.

### Społeczność i funkcje studenckie
- [x] **Czwartkowy komunikat o flankach**: Wyświetlanie w czwartki lekkiego, studenckiego baneru przypominającego o tradycji integracyjnej.
- [x] **Funkcja "Zgłoś błąd w planie"**: Zaimplementowano dedykowany formularz zgłoszeniowy (Tally modal z automatycznym fallbackiem przy adblockerach) oraz bezpośredni odnośnik do GitHub Issues.

### Analityka i telemetria (`web/`)
- [x] **Wdrożenie analityki GoatCounter**: Dodanie lekkiego, bezciasteczkowego skryptu analitycznego do `web/index.html`.
