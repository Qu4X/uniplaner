# 2. Wyliczanie wystąpień spotkań (occurrences) w Pythonie

Date: 2026-10-19  
Status: Zaakceptowany (Accepted)  

## Kontekst
Dotychczas aplikacja posiadała zduplikowaną logikę interpretacji kalendarza akademickiego (tzw. Kontrakt 2 w `AGENTS.md`):
1. `ics_export.py` w Pythonie podczas budowania statycznego kalendarza wyliczał daty spotkań na podstawie `academic_calendar.json` (uwzględniając `daySwaps`, `holidays`, przerwy i cykle dwutygodniowe).
2. `web/js/schedule-engine.js` w JavaScript podczas działania aplikacji w przeglądarce od nowa implementował tę samą pętlę (`getLessonMeetingInfo`), żeby ustalić, czy w danym tygodniu zajęcia są aktywne i jaki mają numer spotkania.

Prowadziło to do ryzyka cichych rozjazdów pomiędzy widokiem w PWA a wygenerowanym kalendarzem `.ics`, a także zmuszało frontend do trzymania złożonej pętli z ograniczeniami iteracyjnymi i strażnikami.

## Decyzja
1. Przenosimy całą logikę wyznaczania terminów spotkań do backendu w Pythonie (`core/expand.py`).
2. Funkcja `expand_occurrences(lesson, calendar)` na etapie budowania generuje w kontrakcie v1 jawną listę spotkań:
   ```json
   "occurrences": [
     { "date": "2026-10-05", "number": 1, "of": 15 },
     { "date": "2026-10-12", "number": 2, "of": 15 }
   ]
   ```
3. Zarówno generator ICS (`core/ics.py`), jak i frontend (`web/app.js` / `web/js/timeline.js`) stają się czystymi konsumentami tablicy `occurrences`:
   - Generator ICS tworzy komponenty `VEVENT` bezpośrednio z dat w `occurrences`.
   - Frontend sprawdza obecność daty w `occurrences` wybranego tygodnia, bez liczenia cykli, przerw czy zamian dni w runtime.
   - Podgląd dnia bazowego (`baseDayPreview`) dla zamian dni korzysta z pola `day_of_week` bez naliczania numeru spotkania (semantyka D5).

## Konsekwencje
- Eliminujemy całkowicie duplikację reguł kalendarza pomiędzy Pythonem a JavaScriptem (likwidacja Kontraktu 2).
- Zmniejszamy wagę i złożoność frontendu JS o ponad 300 linii kodu.
- Widok w przeglądarce i plik subskrypcji `.ics` mają gwarancję 100% spójności terminów, ponieważ korzystają z dokładnie tych samych wyliczonych danych.
