# 1. Modułowe źródła danych i architektura multi-tenant (Ports & Adapters)

Date: 2026-10-19  
Status: Zaakceptowany (Accepted)  

## Kontekst
Aplikacja Plan WN powstała z myślą o Wydziale Nawigacyjnym Uniwersytetu Morskiego w Gdyni. Cała logika pobierania danych, parsowania HTML z systemu Arktur, klasyfikacji form zajęć oraz generowania plików statycznych była skupiona w jednym monolicie (`build_static.py` ~900 linii, `web/app.js` ~2700 linii).
Równolegle powstał niezależny fork dla SGGW (`plan_sggw`), w którym wprowadzono pobieranie planów z arkuszy Excel (`.xlsx`) z usługi SharePoint, personalizowane ukrywanie fakultetów oraz moduł społecznościowego głosowania nad przesunięciami zajęć.

Celem projektu jest przekształcenie repozytorium w silnik open-source (FOSS) obsługujący wiele wydziałów i uczelni z jednego kodu źródłowego, bez duplikowania logiki i bez wycieku wiedzy o konkretnej uczelni do wspólnego rdzenia.

## Decyzja
1. Wprowadzamy architekturę portów i adapterów (Hexagonal / Ports & Adapters):
   - `ScheduleSource` (protokół w `sources/base.py`) definiuje wspólny szew dla adapterów: `discover()` (pobieranie metadanych i tokena wersji) oraz `fetch_schedule()` (zwracanie `RawLesson`).
   - Rdzeń (`core/`) odpowiada za walidację kontraktu v1, deterministyczne hashowanie identyfikatorów zajęć, wyliczanie wystąpień spotkań (`occurrences`) oraz zapis do statycznego JSON i ICS.
2. Wydzielamy katalogi tenanta (`tenants/<tenant_id>/`):
   - Izolacja konfiguracji (`config.json`), kalendarza akademickiego (`academic_calendar.json`), wydarzeń (`events.json`), stylów i manifestu PWA per uczelnia/wydział.
3. Frontend staje się bezstanowym konsumentem kontraktu danych v1:
   - Czyta ujednolicone pliki `schedules/{plan_id}_{group}.json`.
   - Moduły opcjonalne (wyszukiwarka cross-reference, ukrywanie zajęć, głosowanie Supabase, wydarzenia, changelog) są ładowane jako moduły ES i włączane deklaratywnie przez flagi z `config.json` tenanta.

## Konsekwencje
- Dodanie nowej uczelni lub wydziału sprowadza się do napisania jednego adaptera w `sources/` oraz utworzenia katalogu w `tenants/`, bez modyfikacji wspólnego rdzenia.
- Zmiana struktury HTML Arktura lub formatu Excela SGGW dotyka wyłącznie odpowiedniego adaptera.
- Rdzeń i frontend są w pełni pokryte testami jednostkowymi niezależnymi od sieci i formatu źródłowego uczelni.
