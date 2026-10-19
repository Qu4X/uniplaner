# Szablon Adaptera Źródła Planu (`sources/_template/`)

Ten katalog służy jako wzorzec implementacji adaptera dla nowej uczelni lub wydziału w architekturze Plan WN multi-tenant.

## Kroki dodania nowej uczelni:

1. **Utworzenie modułu adaptera**:
   - Skopiuj zawartość `sources/_template/` do `sources/<nazwa_uczelni>/`.
   - Zaimplementuj klasę implementującą protokół `ScheduleSource` (`discover` i `fetch_schedule`).
   - Zadbaj o mapowanie form zajęć (`form`) na standardowe wartości enumu: `lecture`, `exercise`, `lab`, `simulator`, `project`, `seminar`, `elective`, `other`.

2. **Konfiguracja tenanta**:
   - Utwórz katalog `tenants/<nazwa_uczelni>/`.
   - Dodaj `config.json` z flagami funkcjonalności i definicją form.
   - Dodaj `academic_calendar.json` zawierający zamiany dni (`daySwaps`), święta (`holidays`) i okresy semestru (`periods`).
   - Opcjonalnie dodaj dedykowany arkusz `theme.css`.

3. **Rejestracja w orkiestratorze**:
   - W `core/build.py` dodaj mapowanie źródeł dla nowego identyfikatora tenanta.

4. **Testy jednostkowe**:
   - Dodaj testy weryfikujące `discover()` i `fetch_schedule()` w `tests/test_<nazwa_uczelni>_adapter.py`.
