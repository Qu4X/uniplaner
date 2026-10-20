# Audyt Zgodności ze Standardami Branżowymi (Senior Engineer & Mentor Review)

---

## 1. Werdykt

Projekt Plan WN jest **bardzo udaną, przemyślaną aplikacją hobbystyczną**, która w kluczowych aspektach (użyteczność dla studentów, działanie offline, brak zbędnego narzutu frameworków) przewyższa oficjalne rozwiązania uczelniane. Zastosowanie wzorca Jamstack na GitHub Pages z generatorem statycznym w Pythonie oraz czystym Vanilla JS jest dla tej skali optymalnym i dojrzałym wyborem architektonicznym. 

Największe luki, które wymagają interwencji, to:
1. **Ryzyko awarii wdrożenia w CI (Silent Failure)**: Jeśli uczelnia zmieni strukturę HTML lub Arktur przestanie odpowiadać w trakcie pętli pobierania, `build_static.py` po cichu zapisze pusty zestaw planów, a workflow GitHub Actions bezwzględnie wdroży zepsuty stan na GitHub Pages, niszcząc bazę planów dla użytkowników.
2. **Podwójny powrót karetki (CRLF Injection / Corrupted Line Endings)** w plikach `.ics` pod Windows: Zapis zdekodowanego tekstu `cal.to_ical()` w trybie tekstowym `open(..., "w")` powoduje zamianę `\r\n` na `\r\r\n`, co narusza RFC 5545 i może powodować błędy importu w niektórych kalendarzach.
3. **Potencjalne podatności DOM XSS w warstwie UI**: Zmienna `state.selectedGroup` jest wstrzykiwana bezpośrednio do `innerHTML` w komunikacie błędu (`app.js:1124`), a parametr URL w module wydarzeń (`events-service.js:282`) przypisuje `linkEl.href = event.url` bez walidacji schematu protokołu (`javascript:`).
4. **Brak polityki retencji poprzedniej wersji bazy planów**: Ponieważ katalog `dist/` jest generowany od zera w ulotnym kontenerze CI, awaria sieciowa oznacza utratę bazy danych offline dla nowych użytkowników.

Dla końcowego studenta ryzyko w obecnej chwili jest **niskie do umiarkowanego** (aplikacja działa stabilnie, dopóki format uczelni się nie zmieni i nikt nie doda złośliwego linku w zgłoszeniu wydarzenia).

---

## 2. Karta wyników

| Obszar | Ocena | Najważniejsza uwaga |
| :--- | :---: | :--- |
| **1. Struktura repozytorium** | 🟡 Częściowo | Czysty podział domenowy `data/`, `web/`, `tests/`, ale brak pliku `.editorconfig`, a w repozytorium znajduje się fixture testowy o wadze 2.4 MB. |
| **2. Pliki dla agentów i dokumentacja** | ✅ Zgodny | Kompletny zestaw instrukcji: `AGENTS.md` (zaktualizowany o 4 zestawy testów), nowy `GEMINI.md` oraz `CONTRIBUTING.md`. |
| **3. Python** | 🟡 Częściowo | Brak atomowego zapisu plików, brak walidacji minimalnej liczby grup przed zakończeniem buildu, podwójne CRLF w `.ics` (`\r\r\n`) i 225 ostrzeżeń lintera (głównie nieposortowane importy i brakujące type hinty). |
| **4. JavaScript** | 🟡 Częściowo | Przemyślana modułowość (wyodrębniony czysty silnik `schedule-engine.js`), ale `app.js` pełni rolę "God Object" (2340 linii) i miesza logikę stanu z manipulacją DOM. |
| **5. Bezpieczeństwo (OWASP)** | 🟡 Częściowo | Brak Content Security Policy (CSP), brak walidacji schematu `event.url` (`javascript:`) oraz jedna niezaescapowana zmienna w `innerHTML`. |
| **6. PWA i Service Worker** | ✅ Zgodny | Poprawna strategia *Network-First* z fallbackiem do cache, `skipWaiting()` i `clients.claim()`. Wzorcowy manifest PWA z maskowalnymi ikonami. |
| **7. HTML/CSS i dostępność (WCAG)** | 🟡 Częściowo | Zastosowano natywne semantyczne tagi `<dialog>`, ale zakładki dni nie mają semantyki ARIA (`role="tablist"` / `aria-selected`), a atrybut `closedby="any"` wymaga czujności w Safari. |
| **8. Testy** | ✅ Zgodny | Bardzo wysoka kultura testowa (193 testy w Pythonie, 4 autonomiczne zestawy w Node.js, 100% PASS), świetne testy regresyjne. Brak jedynie formalnego frameworka (pytest/vitest). |
| **9. CI/CD** | 🟡 Częściowo | Dobre reguły uprawnień i testy przed buildem, ale brak bramki bezpieczeństwa uniemożliwiającej publikację pustego katalogu `dist/` w razie awarii scrapera. |
| **10. Dane** | ✅ Zgodny | Eleganckie oddzielenie konfiguracji rektorskiej (`academic_calendar.json`) od kodu. Prawidłowa normalizacja i małe rozmiary plików konfiguracyjnych. |
| **11. Prywatność** | ✅ Zgodny | Anonimowa analityka GoatCounter bez ciasteczek (GDPR/RODO compliant), brak zbierania telemetrii o studentach. |

