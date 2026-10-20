# Szablon Wtyczki i Adaptera Źródła (`sources/_template/`)

Ten katalog służy jako wzorzec implementacji wtyczki adaptera dla nowej uczelni lub wydziału w architekturze Uniplaner multi-tenant.

Kompletna specyfikacja tworzenia wtyczki znajduje się w dokumencie:
👉 **[`docs/specs/adapter-guide.md`](../../docs/specs/adapter-guide.md)**

---

## Szybki start:

1. **Utworzenie modułu adaptera w Pythonie**:
   - Skopiuj `adapter.py` do `sources/<uczelnia_id>/<wydzial_id>/adapter.py`.
   - Zaimplementuj metody `discover()` oraz `fetch_schedule()` zgodnie z protokołem `ScheduleSource`.
   - Zmapuj lokalne formy zajęć na standardowy enum (`lecture`, `exercise`, `lab`, `clinical`, `project`, `elective` itp.).

2. **Utworzenie katalogu konfiguracji i zasobów tenanta**:
   - Utwórz katalog `tenants/<uczelnia_id>/<wydzial_id>/`.
   - Dodaj plik `config.json` z konfiguracją uczelni, form i modułów.
   - Dodaj plik `academic_calendar.json` z oficjalnym kalendarzem akademickim (początek semestru, zamiany dni, święta).
   - Dodaj plik `icon.png` (512×512 px, przezroczyste tło) oraz opcjonalnie `logo.svg`.
   - Dodaj dedykowany arkusz barw `theme.css`.

3. **Budowanie i testowanie**:
   ```powershell
   .venv\Scripts\python.exe -m core.build --tenant <uczelnia_id>/<wydzial_id> --out dist_<id>
   npm test
   .venv\Scripts\python.exe tests/test_backend.py
   ```
