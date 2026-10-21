# Witamy w Wiki projektu Uniplaner 🎓

**Uniplaner** to otwarta, lekka i modułowa platforma Progressive Web App (PWA) przeznaczona do prezentacji planów zajęć dla studentów uczelni wyższych w trybie offline.

Platforma powstała w oparciu o architekturę **multi-tenant**, która rozdziela uniwersalny rdzeń aplikacji od niezależnych wtyczek wydziałowych.

---

## 📚 Spis treści Wiki

1. 🚀 **[Przewodnik tworzenia adaptera](Przewodnik-tworzenia-adaptera)**  
   *Kompletny poradnik krok po kroku jak dodać swój wydział lub uczelnię do Uniplanera.*
2. 🎨 **[Wymagania dotyczące grafik i ikon](Wymagania-dotyczace-grafik)**  
   *Wymiary, formaty, safe-zone i wytyczne dla ikony 512×512 px oraz wektorowego logotypu SVG.*
3. 📋 **[Specyfikacja danych harmonogramu (v1)](Specyfikacja-danych-harmonogramu-(v1))**  
   *Szczegółowy opis formatu danych `RawLesson`, standardowych form zajęć i generowania wystąpień.*
4. ⚙️ **[Konfiguracja tenanta (config.json)](Pliki-i-konfiguracja-tenanta)**  
   *Ustawienia wtyczki, włączanie modułów i konfiguracja routingu zgłoszeń błędów do autora wtyczki.*
5. 📅 **[Kalendarz akademicki](Kalendarz-akademicki)**  
   *Zarządzenia rektorskie, zamiany dni tygodnia (`daySwaps`), przerwy dydaktyczne i sesje.*
6. 🧪 **[Jak testować i wdrażać](Jak-testowac-i-wdrazac)**  
   *Tworzenie testów jednostkowych dla adaptera, jakość kodu i otwieranie Pull Requesta.*

---

## 🏛️ Gotowe wdrożenia referencyjne

Platforma posiada dwa w pełni funkcjonalne adaptery referencyjne, na których możesz się wzorować:

| Uczelnia | Wydział | Typ źródła danych | Katalog adaptera |
| :--- | :--- | :--- | :--- |
| **Uniwersytet Morski w Gdyni** | Wydział Nawigacyjny | System Arktur (HTML) + PDF (zjazdy NST) | `sources/umg/wn/` |
| **Szkoła Główna Gospodarstwa Wiejskiego w Warszawie** | Wydział Medycyny Weterynaryjnej | Harmonogramy roczników (SharePoint Excel) | `sources/sggw/weta/` |

---

## 💡 Masz pytania lub potrzebujesz pomocy?

- Zgłoś problem lub zadaj pytanie w [GitHub Issues](https://github.com/Qu4X/uniplaner/issues) z etykietą `adapter-help`.
- Skorzystaj z gotowego szablonu adaptera w repozytorium: [`sources/_template/`](https://github.com/Qu4X/uniplaner/tree/main/sources/_template).
