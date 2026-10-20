# Kalendarz akademicki (`academic_calendar.json`) 📅

Plik `academic_calendar.json` w katalogu `tenants/<id_uczelni>/<id_wydzialu>/` definiuje ramy czasowe semestru, dni wolne od zajęć, przerwy świąteczne oraz zarządzenia rektorskie o zamianach dni tygodnia.

Dzięki temu kalendarzowi Uniplaner precyzyjnie wylicza numery spotkań (np. *„spotkanie 3 z 7”*) i ostrzega studenta przed dniami wolnymi.

---

## 1. Kompletna struktura `academic_calendar.json`

```json
{
  "semester": "zimowy_2026_2027",
  "teaching_period": {
    "start": "2026-10-01",
    "end": "2027-01-29"
  },

  "holidays": [
    "2026-11-01",
    "2026-11-11",
    "2027-01-01",
    "2027-01-06"
  ],

  "breaks": [
    {
      "name": "Przerwa świąteczna",
      "from": "2026-12-23",
      "to": "2027-01-03"
    },
    {
      "name": "Przerwa międzysemestralna",
      "from": "2027-02-13",
      "to": "2027-02-19"
    }
  ],

  "daySwaps": {
    "2026-11-10": "FRI",
    "2027-01-05": "MON"
  },

  "exam_sessions": [
    {
      "name": "Zimowa sesja egzaminacyjna",
      "from": "2027-01-30",
      "to": "2027-02-12"
    }
  ]
}
```

---

## 2. Kluczowe sekcje kalendarza

### Okres zajęć dydaktycznych (`teaching_period`)
Określa pierwszy i ostatni dzień, w którym odbywają się regularne zajęcia z siatki.
- Po dacie `end` licznik spotkań jest automatycznie zamrażany — aplikacja wie, że rozpoczął się okres sesyjny i nie dodaje fałszywych spotkań.

### Dni wolne (`holidays`)
Pojedyncze daty (`YYYY-MM-DD`) wolne od zajęć (święta państwowe, kościelne, Dzień Rektorski).
W te dni zajęcia nie są planowane, a numeracja spotkań dla danego przedmiotu nie ulega zwiększeniu.

### Przerwy dydaktyczne (`breaks`)
Wielodniowe okresy bez zajęć (np. ferie zimowe, przerwa wielkanocna, przerwa bożonarodzeniowa).
Zakres definiuje się od `from` do `to` (włącznie).

### Zamiany dni rektorskie (`daySwaps`)
Najważniejsza i najbardziej unikalna funkcja platformy **Uniplaner**!

Gdy rektor ogłasza zarządzenie:  
> *„W czwartek 10 listopada zajęcia odbywają się według planu piątkowego”*

Definiujesz wpis w obiekcie `daySwaps`:
```json
"daySwaps": {
  "2026-11-10": "FRI"
}
```

**Co dzieje się automatycznie:**
1. W dniu 10 listopada studenci widzą w aplikacji siatkę zajęć z piątku.
2. Zostaje naliczony numer spotkania dla przedmiotów piątkowych.
3. Przedmioty czwartkowe nie tracą kolejki.
4. Eksport kalendarza `.ics` oraz subskrypcja na żywo `webcal://` natychmiast uwzględniają tę zamianę w kalendarzach Google i Apple!
