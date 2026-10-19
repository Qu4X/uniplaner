"""
Client HTTP for part-time (NST) university schedules from arktur.umg.edu.pl.
Fetches available plans metadata from strpza5n.php and downloads PDF schedule files.
"""
import logging
import os
import re
from typing import Dict, List, Optional
import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

NST_LIST_URL = "https://arktur.umg.edu.pl/planyzaj/strpza5n.php"
NST_BASE_URL = "https://arktur.umg.edu.pl/planyzaj/"
DEFAULT_HEADERS = {"User-Agent": "Mozilla/5.0"}


def fetch_nst_plans_list(session: Optional[requests.Session] = None) -> List[Dict[str, str]]:
    """
    Fetches the list of available part-time (NST) schedules from strpza5n.php.
    Returns a list of plan dictionaries with metadata.
    """
    http_session = session or requests.Session()
    try:
        response = http_session.get(NST_LIST_URL, headers=DEFAULT_HEADERS, timeout=10)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")

        plans = []
        for anchor in soup.find_all("a", class_="link_powrot"):
            href = anchor.get("href", "")
            if not href.endswith(".pdf"):
                continue
            plan_name = anchor.get_text().strip()

            if href.startswith("http://") or href.startswith("https://"):
                full_url = href
            else:
                full_url = requests.compat.urljoin(NST_BASE_URL, href)

            filename = os.path.basename(href)
            plan_id = os.path.splitext(filename)[0]

            modified_date = ""
            table_row = anchor.find_parent("tr")
            if table_row:
                table_cells = table_row.find_all("td")
                if len(table_cells) >= 3:
                    modified_date = table_cells[2].get_text().strip()

            plans.append({
                "id": plan_id,
                "name": plan_name,
                "pdf_url": full_url,
                "filename": filename,
                "modified": modified_date
            })

        return plans
    except Exception as err:
        logger.error(f"Failed to fetch part-time plans list: {err}")
        return []


def download_pdf_file(pdf_url: str, output_path: str, session: Optional[requests.Session] = None) -> bool:
    """
    Downloads a PDF file from the given URL and saves it to output_path.
    """
    http_session = session or requests.Session()
    try:
        os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
        response = http_session.get(pdf_url, headers=DEFAULT_HEADERS, timeout=30)
        response.raise_for_status()
        with open(output_path, "wb") as output_file:
            output_file.write(response.content)
        return True
    except Exception as err:
        logger.error(f"Failed to download PDF {pdf_url}: {err}")
        return False


# Backward compatibility aliases for existing codebase callers
# (Public interface preserved: pobierz_liste_planow_nst and pobierz_plik_pdf)
pobierz_liste_planow_nst = fetch_nst_plans_list
pobierz_plik_pdf = download_pdf_file
