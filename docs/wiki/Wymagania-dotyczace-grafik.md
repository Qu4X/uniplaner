# Wymagania dotyczące grafik i ikon

Platforma **Uniplaner** zapewnia spójny i czytelny wygląd każdego wdrożonego adaptera wydziałowego.

Aby ujednolicić oprawę wizualną i uprościć pracę autorom adapterów, każdy adapter dostarcza **dokładnie jeden plik graficzny**: `icon.png`.

Kompilator (`core/build.py`) przetwarza ten plik i generuje komplet ikon PWA dla systemów Android, iOS, Windows i macOS. Zaokrąglenie narożników (20%) jest nakładane przez aplikację jednolicie w całym interfejsie.

---

## 1. Wymagany plik graficzny

Plik umieszcza się w katalogu konfiguracyjnym tenanta:  
`tenants/<id_uczelni>/<id_wydzialu>/`

| Plik | Status | Wymiary | Format | Zastosowanie |
| :--- | :---: | :---: | :---: | :--- |
| **`icon.png`** | **Obowiązkowy (jedyny)** | **512×512 px** | PNG | Ikona PWA (także maskable), favicon, logo w pasku nawigacji, okno „O aplikacji” i portal |

---

## 2. Wymagania dla `icon.png`

Plik `icon.png` jest jedynym elementem identyfikacji wizualnej adaptera.

### Wymagania techniczne
- **Rozdzielczość**: dokładnie `512×512` pikseli (kwadrat 1:1).
- **Format**: PNG (24 lub 32 bity).
- **Kształt i tło**:
  - **Nie zaokrąglaj rogów w pliku.** Grafika musi być pełnym kwadratem 512×512 px z nieprzyciętymi narożnikami.
  - Tło powinno wypełniać cały kwadrat (kolor uczelni lub biały).
  - **Maskę nakłada platforma**: aplikacja stosuje w CSS jednakowe dla wszystkich zaokrąglenie `border-radius: 20%` z delikatnym, kontrastowym obrysem w nagłówku, oknach i kafelkach.

### Strefa bezpieczna (safe zone)
Systemy operacyjne (zwłaszcza Android i iOS) oraz maska platformy przycinają narożniki ikony:

> [!WARNING]
> **Zasada strefy bezpiecznej (margines 10–15%)**:  
> Główny symbol (herb lub logo) powinien zajmować środkowy obszar ikony (ok. **70–80%** szerokości i wysokości). Zachowaj co najmniej **10–15% wolnego marginesu** od krawędzi, aby żaden istotny element nie został ucięty po nałożeniu maski lub instalacji aplikacji na telefonie.

```
+---------------------------------------+
|            Margines 10-15%            |
|     +---------------------------+     |
|     |                           |     |
|     |     Główny symbol / herb  |     |
|     |      (strefa bezpieczna)  |     |
|     |                           |     |
|     +---------------------------+     |
|            Margines 10-15%            |
+---------------------------------------+
```

### Co kompilator generuje z `icon.png`
Polecenie `python -m core.build` automatycznie tworzy:
- `icon-192.png` (192×192 px),
- `icon-512.png` (512×512 px),
- `apple-touch-icon.png` (dla iOS),
- `favicon.png` oraz wpisy w `manifest.json` z obsługą `any maskable`,

a także podmienia grafikę w nagłówku i oknie „O aplikacji”.

---

## 3. Motyw kolorystyczny: `theme.css`

Aby interfejs odzwierciedlał barwy uczelni, zdefiniuj zmienne CSS w pliku `tenants/<uczelnia>/<wydzial>/theme.css`:

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

/* Wariant trybu ciemnego */
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
> Dobierz kolor `--accent` tak, aby współczynnik kontrastu względem tła wynosił co najmniej **4,5:1**. Dzięki temu tekst na przyciskach i w nagłówkach pozostanie czytelny dla wszystkich studentów.
