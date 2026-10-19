"""
Fasada kompatybilności wstecznej dla parsera PDF planów niestacjonarnych (NST) UMG.
Implementacja właściwa znajduje się w sources/umg_wn/nst_parser.py.
"""
from sources.umg_wn.nst_parser import (
    POLISH_TO_STANDARD_DAY,
    STANDARD_GROUPS,
    BLOCK_TIMES,
    GROUP_BOUNDS,
    PAIR_BOUNDS,
    KNOWN_TEACHER_SUBJECTS,
    normalize_iso_date,
    clean_cell_text,
    clean_merged_text,
    extract_stream_runs,
    _extract_lesson_details,
    _parse_single_table,
    parse_pdf_schedule,
)

__all__ = [
    "POLISH_TO_STANDARD_DAY",
    "STANDARD_GROUPS",
    "BLOCK_TIMES",
    "GROUP_BOUNDS",
    "PAIR_BOUNDS",
    "KNOWN_TEACHER_SUBJECTS",
    "normalize_iso_date",
    "clean_cell_text",
    "clean_merged_text",
    "extract_stream_runs",
    "_extract_lesson_details",
    "_parse_single_table",
    "parse_pdf_schedule",
]
