#!/usr/bin/env python3
"""
Scrapes official curriculum grids (siatki godzinowe) from WN UMG:
https://wn.umg.edu.pl/karty/siatki/s,{rok},{id_kierunku}
and generates a static reference file `wn_curriculum_forms.json`
mapping (major, semester, subject) to its scheduled forms of study
(wyklad, cwiczenia, laboratorium, symulator).
"""

import json
import logging
import os
import re
import urllib3
import requests
from bs4 import BeautifulSoup

urllib3.disable_warnings()
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("generate_curriculum_catalog")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_FILE = os.path.join(BASE_DIR, "sources", "umg", "wn", "forms", "wn_curriculum_forms.json")

YEARS = [2021, 2022, 2023, 2024, 2025]
MAJOR_IDS = range(1, 10)


def normalize_key(text: str) -> str:
    """Normalizes string for robust dictionary matching."""
    if not text:
        return ""
    # Lowercase, replace non-alphanumeric with spaces, collapse spaces
    text = text.strip().lower()
    text = re.sub(r'[\s\-_.,/()]+', ' ', text)
    return text.strip()


def parse_grid_page(year: int, major_id: int):
    url = f"https://wn.umg.edu.pl/karty/siatki/s,{year},{major_id}"
    try:
        r = requests.get(url, verify=False, timeout=10)
        if r.status_code != 200 or "table" not in r.text.lower():
            return None, None
        soup = BeautifulSoup(r.text, "html.parser")
        title_tag = soup.find("h2") or soup.find("h1")
        major_name = title_tag.get_text(strip=True) if title_tag else f"Major {major_id}"

        table = soup.find("table")
        if not table:
            return None, None

        rows = table.find_all("tr")
        if not rows:
            return None, None

        subjects_by_sem = {}

        for r_elem in rows:
            tds = [c.get_text(strip=True) for c in r_elem.find_all(["th", "td"])]
            if len(tds) > 2 and tds[0].isdigit():
                sub_name = tds[1].strip()
                norm_sub = normalize_key(sub_name)
                # Offset for semester s: 7 + (s - 1) * 5
                for s in range(1, 9):
                    offset = 7 + (s - 1) * 5
                    if offset + 4 <= len(tds):
                        a_h = int(tds[offset]) if tds[offset].isdigit() else 0
                        c_h = int(tds[offset + 1]) if tds[offset + 1].isdigit() else 0
                        l_h = int(tds[offset + 2]) if tds[offset + 2].isdigit() else 0
                        s_h = int(tds[offset + 3]) if tds[offset + 3].isdigit() else 0
                        
                        if a_h > 0 or c_h > 0 or l_h > 0 or s_h > 0:
                            forms = []
                            if a_h > 0: forms.append("wyklad")
                            if c_h > 0: forms.append("cwiczenia")
                            if l_h > 0: forms.append("laboratorium")
                            if s_h > 0: forms.append("symulator")

                            entry = {
                                "name": sub_name,
                                "A": a_h,
                                "C": c_h,
                                "L": l_h,
                                "S": s_h,
                                "forms": forms,
                                "single_form": forms[0] if len(forms) == 1 else None
                            }
                            subjects_by_sem.setdefault(str(s), {})[norm_sub] = entry

        return major_name, subjects_by_sem
    except Exception as e:
        logger.warning(f"Error fetching {year}, major {major_id}: {e}")
        return None, None


def main():
    logger.info("Scraping curriculum grids from WN UMG...")
    catalog = {
        "majors": {},
        "global_single_forms": {}  # For subjects with universally identical form across all majors & semesters (e.g. WF, BHP)
    }

    # Aggregate all data
    for major_id in MAJOR_IDS:
        canonical_major_name = None
        aggregated_sems = {}

        for year in YEARS:
            m_name, subjects_by_sem = parse_grid_page(year, major_id)
            if not subjects_by_sem:
                continue
            if not canonical_major_name:
                canonical_major_name = m_name

            # Merge into aggregated_sems (newer years overwrite/supplement)
            for sem, subs in subjects_by_sem.items():
                aggregated_sems.setdefault(sem, {})
                for norm_sub, entry in subs.items():
                    aggregated_sems[sem][norm_sub] = entry

        if canonical_major_name and aggregated_sems:
            norm_major = normalize_key(canonical_major_name)
            logger.info(f"Major '{canonical_major_name}' ({norm_major}): {sum(len(v) for v in aggregated_sems.values())} subject entries across {len(aggregated_sems)} semesters.")
            catalog["majors"][norm_major] = {
                "name": canonical_major_name,
                "semesters": aggregated_sems
            }

    # Build global single forms for subjects whose form is unique and unambiguous everywhere
    sub_forms_set = {}
    for major_data in catalog["majors"].values():
        for sem_data in major_data["semesters"].values():
            for norm_sub, entry in sem_data.items():
                if entry.get("single_form"):
                    sub_forms_set.setdefault(norm_sub, set()).add(entry["single_form"])
                else:
                    # Has multiple forms somewhere
                    sub_forms_set.setdefault(norm_sub, set()).add("multiple")

    for norm_sub, forms in sub_forms_set.items():
        if len(forms) == 1 and "multiple" not in forms:
            catalog["global_single_forms"][norm_sub] = list(forms)[0]

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, indent=2)

    logger.info(f"Saved curriculum forms catalog to {OUTPUT_FILE}")
    logger.info(f"Total majors: {len(catalog['majors'])}, Global unambiguous forms: {len(catalog['global_single_forms'])}")


if __name__ == "__main__":
    main()
