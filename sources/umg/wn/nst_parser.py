"""
Tabular PDF schedule parser for part-time (NST) university timetables.
Converts extracted vector tables and character streams from PDF files into unified lesson dict structures per group.
"""
import logging
import re
from typing import Any, Dict, List, Optional
import pdfplumber

logger = logging.getLogger(__name__)

POLISH_TO_STANDARD_DAY = {
    "poniedziałek": "Poniedziałek",
    "wtorek": "Wtorek",
    "środa": "Środa",
    "sroda": "Środa",
    "czwartek": "Czwartek",
    "piątek": "Piątek",
    "piatek": "Piątek",
    "sobota": "Sobota",
    "niedziela": "Niedziela",
}

STANDARD_GROUPS = [f"GR.{i:02d}" for i in range(1, 9)]

BLOCK_TIMES = [
    ("08:00", "08:00-10:25"),
    ("10:30", "10:30-12:55"),
    ("13:30", "13:30-15:55"),
    ("16:00", "16:00-18:25"),
    ("18:30", "18:30-20:55"),
]

GROUP_BOUNDS = [
    (0, "GR.01", 78.0, 107.4),
    (1, "GR.02", 107.4, 136.8),
    (2, "GR.03", 136.8, 166.2),
    (3, "GR.04", 166.2, 195.6),
    (4, "GR.05", 195.6, 225.0),
    (5, "GR.06", 225.0, 254.4),
    (6, "GR.07", 254.4, 283.8),
    (7, "GR.08", 283.8, 350.0),
]

PAIR_BOUNDS = [
    (0, ("GR.01", "GR.02"), 78.0, 136.8),
    (1, ("GR.03", "GR.04"), 136.8, 195.6),
    (2, ("GR.05", "GR.06"), 195.6, 254.4),
    (3, ("GR.07", "GR.08"), 254.4, 350.0),
]

KNOWN_TEACHER_SUBJECTS = {
    "Milczek Beata": "Matematyka",
    "Boniewicz-Szmyt": "Fizyka",
    "Daniszewska": "Elementy prawa z prawem transportowym",
    "Gil Mateusz": "Podstawy nautyki w transporcie",
    "Tessmer Agnieszka": "Grafika inżynierska",
    "Kaizer Adam": "Spotkanie organizacyjne",
}


def normalize_iso_date(date_str: str) -> Optional[str]:
    """
    Converts dates formatted as 'D.M.YYYY' or 'DD.MM.YYYY' into standard ISO 'YYYY-MM-DD'.
    """
    if not date_str:
        return None
    match = re.search(r"(\d{1,2})[./-](\d{1,2})[./-](\d{4})", date_str.strip())
    if match:
        day, month, year = match.groups()
        return f"{int(year):04d}-{int(month):02d}-{int(day):02d}"
    return None


def clean_cell_text(text: Optional[str]) -> str:
    """Cleans up raw cell text from PDFs, normalising multiple whitespace and newlines."""
    if not text:
        return ""
    return re.sub(r"\s+", " ", text).strip()


def clean_merged_text(text: str) -> str:
    """
    Cleans up OCR and PDF extraction artifacts where text spans cross cell boundaries.
    """
    if not text:
        return ""
    # De-hyphenate across lines or line-breaks: e.g. 'Boniewicz- Szmyt' -> 'Boniewicz-Szmyt'
    text = re.sub(r"([A-ZĄĆĘŁŃÓŚŹŻa-ząćęłńóśźż])-[\s\n]+([A-ZĄĆĘŁŃÓŚŹŻa-ząćęłńóśźż])", r"\1-\2", text)

    # Clean character-interleaving artifacts from table border slicing
    text = re.sub(r"Szm\s+yt", "Szmyt", text)
    text = re.sub(r"KatarzynCa1,\s*3d6r", "Katarzyna, dr C136", text)
    text = re.sub(r"dr\s+B211", "dr B211", text)
    text = re.sub(r"dr\s+C30", "dr C30", text)
    text = re.sub(r"dr\s+C31", "dr C31", text)
    text = re.sub(r",\s*d\s+r\s+inż", ", dr inż", text)
    text = re.sub(r"\bGil\s+Mateusz,\s*d\b", "Gil Mateusz, dr inż.", text)
    text = re.sub(r"\bTessmer\s+Agni\b", "Tessmer Agnieszka, mgr inż.", text)
    text = re.sub(r"\bPodstawy\s+naut\b", "Podstawy nautyki w transporcie", text)
    text = re.sub(r"\bGrafika\s+inżynier\b", "Grafika inżynierska", text)
    return text


