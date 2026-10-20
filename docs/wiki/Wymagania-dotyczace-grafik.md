# Wymagania dotyczące grafik i ikon (Asset Guidelines) 🎨

Platforma **Uniplaner** dba o spójny, profesjonalny i responsywny wygląd każdej wdrożonej wtyczki wydziałowej.

Silnik budowania (`core/build.py`) automatycznie przetwarza pliki dostarczone przez autora wtyczki i generuje z nich pełen zestaw ikon PWA dla systemów Android, iOS, Windows i macOS.

---

## 1. Zestawienie wymaganych plików graficznych

Pliki graficzne umieszcza się bezpośrednio w folderze konfiguracyjnym tenanta:  
📁 `tenants/<id_uczelni>/<id_wydzialu>/`

| Plik | Status | Wymiary | Format | Zastosowanie |
| :--- | :---: | :---: | :---: | :--- |
| **`icon.png`** | **OBOWIĄZKOWY** | **512×512 px** | PNG z kanałem alfa | Główna ikona PWA, maskable icon, favicon, kafelek aplikacji |
| **`logo.svg`** | *Zalecany* | Dowolny (proporcjonalny) | Czysty wektor SVG | Nagłówek aplikacji PWA, modal „O aplikacji” |

---

## 2. Główna ikona aplikacji: `icon.png`

Plik `icon.png` jest kluczowym elementem identyfikacji wizualnej wtyczki.

### Wytyczne techniczne:
- **Rozdzielczość**: Dokładnie `512×512` pikseli (kwadrat w proporcjach 1:1).
- **Format**: PNG-24 z kanałem alfa (przezroczystość).
- **Tło (Transparency)**:
  - 🛑 **NIE dodawaj sztucznego, kwadratowego tła w ciemnym kolorze** (np. ciemnoniebieskim czy szarym).
  - Tło ikony powinno być przezroczyste, chyba że sam oficjalny herb lub tarcza uczelni ma geometryczny kształt (np. okrąg, tarcza herbowa).
  - PWA automatycznie osadza ikonę na transparentnym tle w modalu oraz dynamicznie generuje maskowalną ikonę z kolorem motywu.

### Bezpieczny margines (Safe Zone):
Systemy operacyjne (zwłaszcza Android i iOS) automatycznie przycinają ikony aplikacji do kształtu tzw. *squircle* (zaokrąglony kwadrat) lub koła.

> [!WARNING]
> **Zasada Safe Zone (15% marginesu)**:  
> Główny symbol graficzny (herb/logo) powinien zajmować centralny obszar ikony (ok. **70–80%** szerokości i wysokości). Pozostaw minimum **10–15% wolnej przestrzeni (marginesu)** od krawędzi obrazu, aby żaden element herbu nie został ucięty po zainstalowaniu PWA na telefonie.

```
+---------------------------------------+
|            10-15% Margines            |
|     +---------------------------+     |
|     |                           |     |
|     |     Główny symbol / herb  |     |
|     |        (Safe Zone)        |     |
|     |                           |     |
|     +---------------------------+     |
|            10-15% Margines            |
+---------------------------------------+
```

### Co generuje kompilator z `icon.png`:
Podczas uruchomienia polecenia `python -m core.build`, silnik platformy automatycznie skaluje i generuje:
- `icon-192.png` (192×192 px)
- `icon-512.png` (512×512 px)
- `apple-touch-icon.png` (180×180 px dla iOS)
- `favicon.png` oraz wpisy w `manifest.json`

---

## 3. Wektorowe logo: `logo.svg` (zalecane)

Plik `logo.svg` jest wykorzystywany w miejscach wymagających idealnej ostrości przy skalowaniu:
1. **Pasek nawigacji u góry aplikacji** (renderowany w rozmiarze `32×32 px`).
2. **Karta wtyczki w oknie dialogowym „O aplikacji”** (renderowany w rozmiarze `64×64 px`).

### Wytyczne techniczne:
- **Format**: Czysty plik wektorowy SVG (kod XML z atrybutem `viewBox="0 0 W H"`).
- **Brak zagnieżdżonych bitmap**: SVG nie może zawierać zaszytych obrazów rastrowych Base64.
- **Przezroczyste tło**: Brak tła (`background: transparent`).
- **Skalowalność**: Grafika powinna być czytelna zarówno w małym rozmiarze (32 px), jak i większym (64 px).

---

## 4. Motyw kolorystyczny: `theme.css`

Aby interfejs PWA odzwierciedlał barwy Twojej uczelni, w pliku `tenants/<uczelnia>/<wydzial>/theme.css` zdefiniuj zmienne CSS:

```css
:root {
  /* Podstawowy kolor akcentu uczelni (przyciski, aktywne zakładki) */
  --accent: #005a9c;
  --accent-hover: #004273;
  --accent-light: rgba(0, 90, 156, 0.12);

  /* Kolory tła */
  --bg-primary: #ffffff;
  --bg-secondary: #f4f6f9;
  
  /* Kolory tekstu */
  --text-primary: #1a202c;
  --text-secondary: #718096;
}

/* Wariant trybu ciemnego (Dark Mode) */
[data-theme="dark"] {
  --accent: #3182ce;
  --accent-hover: #4299e1;
  --accent-light: rgba(49, 130, 206, 0.2);

  --bg-primary: #121824;
  --bg-secondary: #1a2234;
  --text-primary: #f7fafc;
  --text-secondary: #a0aec0;
}
```

> [!TIP]
> **Dostępność i kontrast (WCAG 2.1 AA)**:  
> Upewnij się, że wybrany kolor `--accent` zapewnia współczynnik kontrastu co najmniej **4.5:1** w stosunku do tła, aby tekst na przyciskach i nagłówkach był czytelny dla wszystkich studentów.
