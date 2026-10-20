# Uniplaner

Słownik pojęć domenowych dla platformy Uniplaner — systemu obsługi i prezentacji planów zajęć uczelni wyższych.

## Kalendarz i Dni

**Dzień kalendarzowy**:
Konkretna data w kalendarzu (np. 18 grudnia 2026), reprezentująca faktyczny dzień roku.
_Avoid_: Data planu, dzień.

**Dzień bazowy planu**:
Dzień tygodnia, do którego zajęcia są na stałe przypisane w siatce planu uczelni (np. ŚRODA).
_Avoid_: Dzień zajęć, dzień tygodnia.

**Dzień realizowany**:
Dzień tygodnia, według którego planu faktycznie odbywają się zajęcia w danej dacie po uwzględnieniu decyzji rektora.
_Avoid_: Dzień zastępczy, dzień efektywny, zamiana.

**Zamiana dnia**:
Zarządzenie rektorskie nakazujące realizację w danym dniu kalendarzowym zajęć z innego dnia bazowego planu.
_Avoid_: Odrobienie, przesunięcie, odpracowanie.

**Podgląd dnia bazowego**:
Informacyjny widok oryginalnej siatki zajęć dla dnia kalendarzowego z zamianą rektorską, służący wyłącznie jako podgląd sal i godzin bez naliczania numeru spotkania.
_Avoid_: Podgląd piątku, stary plan, tryb nieoficjalny.


**Dzień wolny**:
Dzień kalendarzowy wyłączony z realizacji zajęć dydaktycznych (święto państwowe, kościelne lub dzień rektorski).
_Avoid_: Wolne, przerwa.

**Przerwa dydaktyczna**:
Ciągły wielodniowy okres w roku akademickim wolny od zajęć dydaktycznych (np. przerwa świąteczna, międzysemestralna).
_Avoid_: Wakacje, ferie, urlop.

**Okres zajęć dydaktycznych**:
Część semestru przeznaczona na regularne prowadzenie zajęć z siatki planu, trwająca od pierwszego dnia nauki do dnia poprzedzającego sesję egzaminacyjną.
_Avoid_: Semestr, okres nauki, czas trwania semestru.

**Sesja egzaminacyjna**:
Okres w roku akademickim następujący bezpośrednio po okresie zajęć dydaktycznych, przeznaczony na egzaminy i zaliczenia końcowe, wyłączony z regularnej siatki zajęć.
_Avoid_: Sesja, okres egzaminów.

## Jednostki i Czas Zajęć

**Spotkanie**:
Pojedynczy, zaplanowany w siatce blok czasowy danych zajęć w określonym dniu kalendarzowym, niezależnie od liczby trwających godzin akademickich (np. blok 90 min lub 180 min to 1 spotkanie).
_Avoid_: Zjazd, lekcja, godzina, tydzień.

**Numer spotkania**:
Kolejny numer zrealizowanego lub planowanego spotkania danej grupy z danego przedmiotu (np. 4. z 7 zaplanowanych spotkań).
_Avoid_: Tydzień zajęć, numer tygodnia, numer zjazdu.

**Tydzień semestru**:
Kolejny kalendarzowy tydzień trwania semestru dydaktycznego liczony od daty rozpoczęcia semestru.
_Avoid_: Tydzień przedmiotu, tydzień planu.

**Początek cyklu**:
Tydzień semestru, w którym odbywa się pierwsze spotkanie dla zajęć cyklicznych (np. tydzień 1 lub 2).
_Avoid_: Parzystość, tydzień A, tydzień B.

**Interwał cyklu**:
Liczba tygodni pomiędzy kolejnymi spotkaniami z tego samego przedmiotu (np. 2 dla zajęć odbywających się co dwa tygodnie).
_Avoid_: Co ile, co drugi tydzień.

**Połowa semestru**:
Wydzielona część semestru przeznaczona na realizację przedmiotów o skróconym wymiarze (zazwyczaj 1. połowa to 7 spotkań, 2. połowa to 8 spotkań).
_Avoid_: Półsemestr, moduł, turnus.

## Formy Zajęć i Grupy

**Forma zajęć**:
Typ dydaktyczny zajęć określający sposób ich prowadzenia (wykład, ćwiczenia audytoryjne, laboratorium, projekt, seminarium).
_Avoid_: Typ zajęć, rodzaj zajęć.

**Grupa laboratoryjna**:
Najmniejsza, podstawowa jednostka studencka realizująca zajęcia wymagające małych grup (laboratoria, pracownie komputerowe).
_Avoid_: Podgrupa, grupa mała.

**Grupa ćwiczeniowa**:
Grupa studencka utworzona z połączenia zazwyczaj dwóch grup laboratoryjnych na potrzeby ćwiczeń tablicowych lub audytoryjnych.
_Avoid_: Grupa średnia, grupa łączona.

**Grupa kierunkowa**:
Zbiorcza grupa obejmująca wszystkich studentów danego kierunku i rocznika, uczestnicząca wspólnie w wykładach.
_Avoid_: Cały rok, grupa wykładowa, audytorium.

