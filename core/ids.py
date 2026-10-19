"""
Generowanie deterministycznych identyfikatorów lekcji (SHA-256).
"""
import hashlib
from typing import Optional


def generate_lesson_id(
    subject: str,
    form: str,
    day_of_week: Optional[str],
    start_time: str,
    end_time: str,
    room: Optional[str] = None,
    half_semester: Optional[int] = None,
    interval_weeks: int = 1,
    start_date: Optional[str] = None,
    first_occurrence_date: Optional[str] = None
) -> str:
    """
    Tworzy stabilny, deterministyczny 16-znakowy hash SHA-256.
    Uwzględnia parametry cyklu (half_semester, interval_weeks, start_date),
    aby zapobiec kolizjom dla tych samych zajęć w 1. i 2. połowie semestru.
    Dla planów NST, gdzie day_of_week i start_date mogą być puste,
    używa first_occurrence_date.
    """
    s_norm = (subject or "").strip().lower()
    f_norm = (form or "").strip().lower()
    d_norm = (day_of_week or "").strip().upper()
    st_norm = (start_time or "").strip()
    et_norm = (end_time or "").strip()
    r_norm = (room or "").strip().lower()
    hs_norm = str(half_semester) if half_semester is not None else ""
    iw_norm = str(interval_weeks) if interval_weeks is not None else "1"
    sd_norm = (start_date or "").strip()
    fo_norm = (first_occurrence_date or "").strip()

    date_anchor = sd_norm if sd_norm else fo_norm

    raw_payload = f"{s_norm}|{f_norm}|{d_norm}|{st_norm}|{et_norm}|{r_norm}|{hs_norm}|{iw_norm}|{date_anchor}"
    return hashlib.sha256(raw_payload.encode("utf-8")).hexdigest()[:16]
