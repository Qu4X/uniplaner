# Kalendarz akademicki (`academic_calendar.json`)

Plik `academic_calendar.json` w katalogu `tenants/<id_uczelni>/<id_wydzialu>/` określa okresy zajęć, dni wolne, przerwy dydaktyczne, sesje oraz zarządzenia rektorskie dotyczące zamian dni.

Na jego podstawie Uniplaner wylicza numery spotkań (np. *„spotkanie 3 z 7”*) i informuje studenta o dniach wolnych.

> [!NOTE]
> Plik jest interpretowany niezależnie w kompilatorze (`core/expand.py`, `core/ics.py`) i we frontendzie (`web/js/schedule-engine.js`). Zmiany reguł interpretacji dat należy zawsze sprawdzać w obu miejscach.

---

## 1. Struktura pliku

```json
{
  "daySwaps": {
    "2026-11-10": { "replaceWith": "PT", "note": "Wtorek 10.11 – zajęcia z piątku" },
    "2027-01-05": { "replaceWith": "PON", "note": "Wtorek 05.01 – zajęcia z poniedziałku" }
  },

  "holidays": {
    "2026-11-01": "Wszystkich Świętych",
    "2026-11-11": "Święto Niepodległości",
    "2027-01-01": "Nowy Rok",
    "2027-01-06": "Święto Trzech Króli"
  },

  "periods": [
    { "name": "Okres zajęć dydaktycznych – semestr zimowy", "type": "teaching", "start": "2026-10-01", "end": "2027-01-29" },
    { "name": "Zimowa przerwa świąteczna", "type": "break", "start": "2026-12-21", "end": "2027-01-03" },
    { "name": "Sesja egzaminacyjna zimowa", "type": "exam", "start": "2027-01-30", "end": "2027-02-12" }
  ]
}
```

Szczegółowy opis pozostałych kluczy (np. `half_boundaries`) znajduje się na stronie [Pliki i konfiguracja tenanta](Pliki-i-konfiguracja-tenanta).

---

## 2. Sekcje kalendarza

### Okresy (`periods`)
Lista przedziałów dat. Pole `type` przyjmuje wartości:
- `teaching` — okres zajęć dydaktycznych (pierwszy i ostatni dzień, w którym odbywają się zajęcia z siatki),
- `break` — przerwa dydaktyczna (wielodniowy okres bez zajęć, np. przerwa świąteczna),
- `exam` — sesja egzaminacyjna.

Daty `start` i `end` obejmują oba dni graniczne. Po zakończeniu okresu `teaching` licznik spotkań jest zatrzymywany i aplikacja nie dodaje kolejnych spotkań.

### Dni wolne (`holidays`)
Słownik pojedynczych dni wolnych od zajęć w formacie `"YYYY-MM-DD": "Nazwa"`: święta państwowe i kościelne oraz dni wolne ustanowione przez rektora.
W te dni zajęcia nie są planowane, a numeracja spotkań danego przedmiotu nie zwiększa się.

### Zamiany dni (`daySwaps`)
Mechanizm odwzorowujący zarządzenia rektorskie o zmianie dnia realizacji zajęć. Pole `replaceWith` wskazuje dzień bazowy planu, według którego odbywają się zajęcia. Dopuszczalne kody dni: `"PON"`, `"WT"`, `"ŚR"`, `"CZW"`, `"PT"`, `"SOB"`, `"ND"`. Pole `note` zawiera opis widoczny dla studenta.

Przykład zarządzenia:
> *„We wtorek 10 listopada zajęcia odbywają się według planu piątkowego”*

Odpowiada mu wpis:
```json
"daySwaps": {
  "2026-11-10": { "replaceWith": "PT", "note": "Wtorek 10.11 – zajęcia z piątku" }
}
```

**Skutki zamiany:**
1. W dniu 10 listopada aplikacja pokazuje siatkę zajęć z piątku.
2. Numer spotkania zwiększa się dla przedmiotów piątkowych.
3. Przedmioty wtorkowe nie tracą numeracji.
4. Eksport `.ics` oraz subskrypcja `webcal://` od razu uwzględniają zamianę w kalendarzach Google i Apple.
