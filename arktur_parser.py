"""
Fasada kompatybilności wstecznej dla parsera HTML systemu Arktur UMG.
Implementacja właściwa (wraz ze strefą chronioną _wspolny_parser_html) znajduje się w sources/umg_wn/arktur_parser.py.
"""
from sources.umg_wn.arktur_parser import (
    DNI_MAPA,
    MANUAL_DICT_PATH,
    load_manual_subjects,
    oblicz_godzine_konca,
    _chunks_are_disjoint,
    _resolve_cell_ajax_key,
    _wspolny_parser_html,
    parsuj_plan_html,
    przetworz_plan_na_grafike,
)

__all__ = [
    "DNI_MAPA",
    "MANUAL_DICT_PATH",
    "load_manual_subjects",
    "oblicz_godzine_konca",
    "_chunks_are_disjoint",
    "_resolve_cell_ajax_key",
    "_wspolny_parser_html",
    "parsuj_plan_html",
    "przetworz_plan_na_grafike",
]
