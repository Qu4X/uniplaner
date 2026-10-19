"""
Czysty parser HTML dla planów zajęć Arktura (arktur.umg.edu.pl).
Odpowiada za interpretację komórek tabeli, nakładanie stylów, wyodrębnianie godzin,
sal, wykładowców oraz spłaszczanie siatki dla wybranej grupy.
"""
import json
import logging
import os
import re
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from bs4 import BeautifulSoup
from models import LessonDict

logger = logging.getLogger(__name__)

DNI_MAPA = {"1": "PON", "2": "WT", "3": "ŚR", "4": "CZW", "5": "PT", "6": "SOB"}

_SOURCE_DIR = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.dirname(os.path.dirname(_SOURCE_DIR))
_DATA_PATH = os.path.join(_REPO_ROOT, "data", "subjects_manual.json")
MANUAL_DICT_PATH = _DATA_PATH if os.path.exists(_DATA_PATH) else os.path.join(_SOURCE_DIR, "subjects_manual.json")


def load_manual_subjects(path: Optional[str] = None) -> Dict[str, str]:
    """Ładuje ręczne mapowania skrótów przedmiotów na pełne nazwy z subjects_manual.json"""
    target_path = path or MANUAL_DICT_PATH
    if os.path.exists(target_path):
        try:
            with open(target_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Nie udało się wczytać subjects_manual.json: {e}")
    return {}


def oblicz_godzine_konca(start_str: str, trwanie_min: int) -> str:
    """Oblicza godzinę zakończenia zajęć na podstawie godziny startu i czasu trwania w minutach."""
    try:
        start_dt = datetime.strptime(start_str.strip(), "%H:%M")
        koniec_dt = start_dt + timedelta(minutes=trwanie_min)
        return koniec_dt.strftime("%H:%M")
    except Exception as e:
        logger.warning(f"Błąd parsowania czasu '{start_str}': {e}")
        return start_str


def _chunks_are_disjoint(c1: Dict[str, Any], c2: Dict[str, Any]) -> bool:
    """Sprawdza, czy dwa chunki w tej samej komórce HTML odbywają się w rozłącznych terminach."""
    # Różne połówki semestru (np. 1 poł sem vs 2 poł sem)
    if c1.get("polowa_sem") is not None and c2.get("polowa_sem") is not None:
        if c1["polowa_sem"] != c2["polowa_sem"]:
            return True
    # Różne cykle tygodniowe (np. od 1 tyg co 2 tyg vs od 2 tyg co 2 tyg)
    if c1.get("co_ile") == 2 and c2.get("co_ile") == 2:
        if c1.get("od_tyg") != c2.get("od_tyg"):
            return True
    # Jawnie rozłączne przedziały dat (jeśli oba mają start i liczbę tygodni)
    d1, w1 = c1.get("data_start"), c1.get("liczba_tygodni")
    d2, w2 = c2.get("data_start"), c2.get("liczba_tygodni")
    if d1 and w1 and d2 and w2:
        try:
            start1 = datetime.strptime(d1, "%Y-%m-%d").date()
            end1 = start1 + timedelta(weeks=w1)
            start2 = datetime.strptime(d2, "%Y-%m-%d").date()
            end2 = start2 + timedelta(weeks=w2)
            if end1 <= start2 or end2 <= start1:
                return True
        except Exception:
            pass
    return False


def _resolve_cell_ajax_key(td_id: str, form_inputs: dict) -> str:
    """
    Ekstraktuje klucz zapytania AJAX dla danej komórki planu z ukrytych pól formularza Arktura.
    td_id: Identyfikator komórki tabeli, np. 'td_PN_39_0'
    form_inputs: Słownik pól formularza {input_id: value}
    Zwraca: Klucz w formacie '{primary_token}_{secondary_token}_{tertiary_token}'
    """
    if not td_id or '_' not in td_id:
        return "0_0_0"

    parts = td_id.split('_', 1)
    if len(parts) < 2:
        return "0_0_0"

    cell_suffix = parts[1]
    primary_token = form_inputs.get(f"id_pzz_{cell_suffix}", '0')
    secondary_token = form_inputs.get(f"id_pzz_{cell_suffix}_2", '0')
    tertiary_token = form_inputs.get(f"id_pzz_{cell_suffix}_3", '0')

    return f"{primary_token}_{secondary_token}_{tertiary_token}"


def _wspolny_parser_html(html_text: str) -> Tuple[Dict[str, Dict[Any, Dict[int, LessonDict]]], int, int]:
    """
    Główny silnik parsowania komórek tabeli HTML Arktura.
    Zwraca krotkę: (zajecia_z_kolumnami, min_slot, max_slot)
    """
    soup = BeautifulSoup(html_text, 'html.parser')
    min_slot, max_slot = 999, 0
    zajecia_dane: Dict[str, Dict[Any, Dict[int, LessonDict]]] = {d: {} for d in DNI_MAPA.values()}
    inputs_by_id = {inp['id']: inp.get('value', '0') for inp in soup.find_all('input', id=True)}

    ajax_cache = {}
    ajax_script = soup.find('script', id='ajax_cache_json')
    if ajax_script and ajax_script.string:
        try:
            ajax_cache = json.loads(ajax_script.string)
        except Exception as e:
            logger.warning(f"Błąd parsowania ajax_cache_json: {e}")

    cache_spans = {
        span['id']: {
            "teacher": span.get_text(strip=True),
            "subject": span.get('data-subject', '').strip()
        }
        for span in soup.find_all('span', id=True)
    }
    manual_dict = load_manual_subjects()

    for td in soup.find_all("td", id=True):
        tid = td['id']
        if not tid.startswith("td_"): continue
        parts = tid.split('_')
        dzien_nazwa = DNI_MAPA.get(parts[1], "Inny")
        cell_slot_start, col_start = int(parts[2]), int(parts[3])
        colspan = int(td.get('colspan', 1))
        rowspan = int(td.get('rowspan', 1))
        cell_end_slot = cell_slot_start + rowspan

        td_classes = td.get('class', [])
        arktur_kolor = 'magenta' if any('magenta' in c for c in td_classes) else (
            'cyan' if any('cyan' in c for c in td_classes) else 'default'
        )

        drag = td.find('div', class_='drag')
        if not drag:
            continue

        green_fonts = td.find_all('font', color='green')
        blue_rooms = [
            f.get_text().strip() for f in td.find_all('font', color='darkblue')
            if not f.get_text().strip().startswith('{prow')
        ]

        inner = drag.find('div') or drag
        inner_soup = BeautifulSoup(str(inner), 'html.parser')
        for br in inner_soup.find_all('br'):
            br.replace_with('|||')
        raw_lines = [l.strip() for l in inner_soup.get_text().split('|||') if l.strip()]

        chunks = []
        for l in raw_lines:
            if re.search(r'\b\d{2}:\d{2}\b', l):
                chunks.append([l])
            else:
                if chunks:
                    chunks[-1].append(l)
                else:
                    chunks.append([l])

        if not chunks:
            chunks = [raw_lines] if raw_lines else [[""]]

        ajax_key = _resolve_cell_ajax_key(tid, inputs_by_id)
        ajax_items = ajax_cache.get(ajax_key, [])

        # Pre-compute timing and cycle metadata for every chunk
        chunk_metas = []
        for j, ch in enumerate(chunks):
            ch_text = ' '.join(ch)
            clean_ch = ch_text.replace('\xa0', ' ').replace('&nbsp;', ' ')

            c_co_ile = 1
            c_od_tyg = 1
            m_c = re.search(r"\(od\s*(\d+)\s*tyg\s*co\s*(\d+)\s*tyg\)", clean_ch)
            if m_c:
                c_od_tyg = int(m_c.group(1))
                c_co_ile = int(m_c.group(2))
            elif re.search(r"\(co\s*(\d+)\s*tyg\)", clean_ch):
                c_co_ile = int(re.search(r"\(co\s*(\d+)\s*tyg\)", clean_ch).group(1))

            c_polowa = None
            m_p = re.search(r"\((\d+)\s*poł\s*sem\)", clean_ch)
            if m_p:
                c_polowa = int(m_p.group(1))

            c_start_h = green_fonts[j].get_text().strip() if j < len(green_fonts) else None
            if not c_start_h:
                tm = re.search(r'\b(\d{2}:\d{2})\b', ch_text)
                c_start_h = tm.group(1) if tm else None

            c_slot = None
            if c_start_h:
                try:
                    sh_j, sm_j = map(int, c_start_h.split(':'))
                    c_slot = (sh_j - 7) * 12 + sm_j // 5
                except Exception:
                    c_slot = None

            d_m = re.search(r"\[od:\s*(\d{4}-\d{2}-\d{2})\]", ch_text)
            w_m = re.search(r"\[il\.tyg:\s*(\d+)\]", ch_text)

            chunk_metas.append({
                "slot_start": c_slot,
                "polowa_sem": c_polowa,
                "co_ile": c_co_ile,
                "od_tyg": c_od_tyg,
                "data_start": d_m.group(1) if d_m else None,
                "liczba_tygodni": int(w_m.group(1)) if w_m else None,
            })

        cell_base_start = None
        for i, chunk in enumerate(chunks):
            chunk_text = ' '.join(chunk)
            clean_chunk_text = chunk_text.replace('\xa0', ' ').replace('&nbsp;', ' ')

            # Detect cycle: (od 1 tyg co 2 tyg), (od 2 tyg co 2 tyg), (co 2 tyg)
            co_ile = 1
            od_tyg = 1
            m_cycle = re.search(r"\(od\s*(\d+)\s*tyg\s*co\s*(\d+)\s*tyg\)", clean_chunk_text)
            if m_cycle:
                od_tyg = int(m_cycle.group(1))
                co_ile = int(m_cycle.group(2))
            elif re.search(r"\(co\s*(\d+)\s*tyg\)", clean_chunk_text):
                co_ile = int(re.search(r"\(co\s*(\d+)\s*tyg\)", clean_chunk_text).group(1))

            # Detect semester half: (1 poł sem), (2 poł sem)
            polowa_sem = None
            m_pol = re.search(r"\((\d+)\s*poł\s*sem\)", clean_chunk_text)
            if m_pol:
                polowa_sem = int(m_pol.group(1))

            start_h = green_fonts[i].get_text().strip() if i < len(green_fonts) else None
            if not start_h:
                time_match = re.search(r'\b(\d{2}:\d{2})\b', chunk_text)
                start_h = time_match.group(1) if time_match else "??:??"

            sala = blue_rooms[i] if i < len(blue_rooms) else ('OL' if not blue_rooms else blue_rooms[0])

            try:
                sh, sm = map(int, start_h.split(':'))
                sub_slot_start = (sh - 7) * 12 + sm // 5
            except Exception:
                sub_slot_start = cell_slot_start

            if sub_slot_start < min_slot: min_slot = sub_slot_start
            if cell_end_slot > max_slot: max_slot = cell_end_slot

            # Each chunk ends at the next non-disjoint chunk's start if it starts later; otherwise cell_end_slot
            candidate_starts = [
                chunk_metas[k]["slot_start"]
                for k in range(i + 1, len(chunk_metas))
                if chunk_metas[k]["slot_start"] is not None
                and chunk_metas[k]["slot_start"] > sub_slot_start
                and not _chunks_are_disjoint(chunk_metas[i], chunk_metas[k])
            ]
            next_start = min(candidate_starts) if candidate_starts else None
            chunk_end_slot = next_start if next_start is not None else cell_end_slot
            sub_height = max(1, chunk_end_slot - sub_slot_start)
            sub_duration = sub_height * 5
            koniec_h = oblicz_godzine_konca(start_h, sub_duration)

            match_prow = re.search(r"\{prow:\s*([^}]+)\}", chunk_text)
            prowadzacy = ""
            ajax_subject = ""
            if match_prow:
                prowadzacy = match_prow.group(1).strip()
            elif i < len(ajax_items):
                prowadzacy = ajax_items[i].get("teacher", "").strip()
                ajax_subject = ajax_items[i].get("subject", "").strip()
            elif ajax_key in cache_spans:
                prowadzacy = cache_spans[ajax_key].get("teacher", "").strip()
                ajax_subject = cache_spans[ajax_key].get("subject", "").strip()

            data_start_match = re.search(r"\[od:\s*(\d{4}-\d{2}-\d{2})\]", chunk_text)
            tygodnie_match = re.search(r"\[il\.tyg:\s*(\d+)\]", chunk_text)
            data_start = data_start_match.group(1) if data_start_match else None
            liczba_tygodni = int(tygodnie_match.group(1)) if tygodnie_match else None

            if data_start and not cell_base_start:
                cell_base_start = data_start

            if not data_start and i < len(ajax_items):
                d_m = re.search(r"(\d{4}-\d{2}-\d{2})", ajax_items[i].get("date_info", ""))
                if d_m: data_start = d_m.group(1)

            if not cell_base_start and data_start:
                cell_base_start = data_start

            # Calculate 2nd semester half start date if not explicitly specified
            if polowa_sem == 2 and not data_start_match:
                if cell_base_start:
                    try:
                        base_dt = datetime.strptime(cell_base_start, "%Y-%m-%d")
                        data_start = (base_dt + timedelta(weeks=8)).strftime("%Y-%m-%d")
                    except Exception:
                        pass

            if liczba_tygodni is None and i < len(ajax_items):
                t_m = re.search(r"tygodni:\s*(\d+)", ajax_items[i].get("date_info", ""))
                if t_m: liczba_tygodni = int(t_m.group(1))

            if liczba_tygodni is None:
                if polowa_sem == 1:
                    liczba_tygodni = 7
                elif polowa_sem == 2:
                    liczba_tygodni = 8
                elif co_ile == 2:
                    liczba_tygodni = 8 if od_tyg == 1 else 7
                else:
                    liczba_tygodni = 15
                    logger.debug(f"Week count not found for slot {sub_slot_start} in {dzien_nazwa}, defaulting to 15 (full semester)")

            l0 = chunk[0] if chunk else ""
            cleaned = re.sub(r'\b\d{2}:\d{2}\b', '', l0)
            if sala != 'OL':
                cleaned = re.sub(r'(?<!\w)' + re.escape(sala) + r'(?!\w)', '', cleaned)
            cleaned = re.sub(r'\(.*?\)', '', cleaned)
            cleaned = re.sub(r'\{.*?\}', '', cleaned)
            cleaned = re.sub(r'\[.*?\]', '', cleaned)
            raw_przedmiot = cleaned.strip()

            if raw_przedmiot in manual_dict:
                przedmiot = manual_dict[raw_przedmiot]
            elif ajax_subject:
                przedmiot = ajax_subject
            elif i < len(ajax_items) and ajax_items[i].get("subject"):
                przedmiot = ajax_items[i]["subject"]
            else:
                przedmiot = raw_przedmiot

            lesson_obj: LessonDict = {
                "przedmiot": przedmiot,
                "raw_przedmiot": raw_przedmiot,
                "prowadzacy": prowadzacy,
                "godziny": f"{start_h} - {koniec_h}",
                "sala": sala,
                "height": sub_height,
                "colspan": colspan,
                "arktur_kolor": arktur_kolor,
                "data_start": data_start,
                "tygodnie": liczba_tygodni,
                "co_ile": co_ile,
                "od_tyg": od_tyg,
                "polowa_sem": polowa_sem
            }

            slot_key = sub_slot_start
            if slot_key in zajecia_dane[dzien_nazwa] and col_start in zajecia_dane[dzien_nazwa][slot_key]:
                slot_key = f"{sub_slot_start}_{col_start}_{i}"

            if slot_key not in zajecia_dane[dzien_nazwa]:
                zajecia_dane[dzien_nazwa][slot_key] = {}

            zajecia_dane[dzien_nazwa][slot_key][col_start] = lesson_obj

    # Safe fallback only for subjects where no teacher was found anywhere
    # but only if a known subject abbreviation has a single unambiguous teacher
    teacher_counts = {}
    for dzien in zajecia_dane.values():
        for slot in dzien.values():
            for info in slot.values():
                t = info.get("prowadzacy")
                r = info.get("raw_przedmiot")
                if t and r:
                    teacher_counts.setdefault(r, set()).add(t)

    unambiguous_teachers = {
        r: list(teachers)[0]
        for r, teachers in teacher_counts.items()
        if len(teachers) == 1
    }

    for dzien in zajecia_dane.values():
        for slot in dzien.values():
            for info in slot.values():
                raw = info.get("raw_przedmiot")
                if not info.get("prowadzacy") and raw in unambiguous_teachers:
                    info["prowadzacy"] = unambiguous_teachers[raw]

    min_slot = (min_slot // 12) * 12 if min_slot != 999 else 24
    max_slot = ((max_slot // 12) + 1) * 12 if max_slot != 0 else 144
    return zajecia_dane, min_slot, max_slot


# Alias semantyczny dla _wspolny_parser_html
parsuj_plan_html = _wspolny_parser_html


def przetworz_plan_na_grafike(
    html_text: str,
    wybrana_grupa: str,
    lista_grup: List[str],
    _parsed_schedule: Optional[Tuple] = None
) -> Tuple[Dict[str, Dict[str, LessonDict]], int, int]:
    """
    Filtruje i spłaszcza siatkę zajęć dla wybranej grupy dziekańskiej.
    Zwraca krotkę: (dane_plaskie, min_slot, max_slot)
    """
    if wybrana_grupa not in lista_grup:
        return {}, 0, 0

    target_idx = lista_grup.index(wybrana_grupa)
    if _parsed_schedule:
        dane_z_kolumnami, min_slot, max_slot = _parsed_schedule
    else:
        dane_z_kolumnami, min_slot, max_slot = _wspolny_parser_html(html_text)

    dane_plaskie: Dict[str, Dict[str, LessonDict]] = {d: {} for d in DNI_MAPA.values()}

    for dzien, sloty in dane_z_kolumnami.items():
        for slot_start, cols in sloty.items():
            wybrane_info = None

            # SORTUJEMY KOLUMNY: Najpierw te, które są najbliżej naszej grupy
            posortowane_kolumny = sorted(cols.keys(), key=lambda k: abs(k - target_idx))

            for col_start in posortowane_kolumny:
                info = cols[col_start]
                colspan = info.get("colspan", 1)

                # WARUNEK 1: Dokładne przykrycie Twojej grupy
                if col_start <= target_idx < (col_start + colspan):
                    wybrane_info = info
                    break

                # WARUNEK 2: Specjalny przypadek dla "BiSS" i Auli (kolumna 0 i duży colspan)
                if col_start == 0 and colspan > 5 and target_idx < (col_start + colspan):
                    wybrane_info = info

            if wybrane_info:
                target_key = slot_start
                if target_key in dane_plaskie[dzien]:
                    target_key = f"{slot_start}_{len(dane_plaskie[dzien])}"
                dane_plaskie[dzien][target_key] = wybrane_info

    return dane_plaskie, min_slot, max_slot
