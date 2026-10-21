# Wymagania dotyczące grafik i ikon (Asset Guidelines) 🎨

Platforma **Uniplaner** dba o spójny, profesjonalny i responsywny wygląd każdej wdrożonej wtyczki wydziałowej.

Aby zapewnić pełną standaryzację wizualną oraz maksymalną prostotę dla twórców adapterów, każda wtyczka dostarcza **dokładnie jeden plik graficzny**: `icon.png`.

Silnik budowania (`core/build.py`) automatycznie przetwarza ten plik i generuje z niego pełen zestaw ikon PWA dla systemów Android, iOS, Windows i macOS. Strona natomiast sama nakłada jednolite maskowanie (20% zaokrąglenia) we wszystkich miejscach interfejsu.

---

## 1. Zestawienie wymaganego pliku graficznego

Plik graficzny umieszcza się bezpośrednio w folderze konfiguracyjnym tenanta:  
📁 `tenants/<id_uczelni>/<id_wydzialu>/`

| Plik | Status | Wymiary | Format | Zastosowanie |
| :--- | :---: | :---: | :---: | :--- |
| **`icon.png`** | **OBOWIĄZKOWY (jedyny)** | **512×512 px** | PNG | Główna ikona PWA, maskable icon, favicon, logo w pasku nawigacji, modal „O aplikacji” i portal |

---

## 2. Standard pliku: `icon.png`

Plik `icon.png` jest kompletnym i jedynym elementem identyfikacji wizualnej wtyczki.

### Wytyczne techniczne:
- **Rozdzielczość**: Dokładnie `512×512` pikseli (kwadrat w proporcjach 1:1).
- **Format**: PNG (24-bit / 32-bit).
- **Kształt i tło (Brak rounded corners w pliku!)**:
  - 🛑 **NIE zaokrąglaj rogów w pliku graficznym!** Plik dostarczany przez twórcę adaptera musi być **pełnym kwadratem** (512×512 px) bez przyciętych rogów.
  - Tło powinno wypełniać cały obszar kwadratu (kolor marki/uczelni lub biały).
  - **Maska jest nakładana przez platformę**: Strona Uniplaner w CSS automatycznie nakłada identyczną dla wszystkich maskę `border-radius: 20%` (squircle) z subtelnym obrysem kontrastowym w nagłówku, modalu i kafelkach.

### Bezpieczny margines (Safe Zone):
Systemy operacyjne (zwłaszcza Android i iOS) oraz maska platformy przycinają rogi ikony:

> [!WARNING]
> **Zasada Safe Zone (10–15% marginesu)**:  
> Główny symbol graficzny (herb/logo) powinien zajmować centralny obszar ikony (ok. **70–80%** szerokości i wysokości). Pozostaw minimum **10–15% wolnej przestrzeni (marginesu)** od krawędzi obrazu, aby żaden kluczowy element herbu nie został ucięty po nałożeniu maski lub zainstalowaniu PWA na telefonie.

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
Podczas uruchomienia polecenia `python -m core.build`, silnik platformy automatycznie przygotowuje:
- `icon-192.png` (192×192 px)
- `icon-512.png` (512×512 px)
- `apple-touch-icon.png` (dla iOS)
- `favicon.png` oraz wpisy w `manifest.json` z obsługą `any maskable`
- Podmianę grafiki w nagłówku i oknie „O aplikacji” na `icon.png`

---

## 3. Motyw kolorystyczny: `theme.css`

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