def extract_stream_runs(chars: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Extracts text runs from a list of PDF characters in raw stream order.
    Starts a new run when vertical position changes, horizontal position jumps backwards,
    a column gap occurs, or a room-to-teacher boundary is reached.
    """
    runs: List[Dict[str, Any]] = []
    curr: List[Dict[str, Any]] = []
    for c in chars:
        if not curr:
            curr.append(c)
            continue
        prev = curr[-1]
        v_diff = abs(c["top"] - prev["top"])
        h_back = c["x0"] < prev["x0"] - 2.0
        h_gap = c["x0"] - prev["x1"] > 8.0
        is_room_boundary = prev["text"].isdigit() and c["text"].isupper()
        is_font_change = prev.get("fontname") != c.get("fontname")
        is_glued_title = prev["text"].islower() and c["text"].isupper() and (c["x0"] - prev["x1"] < 3.0)

        if v_diff > 3.0 or h_back or h_gap or is_room_boundary or is_font_change or is_glued_title:
            txt = "".join(x["text"] for x in curr).strip()
            if txt:
                runs.append({
                    "x0": curr[0]["x0"],
                    "x1": curr[-1]["x1"],
                    "top": curr[0]["top"],
                    "bottom": curr[-1]["bottom"],
                    "text": txt
                })
            curr = [c]
        else:
            curr.append(c)
    if curr:
        txt = "".join(x["text"] for x in curr).strip()
        if txt:
            runs.append({
                "x0": curr[0]["x0"],
                "x1": curr[-1]["x1"],
                "top": curr[0]["top"],
                "bottom": curr[-1]["bottom"],
                "text": txt
            })
    return runs


def parse_pdf_schedule(pdf_path: str) -> Dict[str, Dict[str, List[Dict[str, Any]]]]:
    """
    Parses a timetable PDF file for part-time studies.
    Uses spatial stream parsing for robust extraction across irregular grid lines,
    falling back to tabular table extraction if stream data is unavailable.
    """
    groups_data: Dict[str, Dict[str, List[Dict[str, Any]]]] = {}

    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page in pdf.pages:
                page_data = _parse_page_streams(page)
                if page_data:
                    for grp, dates in page_data.items():
                        if grp not in groups_data:
                            groups_data[grp] = {}
                        for date_iso, lessons in dates.items():
                            if date_iso not in groups_data[grp]:
                                groups_data[grp][date_iso] = []
                            groups_data[grp][date_iso].extend(lessons)
                else:
                    # Fallback to standard table parsing
                    tables = page.extract_tables()
                    for table in tables:
                        parsed_day_tables = _parse_single_table(table)
                        for grp, dates in parsed_day_tables.items():
                            if grp not in groups_data:
                                groups_data[grp] = {}
                            for date_iso, lessons in dates.items():
                                if date_iso not in groups_data[grp]:
                                    groups_data[grp][date_iso] = []
                                groups_data[grp][date_iso].extend(lessons)
    except Exception as err:
        logger.error(f"Error while parsing PDF schedule {pdf_path}: {err}")

    # Deduplicate and sort lessons chronologically by start hour for each day
    for group_name, dates in groups_data.items():
        for date_iso, lessons in dates.items():
            deduped: List[Dict[str, Any]] = []
            seen = set()
            for item in lessons:
                key = (item.get("godziny"), item.get("przedmiot"), item.get("prowadzacy"))
                if key not in seen:
                    seen.add(key)
                    deduped.append(item)
            deduped.sort(key=lambda item: item.get("godziny", "").split("-")[0])
            dates[date_iso] = deduped

    return groups_data


def _parse_page_streams(page: pdfplumber.page.Page) -> Dict[str, Dict[str, List[Dict[str, Any]]]]:
    """
    Extracts all daily schedules from a single PDF page using character streams and column boundaries.
    """
    words = page.extract_words()
    date_words = [w for w in words if re.match(r"^\d{1,2}\.\d{2}\.\d{4}$", w["text"])]
    if not date_words:
        return {}

    date_words.sort(key=lambda w: w["top"])
    page_data: Dict[str, Dict[str, List[Dict[str, Any]]]] = {g: {} for g in STANDARD_GROUPS}

    for d_idx, dw in enumerate(date_words):
        d_str = dw["text"]
        d_iso = normalize_iso_date(d_str)
        if not d_iso:
            continue

        y_start = dw["top"] - 5.0
        y_end = date_words[d_idx + 1]["top"] - 5.0 if d_idx + 1 < len(date_words) else page.height

        day_words = [w for w in words if y_start <= w["top"] <= y_start + 25.0 and w["text"].lower() in POLISH_TO_STANDARD_DAY]
        day_name = POLISH_TO_STANDARD_DAY[day_words[0]["text"].lower()] if day_words else "Inny"

        day_lessons = _parse_single_stream_day(page, y_start, y_end, d_iso, day_name)
        for g, lessons in day_lessons.items():
            if lessons:
                if d_iso not in page_data[g]:
                    page_data[g][d_iso] = []
                page_data[g][d_iso].extend(lessons)

    return page_data


def _parse_single_stream_day(
    page: pdfplumber.page.Page,
    y_start: float,
    y_end: float,
    d_iso: str,
    day_name: str
) -> Dict[str, List[Dict[str, Any]]]:
    """
    Parses a single day's timetable bounded between y_start and y_end using spatial column coordinates.
    """
    result: Dict[str, List[Dict[str, Any]]] = {g: [] for g in STANDARD_GROUPS}

    t_chars = [c for c in page.chars if y_start <= c["top"] < y_end]
    if not t_chars:
        return result

    hour_chars = [c for c in t_chars if c["x0"] < 78.0]
    h_runs = extract_stream_runs(hour_chars)

    block_y: Dict[str, float] = {}
    for r in h_runs:
        for b_start, _ in BLOCK_TIMES:
            if b_start in r["text"]:
                block_y[b_start] = r["top"]

    sorted_blocks = sorted(block_y.items(), key=lambda x: x[1])
    if not sorted_blocks:
        return result

    for idx, (b_start, top_y) in enumerate(sorted_blocks):
        next_top_y = sorted_blocks[idx + 1][1] if idx + 1 < len(sorted_blocks) else y_end
        time_range = dict(BLOCK_TIMES).get(b_start, f"{b_start}-...")

        block_chars = [c for c in t_chars if top_y - 2.0 <= c["top"] < next_top_y - 2.0]

        # Check global room in 400.0 <= x < 430.0 (excluding vertical building banner at x >= 430)
        global_room = ""
        z3_chars = [c for c in block_chars if 400.0 <= c["x0"] < 430.0]
        z3_runs = extract_stream_runs(z3_chars)
        for zr in z3_runs:
            match = re.search(r"\b(Aula|Audytorium|Basen|ON-LINE|[A-Z]?\d{2,3}[a-z]?)\b", zr["text"], re.IGNORECASE)
            if match:
                global_room = match.group(1).upper()
                break

        # Zone 2 chars (group columns 78.0 to 350.0)
        z2_chars = [c for c in block_chars if 78.0 <= c["x0"] < 350.0]
        if not z2_chars:
            continue

        z2_runs = extract_stream_runs(z2_chars)
        z2_runs = [r for r in z2_runs if not re.fullmatch(r"GR[\.\s_]*\d+", r["text"].strip(), flags=re.IGNORECASE)]
        if not z2_runs:
            continue
        all_z2_txt = " ".join(r["text"] for r in z2_runs)
        if all_z2_txt.strip().lower() in ("przerwa", "wolne", "-"):
            continue

        # Check whether any subject starts in an odd group column (single-group allocation)
        has_odd_subject = False
        for r in z2_runs:
            t = r["text"].lower()
            if any(s in t for s in ("matematyka", "fizyka", "grafika", "nautyki", "nauki", "prawo")):
                x = r["x0"]
                for o_idx in (1, 3, 5, 7):
                    _, _, xmin, xmax = GROUP_BOUNDS[o_idx]
                    if xmin <= x < xmax:
                        has_odd_subject = True
                        break
            if has_odd_subject:
                break

        is_cohort_lecture = False
        if global_room in ("AULA", "ON-LINE") or "W" in [r["text"].strip() for r in z2_runs] or "organizacyjne" in all_z2_txt.lower():
            subj_count = sum(1 for r in z2_runs if any(ks in r["text"].lower() for ks in ("matematyka", "fizyka", "organizacyjne", "prawo", "grafika", "nautyki", "nauki")))
            if subj_count <= 1:
                is_cohort_lecture = True

        if is_cohort_lecture:
            combined_txt = " ".join(r["text"] for r in z2_runs)
            lesson = _extract_lesson_details(
                raw_text=combined_txt,
                fallback_room=global_room,
                time_range=time_range,
                day_name=day_name,
                date_iso=d_iso,
                group_name="GR.01"
            )
            if lesson:
                if global_room:
                    lesson["sala"] = global_room
                if "organizacyjne" in lesson["przedmiot"].lower():
                    lesson["forma"] = "wyklad"
                for grp in STANDARD_GROUPS:
                    g_lesson = dict(lesson)
                    g_lesson["grupa"] = grp
                    result[grp].append(g_lesson)
            continue

        if has_odd_subject:
            # Single groups (GROUP_BOUNDS)
            for g_idx, grp_name, xmin, xmax in GROUP_BOUNDS:
                col_runs = [r for r in z2_runs if xmin <= r["x0"] < xmax]
                if not col_runs:
                    continue
                combined_txt = " ".join(r["text"] for r in col_runs)
                lesson = _extract_lesson_details(
                    raw_text=combined_txt,
                    fallback_room=global_room,
                    time_range=time_range,
                    day_name=day_name,
                    date_iso=d_iso,
                    group_name=grp_name
                )
                if lesson:
                    result[grp_name].append(lesson)
        else:
            # Double groups (PAIR_BOUNDS)
            for p_idx, pair_names, xmin, xmax in PAIR_BOUNDS:
                pair_runs = [r for r in z2_runs if xmin <= r["x0"] < xmax]
                if not pair_runs:
                    continue
                combined_txt = " ".join(r["text"] for r in pair_runs)
                lesson = _extract_lesson_details(
                    raw_text=combined_txt,
                    fallback_room=global_room,
                    time_range=time_range,
                    day_name=day_name,
                    date_iso=d_iso,
                    group_name=pair_names[0]
                )
                if lesson:
                    for pn in pair_names:
                        g_lesson = dict(lesson)
                        g_lesson["grupa"] = pn
                        result[pn].append(g_lesson)

    return result


def _parse_single_table(table: List[List[Optional[str]]]) -> Dict[str, Dict[str, List[Dict[str, Any]]]]:
    """
    Parses a single vector table extracted from a PDF.
    Maintained as a backward-compatible parser and mockable test target.
    """
    if not table or len(table) < 4:
        return {}

    date_iso = None
    day_name = "Inny"
    for row in table[:2]:
        for cell in row:
            iso = normalize_iso_date(cell or "")
            if iso:
                date_iso = iso
            cleaned = (cell or "").strip().lower()
            if cleaned in POLISH_TO_STANDARD_DAY:
                day_name = POLISH_TO_STANDARD_DAY[cleaned]

    if not date_iso:
        return {}

    group_row_idx = None
    group_cols: Dict[int, str] = {}

    for r_idx in range(min(5, len(table))):
        row = table[r_idx]
        found_groups = {}
        for c_idx, cell in enumerate(row):
            txt = clean_cell_text(cell).upper()
            if re.match(r"^GR[\.\s_]*\d+", txt) or re.match(r"^\d{1,2}[A-Z]*$", txt):
                match = re.search(r"(\d+)", txt)
                if match:
                    group_num = int(match.group(1))
                    found_groups[c_idx] = f"GR.{group_num:02d}"
        if len(found_groups) >= 1:
            group_row_idx = r_idx
            group_cols = found_groups
            break

    if not group_cols:
        return {}

    result: Dict[str, Dict[str, List[Dict[str, Any]]]] = {
        group: {date_iso: []} for group in group_cols.values()
    }
    sorted_col_indices = sorted(group_cols.keys())

    time_rows = []
    for r_idx in range(group_row_idx + 1, len(table)):
        row = table[r_idx]
        h_start = (row[0] or "").strip()
        h_end = (row[1] or "").strip() if len(row) > 1 else ""
        if re.match(r"^\d{1,2}:\d{2}$", h_start):
            time_rows.append((r_idx, h_start, h_end, row))

    if not time_rows:
        return result

    blocks = []
    current_block = []
    for r_idx, h_start, h_end, row in time_rows:
        if h_start in ("08:00", "10:30", "13:30", "16:00", "18:30"):
            if current_block:
                blocks.append(current_block)
            current_block = [(r_idx, h_start, h_end, row)]
        elif h_start == "13:00":
            if current_block:
                blocks.append(current_block)
                current_block = []
        else:
            if current_block:
                current_block.append((r_idx, h_start, h_end, row))
            else:
                current_block = [(r_idx, h_start, h_end, row)]

    if current_block:
        blocks.append(current_block)

    for block in blocks:
        block_start = block[0][1]
        block_end = block[-1][2]
        time_range = f"{block_start}-{block_end}"
        block_rows = [b[3] for b in block]

        fallback_room = ""
        for brow in block_rows:
            for cell in reversed(brow):
                if cell and clean_cell_text(cell):
                    c_txt = clean_cell_text(cell)
                    if re.match(r"^(Aula|Audytorium|Basen|ON-LINE|[A-Z]?\d{2,3}[a-z]?)$", c_txt, re.IGNORECASE):
                        fallback_room = c_txt
                        break
            if fallback_room:
                break

        spans: List[List[int]] = []
        curr_span: List[int] = []

        for col_idx in sorted_col_indices:
            row0_val = block_rows[0][col_idx] if col_idx < len(block_rows[0]) else None
            if row0_val is None and curr_span:
                curr_span.append(col_idx)
            else:
                if curr_span:
                    spans.append(curr_span)
                curr_span = [col_idx]

        if curr_span:
            spans.append(curr_span)

        for span in spans:
            combined_texts = []
            for brow in block_rows:
                for c in span:
                    if c < len(brow) and brow[c] and brow[c].strip():
                        combined_texts.append(brow[c].strip())

            full_text = " ".join(combined_texts)
            if not full_text or full_text.lower() in ("przerwa", "-"):
                continue

            first_group = group_cols[span[0]]
            lesson = _extract_lesson_details(
                raw_text=full_text,
                fallback_room=fallback_room,
                time_range=time_range,
                day_name=day_name,
                date_iso=date_iso,
                group_name=first_group
            )
            if lesson:
                for c in span:
                    grp = group_cols[c]
                    grp_lesson = dict(lesson)
                    grp_lesson["grupa"] = grp
                    result[grp][date_iso].append(grp_lesson)

    return result


def _extract_lesson_details(
    raw_text: str,
    fallback_room: str,
    time_range: str,
    day_name: str,
    date_iso: str,
    group_name: str
) -> Optional[Dict[str, Any]]:
    """
    Decomposes cell text into domain fields: subject, teacher, room, form.
    External dict keys (przedmiot, sala, godziny, prowadzacy, forma) are strictly preserved.
    """
    cleaned = clean_merged_text(raw_text)
    cleaned = re.sub(r"\bPrzerwa\b", "", cleaned, flags=re.IGNORECASE)
    text = clean_cell_text(cleaned)
    if not text or text.lower() in ("przerwa", "wolne", "-"):
        return None

    # Discard if text consists solely of group identifiers
    no_groups = re.sub(r"\bGR[\.\s_]*\d+\b", "", text, flags=re.IGNORECASE).strip()
    if not no_groups:
        return None

    room = fallback_room
    teacher = ""
    form = "cwiczenia"

    # 1. Detect room name embedded in text (e.g. C136, Aula, B211, C30, C31, ON-LINE)
    room_match = re.search(r"\b(Aula|Audytorium|Basen|ON-LINE|[A-Z]\d{2,3}[a-z]?|\d{3})\b", text, re.IGNORECASE)
    if room_match:
        room = room_match.group(1).upper()
        text = text[:room_match.start()] + " " + text[room_match.end():]
        text = clean_cell_text(text)

    # 2. Detect didactic form (W - Lecture, Ćw/C - Exercises, L/Lab - Laboratory, P - Project, S - Simulator)
    form_match = re.search(r"\b(WYK|W|ĆW|C|LAB|L|PROJ|P|SYM|S)\b(?!\s+(?:transporcie|nawigacji|logistyce|zarządzaniu))", text)
    if form_match:
        code = form_match.group(1).upper()
        if code in ("W", "WYK"):
            form = "wyklad"
        elif code in ("LAB", "L"):
            form = "laboratorium"
        elif code in ("SYM", "S"):
            form = "symulator"
        elif code in ("PROJ", "P"):
            form = "projekt"
        else:
            form = "cwiczenia"
        text = text[:form_match.start()] + " " + text[form_match.end():]
        text = clean_cell_text(text)

    # 3. Detect instructor name and degree/title (supporting hyphenated surnames)
    teacher_match = re.search(
        r"([A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+(?:-[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+)?(?:\s+[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]+)?,\s*(?:dr|prof|mgr|inż|hab)[\w\s\.,]*)",
        text
    )
    if teacher_match:
        teacher = teacher_match.group(1).strip()
        text = text[:teacher_match.start()] + " " + text[teacher_match.end():]
        subject = clean_cell_text(text)
    else:
        # Check known teachers
        found_t = None
        for kt in KNOWN_TEACHER_SUBJECTS.keys():
            if kt.lower() in text.lower():
                found_t = kt
                break
        if found_t:
            teacher = found_t
            text = text.replace(found_t, "")
            subject = clean_cell_text(text)
        else:
            parts = [p.strip() for p in re.split(r"[|\n]", raw_text) if p.strip()]
            if len(parts) >= 2:
                subject = parts[0]
                teacher = parts[1]
            else:
                subject = text

    # Strip any trailing didactic form letter accidentally attached to teacher (e.g. 'mgr inż.C')
    if teacher:
        teacher = re.sub(r"[,\s]+[CWL]\b", "", teacher).strip()

    # Final cleanup of subject text
    subject = re.sub(r"\b(dr|prof|mgr|inż|hab)\b", "", subject, flags=re.IGNORECASE)
    subject = re.sub(r"\b(WYK|W|ĆW|C|LAB|L|PROJ|P|SYM|S)\b(?!\s+(?:transporcie|nawigacji|logistyce|zarządzaniu))", "", subject)
    subject = clean_cell_text(subject)

    # If subject is missing or defaulted to 'Zajęcia', infer from teacher
    if not subject or subject == "Zajęcia":
        for kt, ksub in KNOWN_TEACHER_SUBJECTS.items():
            if kt.lower() in teacher.lower():
                subject = ksub
                break

    if not subject:
        subject = "Zajęcia"

    subject = subject.strip(" ,.-")

    # Discard phantom lessons that have neither teacher nor room and are not recognized
    if not teacher and not room and subject not in KNOWN_TEACHER_SUBJECTS.values():
        return None

    return {
        "przedmiot": subject,
        "raw_przedmiot": raw_text,
        "prowadzacy": teacher,
        "godziny": time_range,
        "sala": room or "brak sali",
        "forma": form,
        "dzien": day_name,
        "data": date_iso,
        "grupa": group_name
    }
