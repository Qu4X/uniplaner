# GEMINI.md — Plan WN

Instrukcje dla modeli Gemini / Antigravity pracujących w tym repozytorium.

Głównym, kanonicznym źródłem zasad i architektury jest **[AGENTS.md](AGENTS.md)**.
Przed rozpoczęciem pracy przeczytaj:
1. **[AGENTS.md](AGENTS.md)** — zasady commitowania, krytyczne kontrakty Python ↔ JS, strefy chronione i wymagania testowe.
2. **[CONTEXT.md](CONTEXT.md)** — słownik pojęć domenowych (Spotkanie, Zamiana dnia, Dzień bazowy, Przerwa dydaktyczna).

---

## Najważniejsze zasady w skrócie
- **Architektura modułowa (multi-tenant)**: Zawsze zachowuj podział na `core/` (logika i kontrakty niezależne od uczelni), `sources/<tenant>/` (adaptery danych), `tenants/<tenant>/` (konfiguracja, motyw, kalendarz) oraz `web/js/modules/` (moduły UI sterowane z `tenant_config.features`). Nigdy nie zaszywaj logiki specyficznej dla uczelni w `core/` ani `web/`.
- **Testy**: Uruchamiaj `.venv\Scripts\python.exe tests/test_backend.py`, `.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py"` oraz `npm test` przed i po każdej zmianie. Wszystkie muszą być zielone.
- **Brak nowych zależności**: Nie dodawaj bibliotek do `requirements.txt` (poza zatwierdzonymi: `requests`, `beautifulsoup4`, `icalendar`, `pdfplumber`, `openpyxl`) ani `package.json` bez wyraźnej zgody właściciela.
- **Pliki konfiguracyjne**: Nie modyfikuj samodzielnie `data/academic_calendar.json`, `data/subjects_manual.json` ani `TODO.md`.
- **Styl**: Dokumentacja po polsku, identyfikatory i commity po angielsku (Conventional Commits).