---

## 3. Szczegóły per obszar

### Obszar 1: Struktura repozytorium
* **Standard**: Przejrzysta struktura katalogów rozdziela kod źródłowy, konfigurację, dane wejściowe i artefakty budowania. Artefakty generowane (`dist/`) oraz środowiska wirtualne (`.venv/`) muszą być wykluczone w `.gitignore`. Spójność kodowania znaków i końców linii zapewnia `.editorconfig`.
* **Źródło**: [Pro Git Guide: .gitignore](https://git-scm.com/docs/gitignore), [EditorConfig Specification](https://editorconfig.org/).
* **Ocena**: 🟡 Częściowo.
* **Uwagi**:
  1. `tests/strpza6_response.txt` (linia 1) ma 2.38 MB i jest śledzony w gicie. Choć służy jako hermetyczna atrapa HTML, powiększa historię repozytorium.
  2. Brak pliku `.editorconfig`, co przy współpracy na Windowsie i Linuksie prowadzi do konfliktów CRLF vs LF.
* **Przed → Po**:
  ```ini
  # Przed: brak .editorconfig
  # Po (dodaj .editorconfig w root):
  root = true
  [*]
  indent_style = space
  indent_size = 2
  end_of_line = lf
  charset = utf-8
  trim_trailing_whitespace = true
  insert_final_newline = true
  [*.py]
  indent_size = 4
  ```

---

### Obszar 2: Pliki dla agentów i dokumentacja
* **Standard**: Narzędzia AI i kontrybutorzy potrzebują jednoznacznego, zwięzłego opisu architektury, procedur uruchomieniowych oraz twardych ograniczeń.
* **Źródło**: Standardy projektów open source, [GitHub Community Guidelines: CONTRIBUTING.md](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/setting-guidelines-for-repository-contributors).
* **Ocena**: ✅ Zgodny.
* **Uwagi**:
  - `AGENTS.md` istniał i zawierał precyzyjne reguły (krytyczne kontrakty, strefy chronione). W wierszu 34 zaktualizowano liczbę zestawów testów (4 zamiast 3).
  - Utworzono brakujący `GEMINI.md` jako lekki wskaźnik na `AGENTS.md`.
  - Utworzono brakujący `CONTRIBUTING.md` opisujący reguły wnoszenia wkładu, instalację i konwencję commitów.

---

### Obszar 3: Python
* **Standard**: Zgodność z PEP 8, niezawodna obsługa sieci (timeouty, retry), atomowy zapis plików na dysku (`write to temp + atomic replace`), oraz ścisła zgodność formatu kalendarza z RFC 5545.
* **Źródło**: [PEP 8](https://peps.python.org/pep-0008/), [RFC 5545 (iCalendar)](https://datatracker.ietf.org/doc/html/rfc5545#section-3.1).
* **Ocena**: 🟡 Częściowo.
* **Uwagi**:
  1. **Podwójny znak końca linii w plikach `.ics` pod Windows**: [`build_static.py:454`](build_static.py#L454) oraz [`ics_export.py:186`](ics_export.py#L186). Biblioteka `icalendar` generuje tekst z końcami linii `\r\n` (CRLF) zgodnie z RFC 5545. Następnie funkcja `generuj_ics` dekoduje bajty do stringa, a `build_static.py` otwiera plik w trybie tekstowym `open(..., "w")`. W systemie Windows pythonowski wrapper tekstu tłumaczy każde `\n` na systemowe `\r\n`, zamieniając istniejące `\r\n` na `\r\r\n`! Weryfikacja binarna wykazała obecność `\r\r\n` w wyjściowych plikach.
  2. **Nieatomowy zapis**: Zapis bezpośrednio do pliku docelowego `with open(json_path, "w")` grozi uszkodzeniem pliku, jeśli proces zostanie przerwany w połowie zapisu.
  3. **Brak przypiętych wersji w requirements.txt**: [`requirements.txt`](requirements.txt) zawiera surowe nazwy pakietów bez wersji (`requests`, `beautifulsoup4`, `icalendar`, `pdfplumber`), co stwarza ryzyko nagłego wyłożenia buildu w CI po wydaniu niekompatybilnej wersji biblioteki.
* **Przed → Po**:
  ```python
  # Przed (build_static.py:454):
  ics_text = generuj_ics(dane_plaskie, grupa)
  with open(ics_path, "w", encoding="utf-8") as icsf:
      icsf.write(ics_text)

  # Po (zapis binarny zapobiegający podwójnemu CRLF w Windowsie):
  ics_bytes = cal.to_ical() # bez dekodowania do tekstu
  with open(ics_path, "wb") as icsf:
      icsf.write(ics_bytes)
  ```

---

### Obszar 4: JavaScript
* **Standard**: Rozdzielenie odpowiedzialności: moduły domenowe (czyste obliczenia bez DOM), moduły danych (pobieranie i cache) oraz kontrolery widoku. Izolacja listenerów zdarzeń zapobiegająca wyciekom pamięci.
* **Źródło**: [MDN: JavaScript Modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules), [Clean Architecture in Frontend](https://martinfowler.com/articles/modular-front-end.html).
* **Ocena**: 🟡 Częściowo.
* **Uwagi**:
  1. `web/app.js` ma ponad 2340 linii kodu i pełni rolę "God Object". Zarządza routingiem, motywami, widokiem kalendarza, PWA, powiadomieniami changelog oraz integracją z zewnętrznymi formularzami.
  2. Znakomitym wzorcem jest wydzielony plik `web/js/schedule-engine.js` (433 linie), który jest w 100% czystym silnikiem domenowym, w pełni testowalnym w Node.js. Warto pójść tym śladem i wydzielić z `app.js` moduł `calendar-ui.js` oraz `theme-manager.js`.
  3. Wszystkie skrypty używają archaicznego wzorca UMD / fabryki `(function(root, factory){...})` zamiast nowoczesnych modułów ES (`type="module"`), ze względu na chęć uruchamiania testów przez `require()` w Node.
* **Przed → Po**:
  ```javascript
  // Przed (web/app.js:150-165) - globalny stan wymieszany z selekcją DOM:
  const state = { plansData: null, studyMode: ... };
  const elements = typeof document !== "undefined" ? { ... } : {};

  // Po (podział na mniejsze moduły z parametrem stanu):
  export function createScheduleView({ container, onDateChange }) { ... }
  ```

---

### Obszar 5: Bezpieczeństwo (OWASP dla aplikacji statycznych)
* **Standard**: Zgodnie z wytycznymi OWASP Top 10 (A03:2021 - Injection), żadne dane pochodzące z zewnątrz (skrapowane ze stron trzecich, odczytane z URL, z formularzy GitHub Issue czy localStorage) nie mogą trafiać do DOM bez uprzedniej sanityzacji.
* **Źródło**: [OWASP Cross-Site Scripting Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html).
* **Ocena**: 🟡 Częściowo.
* **Uwagi**:
  1. **DOM XSS w komunikacie błędu**: [`web/app.js:1124`](web/app.js#L1124):
     `elements.loadingState.innerHTML = '<p>Brak danych planu dla grupy ' + state.selectedGroup + '.</p>';`
     Zmienna `state.selectedGroup` nie jest przepuszczona przez `escapeHtml()`.
  2. **Podatność URL Scheme Injection**: [`web/js/events-service.js:282`](web/js/events-service.js#L282):
     `linkEl.href = event.url;`
     Plik `data/events.json` jest aktualizowany automatycznie przez workflow GitOps na podstawie zgłoszeń z formularza GitHub Issues (`process_event_issue.yml`). Jeśli ktoś poda jako link `javascript:alert(document.cookie)`, kliknięcie przycisku przez studenta uruchomi dowolny skrypt.
  3. **Brak Content Security Policy (CSP)**: W `web/index.html` brakuje nagłówka `<meta http-equiv="Content-Security-Policy">`.
* **Przed → Po**:
  ```javascript
  // Przed (events-service.js:282):
  if (event.url) {
    linkEl.href = event.url;
  }

  // Po (walidacja bezpiecznego protokołu):
  if (event.url && /^https?:\/\//i.test(event.url.trim())) {
    linkEl.href = event.url.trim();
  } else {
    linkEl.removeAttribute("href");
  }
  ```

---

### Obszar 6: PWA i Service Worker
* **Standard**: PWA musi zapewniać niezawodne działanie offline dla odwiedzonych zasobów, przewidywalny przepływ aktualizacji oraz poprawny plik Web App Manifest zgodny ze standardem W3C.
* **Źródło**: [web.dev: Service Worker lifecycle](https://web.dev/service-worker-lifecycle/), [W3C Web App Manifest](https://www.w3.org/TR/appmanifest/).
* **Ocena**: ✅ Zgodny.
* **Uwagi**:
  1. Strategia `network-first` z fallbackiem do cache w [`web/sw.js:50-61`](web/sw.js#L50-L61) gwarantuje, że student z dostępem do internetu zawsze pobierze najświeższy plan, a w piwnicy lub na statku bez zasięgu aplikacja natychmiast załaduje ostatnią zapisaną wersję.
  2. Prawidłowa synchronizacja wersji: `scripts/sync_version.py` automatycznie aktualizuje stałą `CACHE_NAME` w `sw.js` na podstawie wersji w `package.json`, co wymusza czyszczenie starych cache'y w zdarzeniu `activate`.
  3. Manifest zawiera wymagane ikony o przeznaczeniu `any` i `maskable` oraz zrzuty ekranu z atrybutem `form_factor`.

---

### Obszar 7: HTML/CSS i dostępność (WCAG 2.2 AA)
* **Standard**: Elementy interaktywne muszą być obsługiwane klawiaturą, posiadać widoczne wskaźniki fokusu (`:focus-visible`), a kolory muszą spełniać wymóg kontrastu minimum 4.5:1 dla tekstu standardowego oraz 3:1 dla elementów graficznych (WCAG 1.4.3, 1.4.11).
* **Źródło**: [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/), [Modern Web Guidance: light-dismiss-a-dialog].
* **Ocena**: 🟡 Częściowo.
* **Uwagi**:
  1. **Brak semantyki ARIA dla zakładek dni**: W [`web/index.html:267-276`](web/index.html#L267-L276) kontener zakładek nie ma atrybutu `role="tablist"`, a przyciski dni nie posiadają `role="tab"` ani `aria-selected="true/false"`. Czytnik ekranu odczytuje je jako zwykłą listę przycisków, a nie nawigację po dniach.
  2. **Atrybut `closedby="any"` w `<dialog>`**: Zastosowany w [`web/index.html:344,420,440,563`](web/index.html#L344) atrybut `closedby` jest propozycją z najnowszego draftu specyfikacji HTML (zgodnie z bazą *modern-web-guidance*). Na szczęście w `app.js:1888` zaimplementowano poprawny polyfill JS sprawdzający kliknięcie w `::backdrop` przez `getBoundingClientRect()`, co chroni starsze wersje Safari i Firefoxa.
  3. **Wskaźnik fokusu w nagłówku**: W [`web/style.css:260`](web/style.css#L260) ustawiono `outline: none;` dla `.app-header .btn-icon` bez zdefiniowania alternatywnego stylu w `:focus-visible`.
* **Przed → Po**:
  ```html
  <!-- Przed (index.html:267): -->
  <div class="day-tabs" id="day-tabs">
    <button class="day-tab" data-day="PON">Pon</button>
  </div>

  <!-- Po (semantyczny wzorzec Tabs wg WAI-ARIA): -->
  <div class="day-tabs" id="day-tabs" role="tablist" aria-label="Wybór dnia tygodnia">
    <button class="day-tab" role="tab" aria-selected="false" data-day="PON">Pon</button>
  </div>
  ```

---

### Obszar 8: Testy
* **Standard**: Zestaw testów powinien rzetelnie sprawdzać krytyczną logikę biznesową, być w pełni hermetyczny (nie zależeć od internetu ani zmiennej daty systemowej) i głośno raportować błędy.
* **Źródło**: [Martin Fowler: Testing Strategies](https://martinfowler.com/testing/).
* **Ocena**: ✅ Zgodny.
* **Uwagi**:
  1. **Wyjątkowo wysoka jakość testów domenowych**: Testy w `tests/test_backend.py` (193 asercje) oraz 4 pliki w `tests/*.js` weryfikują skrajne przypadki: święta rektorskie, zamiany dni, twardy koniec semestru, semestry dzielone na połowy oraz deduplikację nauczycieli.
  2. **Testy mutacyjne (dowód skuteczności)**:
     - Po celowym przestawieniu stałej w `build_static.py:444` (`safe_grupa`) test nr 5 w `tests/test_backend.py` natychmiast zgłasza czerwień.
     - Testy silnika kalendarza sprawdzają faktyczne wartości liczbowe (np. `assert.strictEqual(res04.meetingNum, 5)`), unikając pustych asercji.
  3. Drobna wada: Brak standardowego runnera testów (używany jest własny mini-framework `check()`). Wystarcza w tej skali, ale rzuca wyjątki dopiero po przejściu całego pliku.

---

### Obszar 9: CI/CD
* **Standard**: Pipeline wdrożeniowy (GitHub Actions) musi stosować zasadę minimalnych uprawnień (`least privilege`), zapobiegać pętlom wywołań przez boty oraz posiadać **bramkę bezpieczeństwa (Quality Gate)**, która zatrzymuje publikację, jeśli scraping zwróci niepoprawne lub puste dane.
* **Źródło**: [GitHub Actions Security Hardening](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions).
* **Ocena**: 🟡 Częściowo.
* **Uwagi**:
  1. **Brak bramki walidacji wyjścia w deploy.yml**: Jeśli Arktur zmieni strukturę tabeli, `pobierz_surowy_plan()` w [`build_static.py:408`](build_static.py#L408) zwróci pustą listę grup `grupy = []`. Pętla pominie generowanie plików, po czym build zakończy się kodem wyjścia 0! W efekcie GitHub Actions opublikuje pusty katalog planów na GitHub Pages.
  2. **Uprawnienia**: W [`deploy.yml`](.github/workflows/deploy.yml) poprawnie ograniczono uprawnienia do `contents: read`, `pages: write`, `id-token: write`.
* **Przed → Po**:
  ```python
  # Przed (build_static.py:575):
  logger.info(f"Summary: {len(plans_metadata['plans'])} plans...")

  # Po (bramka minimalnej liczby wygenerowanych planów):
  if total_groups_processed < 5:
      logger.error(f"FATAL: Wygenerowano tylko {total_groups_processed} grup! Awaria scrapera. Przerywam wdrożenie.")
      sys.exit(1)
  ```

---

### Obszar 10: Dane
* **Standard**: Pliki danych referencyjnych powinny mieć stabilny schemat, być łatwe do corocznej aktualizacji przez człowieka i zoptymalizowane pod kątem transferu sieciowego.
* **Źródło**: [JSON Schema Specification](https://json-schema.org/).
* **Ocena**: ✅ Zgodny.
* **Uwagi**:
  - `data/academic_calendar.json` (3.1 KB) stanowi pojedyncze źródło prawdy dla zamian dni i przerw. Zmiana zarządzenia rektora wymaga edycji jednego pliku.
  - Pliki `forms_manual.json` i `subjects_manual.json` pozwalają na bezinwazyjne korygowanie literówek i skrótów uczelnianych bez dotykania kodu Pythona.

---

### Obszar 11: Prywatność
* **Standard**: Ochrona prywatności użytkowników (minimalizacja danych, brak inwazyjnych trackerów, transparentność).
* **Źródło**: Rozporządzenie RODO / GDPR, [GoatCounter Privacy Policy](https://www.goatcounter.com/help/privacy).
* **Ocena**: ✅ Zgodny.
* **Uwagi**:
  - Projekt korzysta z narzędzia GoatCounter (`index.html:27`), które nie używa plików cookies, nie śledzi użytkowników pomiędzy witrynami i jest w pełni zgodne z RODO bez konieczności wyświetlania irytujących banerów zgód.
  - Aplikacja nie zbiera żadnych danych identyfikacyjnych o studentach.

---

## 4. Top 10 zadań do zrobienia (Backlog ułożony wg ROI)

| Priorytet | Zadanie | Obszar | Nakład | Dlaczego to ważne |
| :---: | :--- | :---: | :---: | :--- |
| ✅ **1** | **Bramka awaryjna w `build_static.py`** | CI/CD | **Zrobione** | Zapobiegnie przypadkowemu opublikowaniu pustego planu na GitHub Pages, gdy uczelnia zmieni stronę. |
| ✅ **2** | **Naprawa binarnego zapisu `.ics` (usunięcie podwójnego `\r\r\n`)** | Python | **Zrobione** | Zapewnia poprawny import kalendarza w Outlooku i na urządzeniach Apple pod Windows. |
| ✅ **3** | **Walidacja protokołu URL w `events-service.js` i escape w `app.js:1124`** | Bezpieczeństwo | **Zrobione** | Likwiduje podatność DOM XSS z poziomu zgłoszeń Issue i parametrów grupy. |
| 🟠 **4** | **Dodanie `.editorconfig` do repozytorium** | Repo | **S** (5 min) | Wymusza jednolite kodowanie UTF-8, wcięcia i końce linii LF dla wszystkich edytorów i systemów. |
| 🟠 **5** | **Dodanie nagłówka Content Security Policy (CSP) do `index.html`** | Bezpieczeństwo | **S** (15 min) | Blokuje nieautoryzowane skrypty zewnętrzne i chroni studentów przed wstrzyknięciem kodu. |
| 🟠 **6** | **Semantyka ARIA dla zakładek dni (`role="tablist"` / `role="tab"`)** | Dostępność | **M** (30 min) | Umożliwia niewidomym studentom korzystającym z czytników ekranu bezbłędną nawigację po planie. |
| 🟡 **7** | **Dodanie widocznego wskaźnika `:focus-visible` dla przycisków nagłówka** | Dostępność | **S** (10 min) | Przywraca dostępność klawiaturową usuniętą przez `outline: none` w CSS. |
| 🟡 **8** | **Przypięcie minimalnych wersji pakietów w `requirements.txt`** | Python | **S** (10 min) | Chroni pipeline CI przed nagłą awarią po wydaniu niespójnej aktualizacji bibliotek. |
| ⚪ **9** | **Wydzielenie z `app.js` kontrolerów UI (`calendar-ui.js`, `theme.js`)** | JavaScript | **L** (2 godz.) | Zmniejsza rozmiar 2340-liniowego pliku, ułatwia czytanie kodu i przyszły rozwój. |
| ⚪ **10** | **Mechanizm zachowania poprzedniej wersji planów w CI (Fallback Cache)** | CI/CD | **M** (45 min) | Pozwala zachować ostatni znany plan, jeśli Arktur ma przerwę techniczną w trakcie nocnego crona. |

---

## 5. Co można świadomie pominąć (Przerost formy dla tej skali)

1. **Frameworki SPA (React, Vue, Svelte)**: Przy aplikacji wyświetlającej statyczny plan dla kilku kierunków, Vanilla JS działa natychmiastowo, waży ułamek megabajta i nie wymaga procesu budowania frontendu (zero `npm run build`, zero problemów z podatnościami w `node_modules`).
2. **Serwerowy Backend / Baza danych SQL**: Zastosowanie plików JSON na GitHub Pages to darmowy, bezobsługowy hosting odporny na nagły ruch (np. początek semestru). Statyczny Jamstack jest w tym scenariuszu bezkonkurencyjny.
3. **Zaawansowane narzędzia bundlujące (Webpack, Vite)**: Wprowadzenie bundlera skomplikowałoby prostą strukturę, w której pliki z `web/` można edytować i od razu podglądać w przeglądarce.

---

## 6. Co jest zrobione bardzo dobrze

- **Architektura czystego silnika (`schedule-engine.js`)**: Wydzielenie logiki kalendarza, zamian dni i świąt do modułu całkowicie odciętego od przeglądarkowego DOM to podręcznikowy przykład *Clean Architecture*.
- **Odzwierciedlenie kalendarza rektorskiego**: Uwzględnienie specyfiki polskiej uczelni (np. „piątek realizuje plan ze środy”) oraz przeliczanie numeru spotkania to unikalna wartość dla studentów.
- **Prawdziwe PWA**: Solidny Service Worker, maskowalne ikony i działanie offline – aplikacja instaluje się na telefonie jak natywny program.
- **Odpowiedzialne podejście do prywatności**: Użycie GoatCountera zamiast inwazyjnego Google Analytics.

---

## 7. Status plików instrukcji i dokumentacji

| Plik | Status | Opis zmian |
| :--- | :---: | :--- |
| `AGENTS.md` | **Zaktualizowany** | Poprawiono liczbę testów (`npm test` uruchamia 4 zestawy, a nie 3). |
| `GEMINI.md` | **Utworzony** | Dodano zwięzły plik wskaźnikowy dla agentów Gemini/Antigravity, odsyłający do `AGENTS.md` i `CONTEXT.md`. |
| `CONTRIBUTING.md` | **Utworzony** | Dodano poradnik dla współtwórców (konfiguracja środowiska, komendy testowe, konwencje commitów). |
| `README.md` | **Bez zmian** | Istniał, jest aktualny, estetyczny i zawiera rzetelne instrukcje. |

---

## 8. Mini-słownik użytych pojęć

- **Jamstack**: Architektura aplikacji internetowych oparta na statycznym kodzie (HTML/JS) serwowanym bezpośrednio z serwera plików lub CDN bez udziału dynamicznego backendu.
- **PWA (Progressive Web App)**: Aplikacja webowa, która dzięki Service Workerowi może działać offline i być instalowana na ekranie telefonu jak natywny program.
- **Service Worker**: Działający w tle przeglądarki skrypt pośredniczący w zapytaniach sieciowych, umożliwiający buforowanie danych (cache) i pracę bez połączenia z internetem.
- **DOM XSS (Cross-Site Scripting)**: Podatność bezpieczeństwa polegająca na wstrzyknięciu i wykonaniu złośliwego kodu JavaScript w przeglądarce ofiary poprzez nieodpowiednio zabezpieczony kod manipulujący strukturą strony (DOM).
- **CRLF (`\r\n`)**: Standardowy znak końca linii składający się z powrotu karetki (Carriage Return) i nowego wiersza (Line Feed), wymagany m.in. w protokołach HTTP i plikach iCalendar.
- **WCAG**: Zbiór międzynarodowych wytycznych określających, jak tworzyć serwisy internetowe dostępne dla osób z niepełnosprawnościami (np. czytników ekranu lub nawigacji samą klawiaturą).
- **Quality Gate**: Bramka kontrolna w procesie automatycznego wdrażania (CI/CD), która natychmiast przerywa proces, jeśli produkt nie spełnia określonych kryteriów jakości (np. wykryto zero danych).

---

## 9. Co warto doczytać

1. **[OWASP DOM-based XSS Prevention](https://cheatsheetseries.owasp.org/cheatsheets/DOM_based_XSS_Prevention_Cheat_Sheet.html)** – *Zacznij od tego*: praktyczny przewodnik, jak bezpiecznie wstawiać tekst do elementów HTML.
2. **[web.dev: Service Worker Lifecycle](https://web.dev/service-worker-lifecycle/)** – szczegółowe wyjaśnienie, jak działają zdarzenia `install`, `activate`, `skipWaiting` i jak unikać serwowania przestarzałych plików użytkownikom.
3. **[WAI-ARIA Authoring Practices: Tabs Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)** – standard implementacji dostępnych zakładek (tablist, tab, tabpanel) w czystym HTML/JS.
4. **[RFC 5545 Specification (iCalendar)](https://datatracker.ietf.org/doc/html/rfc5545)** – sekcja 3.1 dotycząca formatowania linii i kodowania znaków w plikach `.ics`.
5. **[GitHub Actions Security Hardening](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions)** – najlepsze praktyki zabezpieczania pipeline'ów CI/CD.

---

## 10. Zweryfikowane polecenia

| Polecenie | Wynik | Uwagi |
| :--- | :---: | :--- |
| `.venv\Scripts\python.exe tests/test_backend.py` | ✅ **193 passed, 0 failed** (15.8s) | Wszystkie 29 sekcji testów regresyjnych działa prawidłowo. |
| `npm test` | ✅ **4/4 zestawy PASS** | Przechodzi testy kalendarza, cross-reference, silnika i wydarzeń. |
| `npm audit` (w izolacji) | ✅ **0 vulnerabilities** | Zależności deweloperskie Node.js są czyste. |
| `.venv\Scripts\python.exe -m ruff check .` | 🟡 **Found 225 errors** | Głównie brak sortowania importów i nieużywane zmienne (kod sprawny, ale wymaga uporządkowania). |
| `pip-audit -r requirements.txt` | ✅ **No known vulnerabilities** | Główne pakiety Pythona nie posiadają znanych podatności CVE. |
