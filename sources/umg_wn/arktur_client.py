"""
Klient sieciowy HTTP dla systemu planów zajęć arktur.umg.edu.pl.
Odpowiada za pobieranie listy planów, surowego HTML oraz równoległe zapytania AJAX o dane prowadzących.
"""
import html
import json
import logging
import re
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, List, Optional, Set, Tuple

import warnings
import requests
from bs4 import BeautifulSoup, XMLParsedAsHTMLWarning
from requests.adapters import HTTPAdapter

warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)

logger = logging.getLogger(__name__)

URL_LISTA = "https://arktur.umg.edu.pl/planyzaj/strpza5.php"
URL_PLAN = "https://arktur.umg.edu.pl/planyzaj/strpza6.php"
URL_AJAX = "https://arktur.umg.edu.pl/planyzaj/validate_sp_ka.php"
DEFAULT_HEADERS = {"User-Agent": "Mozilla/5.0"}


def pobierz_liste_planow() -> Dict[str, str]:
    """
    Pobiera listę dostępnych planów zajęć z formularza wyboru Arktura.
    Zwraca słownik: {nazwa_planu: id_planu}
    """
    try:
        r = requests.get(URL_LISTA, headers=DEFAULT_HEADERS, timeout=10)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, 'html.parser')
        return {
            opt.get_text().strip(): opt.get("value")
            for opt in soup.find_all("option")
            if opt.get("value") and opt.get("value").strip() != "0"
        }
    except Exception as e:
        logger.error(f"Nie udało się pobrać listy kierunków: {e}")
        return {}


def pobierz_plany_w_modyfikacji(html_content: Optional[str] = None) -> List[Dict[str, str]]:
    """
    Wykrywa plany ze statusem [modyfikowany] lub value="0" na liście kierunków Arktura.
    Zwraca listę słowników z surową nazwą planu oraz wyekstrahowanymi metadanymi roboczymi.
    """
    try:
        if html_content is None:
            r = requests.get(URL_LISTA, headers=DEFAULT_HEADERS, timeout=10)
            r.raise_for_status()
            html_text = r.text
        else:
            html_text = html_content

        soup = BeautifulSoup(html_text, 'html.parser')
        modyfikowane = []
        for opt in soup.find_all("option"):
            text = opt.get_text().strip()
            val = (opt.get("value") or "").strip()
            if val == "0" or "[modyfikowany]" in text.lower():
                if text:
                    modyfikowane.append({
                        "raw_name": text,
                        "value": val
                    })
        return modyfikowane
    except Exception as e:
        logger.error(f"Nie udało się pobrać listy planów w modyfikacji: {e}")
        return []


def pobierz_dane_z_ajax(
    session: requests.Session,
    ajax_val: str,
    url_target: str = URL_PLAN
) -> List[Dict[str, str]]:
    """
    Wykonuje zapytanie AJAX do validate_sp_ka.php w celu pobrania danych o prowadzącym,
    przedmiocie i terminach dla danego identyfikatora komórki.
    """
    headers = {
        "User-Agent": "Mozilla/5.0",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": url_target
    }
    payload = {"inputValue": ajax_val, "fieldID": "prowadzacy_zajecia_public"}
    try:
        r = session.post(URL_AJAX, data=payload, headers=headers, timeout=5)
        r.raise_for_status()
        kom_tag = BeautifulSoup(r.text, 'html.parser').find('komunikat')
        if kom_tag:
            tresc = kom_tag.get_text().strip()
            items = []
            for part in tresc.split('|'):
                subparts = [p.strip() for p in part.split('_')]
                sub = subparts[0] if len(subparts) > 0 else ""
                teach = subparts[1] if len(subparts) > 1 else ""
                dt = subparts[2] if len(subparts) > 2 else ""
                if sub or teach or dt:
                    items.append({
                        "subject": sub,
                        "teacher": teach,
                        "date_info": dt
                    })
            return items
    except Exception as e:
        logger.warning(f"Błąd AJAX dla {ajax_val}: {e}")
    return []


def pobierz_surowy_plan(plan_id: str) -> Tuple[str, List[str]]:
    """
    Pobiera surowy kod HTML planu dla zadanego plan_id oraz równolegle ściąga
    dane AJAX dla wszystkich kafelków z zajęciami, wstrzykując je jako ukryty cache JSON.
    Zwraca krotkę: (wzbogacony_html, lista_grup)
    """
    headers = {"User-Agent": "Mozilla/5.0", "Referer": URL_LISTA}

    try:
        session = requests.Session()
        adapter = HTTPAdapter(pool_connections=20, pool_maxsize=20)
        session.mount("https://", adapter)
        session.get(URL_LISTA, headers=headers, timeout=10)
        payload = {
            "id_planu_zajec": plan_id,
            "id_obiektu": "1",
            "id_grupy": "0",
            "nazwa_rodzaju_zestawienia": "0"
        }
        r = session.post(URL_PLAN, data=payload, headers=headers, timeout=10)
        r.raise_for_status()
    except Exception as e:
        logger.error(f"Błąd pobierania surowego planu {plan_id}: {e}")
        return "", []

    html_text = r.text
    soup = BeautifulSoup(html_text, 'html.parser')

    grupy = []
    for h in soup.find_all("td", class_="komopcji"):
        txt = h.get_text(strip=True).strip()

        # Ignorujemy opisy zajęć, znaczniki czasu i nawiasy
        if "ETMON" in txt or "[" in txt or "{" in txt or ":" in txt or len(txt) > 12:
            continue

        if re.search(r"^(?:GR\.?\s*\d+|[1-4]\s*(?:TM|ER|L|N)\b|[A-Z]{2,4}\.?\s*\d+|[A-E]\s*\d{1,2}$)", txt, re.IGNORECASE):
            if txt not in grupy:
                grupy.append(txt)

    unique_ajax_vals: Set[str] = set()
    inputs_by_id = {inp['id']: inp.get('value', '0') for inp in soup.find_all('input', id=True)}
    id_pattern = re.compile(r"^id_pzz_\d+_\d+_\d+$")
    for inp_id, v1 in inputs_by_id.items():
        if id_pattern.match(inp_id) and v1 and v1 != '0':
            v2 = inputs_by_id.get(f"{inp_id}_2", "0")
            v3 = inputs_by_id.get(f"{inp_id}_3", "0")
            unique_ajax_vals.add(f"{v1}_{v2}_{v3}")

    ajax_cache = {}
    with ThreadPoolExecutor(max_workers=10) as executor:
        results = executor.map(lambda val: (val, pobierz_dane_z_ajax(session, val, URL_PLAN)), unique_ajax_vals)
        for ajax_val, res_items in results:
            ajax_cache[ajax_val] = res_items

    ukryty_cache_html = '<div id="ukryta_baza_prowadzacych" style="display:none;">'
    ukryty_cache_html += f'<script id="ajax_cache_json" type="application/json">{json.dumps(ajax_cache, ensure_ascii=False)}</script>'
    for ajax_val, res_items in ajax_cache.items():
        for idx, res in enumerate(res_items):
            t = html.escape(res.get("teacher", ""))
            s = html.escape(res.get("subject", ""))
            ukryty_cache_html += f'<span id="ajax_{ajax_val}_{idx}" data-subject="{s}">{t}</span>'
        if res_items:
            t0 = html.escape(res_items[0].get("teacher", ""))
            s0 = html.escape(res_items[0].get("subject", ""))
            ukryty_cache_html += f'<span id="ajax_{ajax_val}" data-subject="{s0}">{t0}</span>'

    ukryty_cache_html += '</div>'
    html_text += ukryty_cache_html

    return html_text, grupy
