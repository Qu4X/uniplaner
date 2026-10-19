"""
Fasada kompatybilności wstecznej dla klienta HTTP planów niestacjonarnych (NST) UMG.
Implementacja właściwa znajduje się w sources/umg_wn/nst_client.py.
"""
import requests
from sources.umg_wn.nst_client import (
    NST_LIST_URL,
    NST_BASE_URL,
    DEFAULT_HEADERS,
    fetch_nst_plans_list,
    download_pdf_file,
    pobierz_liste_planow_nst,
    pobierz_plik_pdf,
)

__all__ = [
    "requests",
    "NST_LIST_URL",
    "NST_BASE_URL",
    "DEFAULT_HEADERS",
    "fetch_nst_plans_list",
    "download_pdf_file",
    "pobierz_liste_planow_nst",
    "pobierz_plik_pdf",
]
