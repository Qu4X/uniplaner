#!/usr/bin/env python3
"""
add_event_from_issue.py — GitOps parser dla zgłoszeń wydarzeń z GitHub Issues.
Odczytuje treść Issue Form (zmiennej środowiskowej ISSUE_BODY),
waliduje pola i dopisuje nowe wydarzenie do data/events.json.
"""

import json
import os
import re
import sys
import unicodedata

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EVENTS_JSON_PATH = os.path.join(REPO_ROOT, "tenants", "umg", "wn", "events.json")


def slugify(text: str) -> str:
    """Tworzy bezpieczny identyfikator slug z tytułu."""
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^\w\s-]", "", text).strip().lower()
    return re.sub(r"[-\s]+", "-", text)


def parse_issue_markdown(body: str) -> dict:
    """Parsuje sekcje markdown wygenerowane przez GitHub Issue Form."""
    sections = {}
    current_header = None
    current_lines = []

    for line in body.splitlines():
        if line.startswith("### "):
            if current_header:
                sections[current_header] = "\n".join(current_lines).strip()
            current_header = line[4:].strip()
            current_lines = []
        elif current_header:
            current_lines.append(line)

    if current_header:
        sections[current_header] = "\n".join(current_lines).strip()

    def get_val(header_prefix: str, default: str = "") -> str:
        for k, v in sections.items():
            if k.lower().startswith(header_prefix.lower()):
                if v == "_No response_" or v == "Brak odpowiedzi":
                    return default
                return v
        return default

    # Ekstrakcja pól
    title = get_val("Tytuł")
    date = get_val("Data")
    time_start = get_val("Godzina rozpoczęcia")
    time_end = get_val("Godzina zakończenia")
    type_raw = get_val("Typ i styl")
    location = get_val("Miejsce")
    description = get_val("Pełny opis")
    url_raw = get_val("Link")
    url = None
    if url_raw:
        url_clean = url_raw.strip()
        if re.match(r"^https?://", url_clean, re.IGNORECASE):
            url = url_clean
    button_text = get_val("Tekst na przycisku")
    target_mode_raw = get_val("Kto powinien")

    # Czyszczenie typu (np. 'flanki (Flanki i integracja...)' -> 'flanki')
    type_clean = "info"
    if type_raw:
        type_match = re.match(r"^([a-z_]+)", type_raw.strip().lower())
        if type_match:
            type_clean = type_match.group(1)

    # Czyszczenie trybu
    target_mode = "all"
    if target_mode_raw:
        mode_match = re.match(r"^([a-z_]+)", target_mode_raw.strip().lower())
        if mode_match:
            target_mode = mode_match.group(1)

    return {
        "title": title,
        "date": date,
        "time_start": time_start or None,
        "time_end": time_end or None,
        "type": type_clean,
        "location": location or None,
        "description": description or "",
        "url": url or None,
        "button_text": button_text or None,
        "target_mode": target_mode,
    }


def main():
    body = os.environ.get("ISSUE_BODY", "")
    issue_number = os.environ.get("ISSUE_NUMBER", "0")

    if not body.strip():
        print("BŁĄD: Zmienna ISSUE_BODY jest pusta.")
        sys.exit(1)

    parsed = parse_issue_markdown(body)

    title = parsed["title"]
    date = parsed["date"]

    if not title:
        print("BŁĄD: Brak wymaganego tytułu wydarzenia.")
        sys.exit(1)

    if not date or not re.match(r"^\d{4}-\d{2}-\d{2}$", date):
        print(f"BŁĄD: Niepoprawny format daty: '{date}' (oczekiwano YYYY-MM-DD).")
        sys.exit(1)

    # Generowanie unikalnego ID
    base_slug = slugify(title)[:35] or "event"
    event_id = f"{base_slug}-{date}"

    # Wczytanie istniejących wydarzeń
    events = []
    if os.path.exists(EVENTS_JSON_PATH):
        with open(EVENTS_JSON_PATH, "r", encoding="utf-8") as f:
            try:
                events = json.load(f)
                if not isinstance(events, list):
                    events = []
            except Exception:
                events = []

    # Unikanie kolizji ID
    existing_ids = {e.get("id") for e in events if isinstance(e, dict)}
    if event_id in existing_ids:
        event_id = f"{event_id}-issue-{issue_number}"

    new_event = {
        "id": event_id,
        "date": date,
        "time_start": parsed["time_start"],
        "time_end": parsed["time_end"],
        "title": title,
        "description": parsed["description"],
        "location": parsed["location"],
        "url": parsed["url"],
        "button_text": parsed["button_text"],
        "type": parsed["type"],
        "target": {
            "mode": parsed["target_mode"],
            "degree": "all"
        }
    }

    # Usunięcie kluczy o wartości None dla przejrzystości pliku
    cleaned_event = {k: v for k, v in new_event.items() if v is not None}
    if "target" not in cleaned_event:
        cleaned_event["target"] = {"mode": "all", "degree": "all"}

    events.append(cleaned_event)

    with open(EVENTS_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(events, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"SUKCES: Dodano wydarzenie '{title}' ({event_id}) do {EVENTS_JSON_PATH}")


if __name__ == "__main__":
    main()
