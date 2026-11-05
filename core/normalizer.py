"""
Moduł deterministycznej sanityzacji i unifikacji danych o prowadzących, salach i przedmiotach.
Używany do budowy indeksów cross-reference oraz agregacji międzywydziałowej.
"""
import re
from typing import Dict, Optional, Any


# Regex dopasowujący tytuły naukowe z kropkami lub bez (np. prof, prof., inż, inż., dr, mgr)
_ACADEMIC_DEGREES_PATTERN = re.compile(
    r"(?i)\b(?:prof|dr|hab|inż|inz|mgr|zw|nadzw)\b\.?",
    re.IGNORECASE
)

# Przedrostki lub wrostki uczelniane często doklejane do tytułów (np. "prof. UMG dr hab.")
_INSTITUTION_AFFILIATIONS_PATTERN = re.compile(
    r"(?i)\b(?:umg|sggw|agh|pg|pw|uj|uw|wat)\b\.?",
    re.IGNORECASE
)


def strip_academic_degrees(name: str) -> str:
    """
    Usuwa tytuły i stopnie naukowe z nazwiska prowadzącego.
    Np. 'prof. UMG dr hab. Jan Kowalski, inż.' -> 'Jan Kowalski'
    """
    if not name:
        return ""
    
    # 1. Usunięcie afektów uczelnianych w tytułach
    cleaned = _INSTITUTION_AFFILIATIONS_PATTERN.sub(" ", name)
    # 2. Usunięcie stopni naukowych
    cleaned = _ACADEMIC_DEGREES_PATTERN.sub(" ", cleaned)
    # 3. Czyszczenie interpunkcji i spacji (zachowując kropki inicjałów)
    cleaned = re.sub(r"[,;:\(\)]+", " ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" -_")
    return cleaned


def canonicalize_teacher_name(name: str, aliases: Optional[Dict[str, str]] = None) -> str:
    """
    Ujednolica zapis nazwiska prowadzącego.
    1. Sprawdza słownik aliasów (jeśli przekazany).
    2. Czyści ze stopni naukowych.
    3. Zapewnia jednolite wielkości liter.
    """
    if not name:
        return ""
    
    raw = name.strip()
    if aliases and raw in aliases:
        return aliases[raw]
    
    # Oczyszczenie z tytułów
    cleaned = strip_academic_degrees(raw)
    if aliases and cleaned in aliases:
        return aliases[cleaned]
    
    parts = cleaned.split()
    if not parts:
        return raw

    # Sprawdzenie czy alias istnieje po lower-case
    if aliases:
        for k, v in aliases.items():
            if k.lower() == cleaned.lower():
                return v

    # Znormalizuj wielkości liter
    norm_parts = []
    for p in parts:
        if "-" in p:
            subparts = [sp.capitalize() for sp in p.split("-")]
            norm_parts.append("-".join(subparts))
        elif p.endswith(".") or len(p) == 1:
            norm_parts.append(p.upper() if p.endswith(".") else f"{p.upper()}.")
        else:
            norm_parts.append(p.capitalize())

    return " ".join(norm_parts)


def canonicalize_room_name(
    room: str,
    aliases: Optional[Dict[str, str]] = None,
    default_building_prefix: Optional[str] = None
) -> str:
    """
    Ujednolica identyfikator sali.
    Np. 'n-102', 'n102', 'sala N102' -> 'N102'
    Dla sal o prostej numeracji dodaje prefiks domyślny, jeśli podany (np. '102' -> 'N102').
    """
    if not room:
        return ""
        
    raw = room.strip()
    if aliases and raw in aliases:
        return aliases[raw]
    if aliases and raw.lower() in aliases:
        return aliases[raw.lower()]

    # Usunięcie zbędnych słów typu 'sala', 's.', 'room'
    cleaned = re.sub(r"(?i)\b(?:sala|s\.|room)\b\.?", "", raw).strip()
    
    # Obsługa zapisu z myślnikiem lub spacją: N-102, N 102 -> N102
    m_code = re.match(r"^([A-Za-z])[- ]?(\d+[a-zA-Z]?)$", cleaned)
    if m_code:
        cleaned = f"{m_code.group(1).upper()}{m_code.group(2).upper()}"
    elif re.match(r"^\d+[a-zA-Z]?$", cleaned) and default_building_prefix:
        cleaned = f"{default_building_prefix.upper()}{cleaned.upper()}"
    else:
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        if cleaned.lower() in ("aula", "audytorium", "basen", "hala"):
            cleaned = cleaned.capitalize()

    if aliases and cleaned in aliases:
        return aliases[cleaned]
    if aliases and cleaned.lower() in aliases:
        return aliases[cleaned.lower()]

    return cleaned
