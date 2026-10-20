"""
sources/sggw_weta/client.py — Klient pobierania planów zajęć SGGW z SharePoint / stron wydziałowych.
"""
import os
import re
import logging
import requests
from typing import Dict, List, Optional
from bs4 import BeautifulSoup

logger = logging.getLogger("sggw_client")

WMW_SCHEDULE_URL = "https://wmw.sggw.edu.pl/strefa-studenta/plan-zajec-i-programy-studiow/"

DEFAULT_WMW_PLANS = {
    "wmw_sem_1": {
        "id": "wmw_sem_1",
        "name": "Weterynaria sem. 1 (I rok)",
        "sharepoint_url": "https://sggwpl-my.sharepoint.com/:x:/g/personal/p104180_sggw_edu_pl/IQBcyH8mcxXPQaPenU0RLYeBAWpMZW0xk9dmuun0jyqtwY8?e=svsMNY",
        "faculty": "WMW",
        "semester": 1
    },
    "wmw_sem_3": {
        "id": "wmw_sem_3",
        "name": "Weterynaria sem. 3 (II rok)",
        "sharepoint_url": "https://sggwpl-my.sharepoint.com/:x:/g/personal/p104180_sggw_edu_pl/IQDhYhbBZ2D3S4D7e-S7Pak9AZ33wCz9I1F92XcGMfpyKZg?e=5Za9Jo",
        "faculty": "WMW",
        "semester": 3
    },
    "wmw_sem_5": {
        "id": "wmw_sem_5",
        "name": "Weterynaria sem. 5 (III rok)",
        "sharepoint_url": "https://sggwpl-my.sharepoint.com/:x:/g/personal/p104180_sggw_edu_pl/IQAsjiuRwdAQSIEX2ODerN3TAc88vBeOiWSbt8mi0ruY4bE?e=dE6xM3",
        "faculty": "WMW",
        "semester": 5
    },
    "wmw_sem_7": {
        "id": "wmw_sem_7",
        "name": "Weterynaria sem. 7 (IV rok)",
        "sharepoint_url": "https://sggwpl-my.sharepoint.com/:x:/g/personal/p104180_sggw_edu_pl/IQB6QFz3yl8FRYXMqAhlLpVoAYNgS1MCPw5p2CDIc8PdADU?e=zhzcON",
        "faculty": "WMW",
        "semester": 7
    },
    "wmw_sem_9": {
        "id": "wmw_sem_9",
        "name": "Weterynaria sem. 9 (V rok)",
        "sharepoint_url": "https://sggwpl-my.sharepoint.com/:x:/g/personal/p104180_sggw_edu_pl/IQBs1xWlq9nQQq9byZjjUjHwAQNyI1j5sceaJjnDRRA5SY4?e=gSgq35",
        "faculty": "WMW",
        "semester": 9
    },
    "wmw_sem_11": {
        "id": "wmw_sem_11",
        "name": "Weterynaria sem. 11 (VI rok)",
        "sharepoint_url": "https://sggwpl-my.sharepoint.com/:x:/g/personal/p104180_sggw_edu_pl/IQA4ICXmjmziSI_lq8NA_qKbAVtW8pKpxxZkexRHtwr_yzI?e=xC5Ftz",
        "faculty": "WMW",
        "semester": 11
    }
}


def to_direct_download_url(sharepoint_url: str) -> str:
    """Konwertuje publiczny link SharePoint do bezpośredniego linku pobierania binarnego."""
    if not sharepoint_url:
        return ""
    sep = "&" if "?" in sharepoint_url else "?"
    if "download=1" not in sharepoint_url:
        return f"{sharepoint_url}{sep}download=1"
    return sharepoint_url


def download_plan_file(sharepoint_url: str, output_path: str, session: Optional[requests.Session] = None) -> bool:
    """Pobiera arkusz XLSX z SharePoint i zapisuje go lokalnie."""
    dl_url = to_direct_download_url(sharepoint_url)
    s = session or requests.Session()
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    try:
        resp = s.get(dl_url, headers=headers, allow_redirects=True, timeout=30)
        resp.raise_for_status()
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        with open(output_path, "wb") as f:
            f.write(resp.content)
        logger.info(f"Pobrano plan do {output_path} ({len(resp.content)} bajtów)")
        return True
    except Exception as e:
        logger.error(f"Błąd pobierania z SharePoint ({sharepoint_url}): {e}")
        return False
