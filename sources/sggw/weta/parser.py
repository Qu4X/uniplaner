"""
Compatibility shim for sources.sggw.weta.parser -> sources.sggw.wmw.parser
"""
from sources.sggw.wmw.parser import (
    extract_groups_from_text,
    parse_time_bounds,
    extract_room_and_subject,
    parse_sggw_excel
)
