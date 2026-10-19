"""
Fasada kompatybilności wstecznej dla klienta HTTP systemu Arktur UMG.
Implementacja właściwa znajduje się w sources/umg_wn/arktur_client.py.
"""
import requests  # Zachowane dla testów patchujących arktur_client.requests.get
from sources.umg_wn.arktur_client import (
    URL_LISTA,
    URL_PLAN,
    URL_AJAX,
    DEFAULT_HEADERS,
    pobierz_liste_planow,
    pobierz_plany_w_modyfikacji,
    pobierz_dane_z_ajax,
    pobierz_surowy_plan,
)

__all__ = [
    "requests",
    "URL_LISTA",
    "URL_PLAN",
    "URL_AJAX",
    "DEFAULT_HEADERS",
    "pobierz_liste_planow",
    "pobierz_plany_w_modyfikacji",
    "pobierz_dane_z_ajax",
    "pobierz_surowy_plan",
]
