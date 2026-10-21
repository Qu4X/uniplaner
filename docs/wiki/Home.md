# Wiki projektu Uniplaner

**Uniplaner** to otwarta, lekka i modułowa platforma PWA do prezentowania planów zajęć studentom, także w trybie offline.

Platforma ma architekturę wielodzierżawczą (*multi-tenant*): uniwersalny rdzeń aplikacji jest oddzielony od niezależnych adapterów wydziałowych.

---

## Spis treści

1. **[Przewodnik tworzenia adaptera](Przewodnik-tworzenia-adaptera)**  
   *Instrukcja krok po kroku, jak dodać do Uniplanera własny wydział lub uczelnię.*
2. **[Wymagania dotyczące grafik i ikon](Wymagania-dotyczace-grafik)**  
   *Wymiary, formaty, strefa bezpieczna i wytyczne dla ikony 512×512 px.*
3. **[Specyfikacja danych harmonogramu (v1)](Specyfikacja-danych-harmonogramu-(v1))**  
   *Opis formatu `RawLesson`, standardowych form zajęć i generowania wystąpień spotkań.*
4. **[Konfiguracja tenanta (config.json)](Konfiguracja-tenanta-(config.json))**  
   *Ustawienia adaptera, włączanie modułów i kierowanie zgłoszeń błędów do autora adaptera.*
5. **[Pliki i konfiguracja tenanta](Pliki-i-konfiguracja-tenanta)**  
   *Przegląd wszystkich plików tenanta: konfiguracja, kalendarz, ikona, motyw, aliasy, dziennik zmian i wydarzenia.*
6. **[Kalendarz akademicki](Kalendarz-akademicki)**  
   *Zarządzenia rektorskie, zamiany dni (`daySwaps`), przerwy dydaktyczne i sesje.*
7. **[Jak testować i wdrażać](Jak-testowac-i-wdrazac)**  
   *Testy jednostkowe adaptera, wymagania jakościowe i zgłaszanie Pull Requesta.*

---

## Wdrożenia referencyjne

Repozytorium zawiera dwa w pełni działające adaptery, które mogą służyć jako wzór:

| Uczelnia | Wydział | Typ źródła danych | Katalog adaptera |
| :--- | :--- | :--- | :--- |
| **Uniwersytet Morski w Gdyni** | Wydział Nawigacyjny | System Arktur (HTML) i PDF (zjazdy NST) | `sources/umg/wn/` |
| **Szkoła Główna Gospodarstwa Wiejskiego w Warszawie** | Wydział Medycyny Weterynaryjnej | Harmonogramy roczników (Excel w SharePoint) | `sources/sggw/weta/` |

---

## Pytania i pomoc

- Zgłoś problem lub zadaj pytanie w [GitHub Issues](https://github.com/Qu4X/uniplaner/issues), używając etykiety `adapter-help`.
- Skorzystaj z szablonu adaptera: [`sources/_template/`](https://github.com/Qu4X/uniplaner/tree/main/sources/_template).