**Zajęcia zdalne**:
Forma prowadzenia zajęć w przestrzeni wirtualnej bez przydziału stacjonarnej sali dydaktycznej (oznaczana w planie symbolem OL).
_Avoid_: Zajęcia online, e-learning, brak sali.

## Integracja i Dystrybucja

**Subskrypcja kalendarza**:
Dynamiczne połączenie za pośrednictwem protokołu `webcal://`, zapewniające automatyczne odświeżanie terminów zajęć w zewnętrznym kalendarzu użytkownika (np. Google Calendar, Apple Calendar).
_Avoid_: Eksport, synchronizacja planu, dodanie do kalendarza.

**Plik kalendarza**:
Statyczny plik w formacie iCalendar (`.ics`), reprezentujący jednorazową migawkę terminów zajęć w chwili pobrania, bez możliwości automatycznych aktualizacji.
_Avoid_: Zrzut planu, backup kalendarza, eksport offline.


## Tryby Studiów i Formaty Danych

**Studia stacjonarne**:
Kształcenie w trybie dziennym (od poniedziałku do piątku). Harmonogram bazuje na powtarzalnej tygodniowej siatce planu (`PON`, `WT`, `ŚR`, `CZW`, `PT`), z uwzględnieniem cykli dwutygodniowych, połówek semestru oraz zarządzeń rektorskich o zamianach dni.
_Avoid_: Studia dzienne.

**Studia niestacjonarne (NST)**:
Kształcenie w trybie zaocznym (weekendowe zjazdy: piątek popołudnie, sobota, niedziela). Harmonogram definiowany jest wyłącznie konkretnymi datami kalendarzowymi ISO (`YYYY-MM-DD`) w publikowanych plikach PDF, bez tygodniowej siatki bazowej.
_Avoid_: Studia zaoczne, zaoczni.

**Plan zjazdowy (format ISO)**:
Struktura danych planu niestacjonarnego, w której kluczami są konkretne daty (`YYYY-MM-DD`), a nie nazwy dni tygodnia. **Zarządzenia rektorskie o zamianach dni (`daySwaps`) NIE mają zastosowania do planów NST**.
_Avoid_: Plan datowany, kalendarz zjazdów.

## Powiązania i Obłożenie (Cross-Reference)

**Indeks powiązań (Cross-Reference)**:
Zagregowana, zdeduplikowana baza relacji wygenerowana ze wszystkich planów danego tenanta (`cross_reference.json`), mapująca powiązania między salami, wykładowcami, przedmiotami i grupami.
_Avoid_: Baza danych, indeks globalny.

**Globalne obłożenie sal**:
Weryfikacja dostępności sal w czasie rzeczywistym na podstawie zagregowanych danych ze wszystkich planów uczelni (`getRoomOccupancyAt`), z uwzględnieniem cykli, przerw i zamian rektorskich.
_Avoid_: Wolne sale, sprawdzarka sal.

## Architektura Modularna i Multi-Tenant

**Tenant (Najemca / Instancja wydziałowa)**:
Wyodrębniona konfiguracja dla konkretnego wydziału lub uczelni (`tenants/<tenant_id>/`), zawierająca własny kalendarz akademicki, motyw wizualny, konfigurację włączonych modułów (`config.json`) oraz manifest PWA.
_Avoid_: Klient, profil, środowisko.

**Adapter źródła (Schedule Source Adapter)**:
Moduł w katalogu `sources/` implementujący protokół `ScheduleSource`, odpowiedzialny za pobieranie i parsowanie surowych danych o planach zajęć z konkretnego systemu uczelni (np. HTML Arktur, arkusz Excel z SharePoint, PDF) i mapowanie ich na ujednolicony format `RawLesson`.
_Avoid_: Scraper, parser uczelniany, importer.

**Token wersji (Version Token)**:
Ciąg znaków jednoznacznie identyfikujący wersję publikacji planu (np. data i numer wersji z Arktura lub skrót SHA-256 pobranego pliku arkusza), wykorzystywany przez detektor zmian (`core/detector.py`) do unikania zbędnego przetwarzania niezmienionych planów.
_Avoid_: Hash, wersja planu, znacznik czasu.

**Wystąpienie (Occurrence)**:
Pojedyncza, konkretna data kalendarzowa (`date`), w której odbywa się dane spotkanie z siatki, wyliczona deterministycznie przez backend (`core/expand.py`) z przypisanym numerem spotkania (`number` z `of`), z uwzględnieniem dni wolnych, przerw dydaktycznych i zarządzeń rektorskich o zamianach dni.
_Avoid_: Zjazd, termin lekcji, slot datowany.

## Granice systemu / Scope & Constraints

**Zakres wydziałowy (Faculty Scope)**:
W architekturze modularnej każdy tenant definiuje swój własny zakres. Dla tenanta `umg/wn` obsługiwane są plany Wydziału Nawigacyjnego UMG z systemu arktur.umg.edu.pl/planyzaj/. Nowe wydziały lub uczelnie są dołączane jako niezależne tenanty i adaptery bez ingerencji w kod źródłowy istniejących wydziałów.
_Avoid_: Hardkodowanie wydziałów w silniku, brak grup WE/WM jako błąd.
