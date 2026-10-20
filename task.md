# Plan redesignu modularnego — Status końcowy (100% zrealizowany)

- [x] **Krok 1: Docelowa struktura katalogów i plików (usunięcie duplikatów i fasad z roota)**
  - [x] Usunięto przestarzałe pliki z roota: `arktur_client.py`, `arktur_parser.py`, `nst_client.py`, `nst_parser.py`, `scrapper.py`, `ics_export.py`, `models.py`.
  - [x] `build_static.py` zredukowano do cienkiego CLI wrappera (45 linii) wokół `core.build.build_tenant("umg_wn")`.
  - [x] Usunięto katalog główny `data/` — pliki przeniesione do `tenants/umg_wn/` (`academic_calendar.json`, `events.json`) oraz `sources/umg_wn/forms/` i `sources/umg_wn/subjects/`.
  - [x] Przeniesiono `web/js/cross-reference.js` do `web/js/modules/cross-reference.js` i usunięto stary `web/js/events-service.js`.

- [x] **Krok 2: Usunięcie pętli `getLessonMeetingInfo` ze strefy chronionej (`web/js/schedule-engine.js`)**
  - [x] Usunięto pętlę tydzień-po-tygodniu i kalkulację spotkań w runtime frontendowym.
  - [x] Silnik frontendowy operuje w 100% na pre-kalkulowanych danych Kontraktu v1 (`lesson.occurrences[]` w `resolveWeekSchedule` i `getLessonProgress` oraz `entry.dates[]` w `getRoomOccupancyAt`).

- [x] **Krok 3: Synchronizacja i dostosowanie testów**
  - [x] `tests/test_backend.py`: zaktualizowano importy do `sources.umg_wn.*`, `core.ics`, `core.contracts`, `core.cross_ref` i `tenants/umg_wn/events.json`.
  - [x] `tests/test_calendar.js`: zmigrowano testy 1–16, 19, 20, 24b, 25d, 28 na Kontrakt v1 (`occurrences[]`, `dates[]`).
  - [x] `tests/test_cross_reference.js`, `tests/test_events.js`, `tests/test_schedule_engine.js`: zaktualizowano ścieżki i asercje Kontraktu v1.

- [x] **Krok 4: Weryfikacja jakości i buildy**
  - [x] `.venv\Scripts\python.exe tests/test_backend.py` -> 198 passed | 0 failed.
  - [x] `.venv\Scripts\python.exe -m unittest ...` -> 25 passed | 0 failed.
  - [x] `npm test` -> wszystkie 6 zestawów testowych (test_calendar, test_cross_reference, test_schedule_engine, test_events, test_voting, test_lesson_hiding) zakończone z wynikiem 100% PASS.
  - [x] Przebudowano statyczne dystrybucje obu tenantów (`dist/` i `dist_sggw/`).
  - [x] Zcommitowano: `refactor(arch): complete target modular structure and remove legacy shims`.
