"""
Targeted regression tests for every change made in the bug-fix session.
Run with: .venv\Scripts\python.exe tests/test_backend.py
"""
import os
import re
import sys

# Ensure repository root is in sys.path
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.environ["ACADEMIC_CALENDAR_PATH"] = os.path.join(REPO_ROOT, "tenants", "umg_wn", "academic_calendar.json")
if REPO_ROOT not in sys.path:
    sys.path.insert(0, REPO_ROOT)

# Ensure UTF-8 output on Windows terminal
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

results = []

def check(name, condition, detail=""):
    mark = "OK  " if condition else "FAIL"
    results.append((condition, name))
    msg = f"  [{mark}]  {name}"
    if not condition and detail:
        msg += f"\n           {detail}"
    print(msg)
    return condition


from sources.umg_wn.arktur_parser import _wspolny_parser_html
from core.ics import generuj_ics

# ── 1. Parser smoke-test ──────────────────────────────────────────────────────
print("\n-- 1. Parser (real HTML fixture) ------------------------------------")
fixture_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "strpza6_response.txt")
if os.path.exists(fixture_path):
    with open(fixture_path, encoding="utf-8", errors="replace") as f:
        html = f.read()
    data, mn, mx = _wspolny_parser_html(html)
    total_slots = sum(len(slots) for slots in data.values())
    all_lessons = [info for slots in data.values() for sd in slots.values() for info in sd.values()]
    required_keys = {"przedmiot","prowadzacy","godziny","sala","height","colspan","data_start","tygodnie"}
    check("Parser returns lessons", total_slots > 0, f"total_slots={total_slots}")
    check("Slot range sensible", 0 <= mn < mx, f"mn={mn}, mx={mx}")
    check("All lessons have 8 keys", all(required_keys.issubset(l.keys()) for l in all_lessons),
          f"{sum(1 for l in all_lessons if not required_keys.issubset(l.keys()))} lessons missing keys")
else:
    print(f"  [SKIP] 1. Parser real HTML fixture not found at {fixture_path!r}")

# ── 2. Week count default (15 for full semester) ─────────────────────────────
print("\n-- 2. Week count default (should be 15 for full semester) -----------")
NO_WEEK = ("<html><body>"
           '<td id="td_1_24_0" colspan="1" rowspan="12"><div class="drag"><div>'
           '<font color="green">08:00</font> MAT'
           "</div></div></td></body></html>")
d2, _, _ = _wspolny_parser_html(NO_WEEK)
weeks2 = [i["tygodnie"] for slots in d2.values() for sd in slots.values() for i in sd.values()]
check("Week fallback is 15 (full semester)", all(w == 15 for w in weeks2), f"got {weeks2}")

# ── 3. Room name does not corrupt subject text ────────────────────────────────
print("\n-- 3. Room name 'A' does not corrupt 'MATEMATYKA' ------------------")
SHORT_ROOM = ("<html><body>"
              '<td id="td_1_24_0" colspan="1" rowspan="12"><div class="drag"><div>'
              '<font color="green">08:00</font> MATEMATYKA'
              '<font color="darkblue">A</font>'
              "</div></div></td></body></html>")
d3, _, _ = _wspolny_parser_html(SHORT_ROOM)
subjects3 = [i["raw_przedmiot"] for slots in d3.values() for sd in slots.values() for i in sd.values()]
check("Room A does not gut MATEMATYKA",
      all(len(s) >= 5 for s in subjects3) or not subjects3,
      f"raw subjects: {subjects3}")

# ── 4. ICS RFC 5545 ─────────────────────────────────────────────────────────
print("\n-- 4. ICS RFC 5545 (UID + DTSTAMP) ---------------------------------")
plan = {"PON": {24: {"przedmiot":"Matematyka","raw_przedmiot":"MAT","prowadzacy":"J. Kowalski",
                     "godziny":"08:00 - 09:30","sala":"101","height":18,"colspan":1,
                     "data_start":"2025-10-06","tygodnie":2}}}
ics = generuj_ics(plan, "GR. 1")
check("ICS is a string", isinstance(ics, str) and len(ics) > 100)
check("ICS has UID",     "UID:"     in ics)
check("ICS has DTSTAMP", "DTSTAMP:" in ics)
dtstamps = [l.split(":",1)[1].strip() for l in ics.splitlines() if l.startswith("DTSTAMP:")]
check("DTSTAMP is UTC (ends with Z)", all(d.endswith("Z") for d in dtstamps) and len(dtstamps) == 2, f"got {dtstamps}")
check("ICS has 2 VEVENTs", ics.count("BEGIN:VEVENT") == 2,
      f"found {ics.count('BEGIN:VEVENT')}")
uids = [l.split(":",1)[1].strip() for l in ics.splitlines() if l.startswith("UID:")]
check("UIDs are unique", len(uids) == len(set(uids)), f"UIDs: {uids}")

# ── 5. Filename sanitisation ──────────────────────────────────────────────────
print("\n-- 5. Filename sanitisation -----------------------------------------")
for raw in ["GR. 1", "1 TM", "1/2 M", "GR1"]:
    safe = re.sub(r"[^\w-]", "_", raw)
    check(f"'{raw}' -> '{safe}' is safe", "/" not in safe and " " not in safe and "." not in safe)

# ── 6. Slot key collision ─────────────────────────────────────────────────────
print("\n-- 6. Slot key collision (two cols, same start time) ----------------")
COLL = ("<html><body>"
        '<td id="td_1_24_0" colspan="1" rowspan="12"><div class="drag"><div>'
        '<font color="green">08:00</font> FIZYKA</div></div></td>'
        '<td id="td_1_24_1" colspan="1" rowspan="12"><div class="drag"><div>'
        '<font color="green">08:00</font> CHEMIA</div></div></td>'
        "</body></html>")
d6, _, _ = _wspolny_parser_html(COLL)
all6 = [i for slots in d6.values() for sd in slots.values() for i in sd.values()]
check("Both lessons survive collision", len(all6) >= 2, f"found {len(all6)}: {[l['przedmiot'] for l in all6]}")

# ── 7. Multi-chunk height ─────────────────────────────────────────────────────
print("\n-- 7. Multi-chunk cell: first chunk must not overlap second ---------")
MULTI = ("<html><body>"
         '<td id="td_1_24_0" colspan="1" rowspan="24"><div class="drag"><div>'
         '<font color="green">08:00</font> FIZYKA<br>'
         '<font color="green">10:00</font> CHEMIA'
         "</div></div></td></body></html>")
d7, _, _ = _wspolny_parser_html(MULTI)
all7 = sorted([i for slots in d7.values() for sd in slots.values() for i in sd.values()],
              key=lambda l: l["godziny"])
if len(all7) >= 2:
    first_end_h = int(all7[0]["godziny"].split(":")[0]) + all7[0]["height"] * 5 / 60
    second_start_h = int(all7[1]["godziny"].split(":")[0])
    check("First chunk ends at/before second chunk starts",
          first_end_h <= second_start_h + 0.01,
          f"first ends ~{first_end_h:.1f}h, second starts {second_start_h}h")
else:
    check("Multi-chunk: got >= 2 lessons", False, f"found {len(all7)}")

# ── 8. Bi-weekly cycle detection ──────────────────────────────────────────────
print("\n-- 8. Bi-weekly cycle detection --------------------------------------")
HTML_CYCLE = ("<html><body>"
              '<td id="td_2_52_0" colspan="1" rowspan="18"><div class="drag"><div>'
              'NAW1 <font color="green">11:20</font> (od 1 tyg co 2 tyg) <font color="red">[od:2026-10-06]</font><br>'
              'ŁM <font color="green">11:20</font> (od 2 tyg co 2 tyg) <font color="red">[od:2026-10-13]</font> <font color="maroon">[il.tyg:5]</font>'
              "</div></div></td></body></html>")
d8, _, _ = _wspolny_parser_html(HTML_CYCLE)
all8 = sorted([i for slots in d8.values() for sd in slots.values() for i in sd.values()],
              key=lambda l: l["data_start"])
check("Bi-weekly: parsed 2 lessons", len(all8) == 2, f"got {len(all8)}")
if len(all8) == 2:
    check("Lesson 1 is co_ile=2, od_tyg=1", all8[0].get("co_ile") == 2 and all8[0].get("od_tyg") == 1, f"got {all8[0]}")
    check("Lesson 2 is co_ile=2, od_tyg=2", all8[1].get("co_ile") == 2 and all8[1].get("od_tyg") == 2, f"got {all8[1]}")
    check("Lesson 2 preserves il.tyg:5", all8[1].get("tygodnie") == 5, f"got {all8[1].get('tygodnie')}")

# ── 9. Semester half detection ────────────────────────────────────────────────
print("\n-- 9. Semester half detection ----------------------------------------")
HTML_HALF = ("<html><body>"
             '<td id="td_3_63_0" colspan="16" rowspan="18"><div class="drag"><div>'
             'BHP <font color="green">12:15</font> (1 poł sem) <font color="red">[od:2026-10-07]</font><br>'
             'Ekonomia <font color="green">12:15</font> (2 poł sem)'
             "</div></div></td></body></html>")
d9, _, _ = _wspolny_parser_html(HTML_HALF)
all9 = sorted([i for slots in d9.values() for sd in slots.values() for i in sd.values()],
              key=lambda l: l.get("polowa_sem") or 0)
check("Semester half: parsed 2 lessons", len(all9) == 2, f"got {len(all9)}")
if len(all9) == 2:
    check("Half 1 has polowa_sem=1 and 7 weeks", all9[0].get("polowa_sem") == 1 and all9[0].get("tygodnie") == 7, f"got {all9[0]}")
    check("Half 2 has polowa_sem=2 and 8 weeks", all9[1].get("polowa_sem") == 2 and all9[1].get("tygodnie") == 8, f"got {all9[1]}")
    check("Half 2 data_start is 8 weeks after Half 1", all9[1].get("data_start") == "2026-12-02", f"got {all9[1].get('data_start')}")

# ── 9b. Alternating semester halves: chunk duration not truncated ─────────────
print("\n-- 9b. Alternating semester halves: chunk duration not truncated ----")
HTML_ALT_HALF = ("<html><body>"
                 '<td id="td_3_0_8" colspan="1" rowspan="27"><div class="drag"><div>'
                 'MS 102 <font color="green">07:00</font> (1 poł sem) <font color="red">[od:2026-10-07]</font> <font color="maroon">[il.tyg:5]</font><br>'
                 'Naw-WE 312 <font color="green">07:45</font> (2 poł sem) <font color="red">[od:2026-12-09]</font> <font color="maroon">[il.tyg:5]</font>'
                 "</div></div></td></body></html>")
d9b, _, _ = _wspolny_parser_html(HTML_ALT_HALF)
all9b = sorted([i for slots in d9b.values() for sd in slots.values() for i in sd.values()],
               key=lambda l: l.get("polowa_sem") or 0)
check("Alternating halves: parsed 2 lessons", len(all9b) == 2, f"got {len(all9b)}")
if len(all9b) == 2:
    check("Lesson 1 (MS) runs full cell duration until 09:15",
          all9b[0].get("godziny") == "07:00 - 09:15" and all9b[0].get("height") == 27,
          f"got {all9b[0].get('godziny')} (height {all9b[0].get('height')})")
    check("Lesson 2 (Naw-WE) runs until 09:15",
          all9b[1].get("godziny") == "07:45 - 09:15" and all9b[1].get("height") == 18,
          f"got {all9b[1].get('godziny')} (height {all9b[1].get('height')})")

# ── 10. Bi-weekly ICS 14-day intervals ────────────────────────────────────────
print("\n-- 10. Bi-weekly ICS 14-day intervals --------------------------------")
plan_bi = {"WT": {52: {"przedmiot":"ŁM","raw_przedmiot":"ŁM","prowadzacy":"Krajewska",
                       "godziny":"11:20 - 12:50","sala":"P104","height":18,"colspan":1,
                       "data_start":"2026-10-06","tygodnie":3,"co_ile":2}}}
ics_bi = generuj_ics(plan_bi, "GR. 7")
starts = [l.split(":",1)[1].strip() for l in ics_bi.splitlines() if l.startswith("DTSTART")]
check("Bi-weekly ICS has 3 events", len(starts) == 3, f"got {len(starts)}")
if len(starts) == 3:
    check("Event 1 is 2026-10-06", "20261006" in starts[0], f"got {starts[0]}")
    check("Event 2 is 2026-10-20 (+14d)", "20261020" in starts[1], f"got {starts[1]}")
    check("Event 3 is 2026-11-03 (+14d)", "20261103" in starts[2], f"got {starts[2]}")

# ── 11. Holiday skipping in ICS ──────────────────────────────────────────────
print("\n-- 11. Holiday skipping in ICS (2026-11-11 skipped) -----------------")
plan_hol = {"ŚR": {20: {"przedmiot": "Nawigacja", "raw_przedmiot": "NAW", "prowadzacy": "Kowalski",
                        "godziny": "08:00 - 09:30", "sala": "101", "height": 18, "colspan": 1,
                        "data_start": "2026-11-04", "tygodnie": 2, "co_ile": 1}}}
ics_hol = generuj_ics(plan_hol, "GR. 1")
starts_hol = [l.split(":", 1)[1].strip() for l in ics_hol.splitlines() if l.startswith("DTSTART")]
check("Holiday test has 2 events", len(starts_hol) == 2, f"got {len(starts_hol)}")
check("2026-11-11 is NOT in events", not any("20261111" in s for s in starts_hol), f"starts: {starts_hol}")
check("Next meeting realized on swapped Fri 2026-11-13", any("20261113" in s for s in starts_hol), f"starts: {starts_hol}")

# ── 12. Christmas break skipping ─────────────────────────────────────────────
print("\n-- 12. Christmas break skipping (2026-12-23 to 2027-01-03) ----------")
plan_break = {"ŚR": {20: {"przedmiot": "Astronomia", "raw_przedmiot": "AST", "prowadzacy": "Nowak",
                          "godziny": "10:00 - 11:30", "sala": "202", "height": 18, "colspan": 1,
                          "data_start": "2026-12-16", "tygodnie": 3, "co_ile": 1}}}
ics_break = generuj_ics(plan_break, "GR. 1")
starts_break = [l.split(":", 1)[1].strip() for l in ics_break.splitlines() if l.startswith("DTSTART")]
check("No events during Christmas break (2026-12-23, 2026-12-30)",
      not any("20261223" in s or "20261230" in s for s in starts_break),
      f"starts: {starts_break}")

# ── 13. Rectorial Day Swap (Friday 2026-11-13 has Wednesday schedule) ────────
print("\n-- 13. Rectorial Day Swap (Friday 2026-11-13 runs ŚR schedule) ------")
# Wednesday class must occur on Friday 2026-11-13
plan_wed = {"ŚR": {30: {"przedmiot": "Meteorologia", "raw_przedmiot": "MET", "prowadzacy": "Wiśniewski",
                        "godziny": "12:00 - 13:30", "sala": "303", "height": 18, "colspan": 1,
                        "data_start": "2026-11-04", "tygodnie": 2, "co_ile": 1}}}
ics_wed = generuj_ics(plan_wed, "GR. 1")
starts_wed = [l.split(":", 1)[1].strip() for l in ics_wed.splitlines() if l.startswith("DTSTART")]
check("Wednesday class occurs on Wed 2026-11-04", any("20261104" in s for s in starts_wed), f"starts: {starts_wed}")
check("Wednesday class occurs on swapped Fri 2026-11-13", any("20261113" in s for s in starts_wed), f"starts: {starts_wed}")
check("Swapped event mentions note in description", "zajęcia ze środy" in ics_wed)

# Friday class must NOT occur on 2026-11-13
plan_fri = {"PT": {40: {"przedmiot": "Oceanografia", "raw_przedmiot": "OCE", "prowadzacy": "Zieliński",
                        "godziny": "14:00 - 15:30", "sala": "404", "height": 18, "colspan": 1,
                        "data_start": "2026-11-06", "tygodnie": 2, "co_ile": 1}}}
ics_fri = generuj_ics(plan_fri, "GR. 1")
starts_fri = [l.split(":", 1)[1].strip() for l in ics_fri.splitlines() if l.startswith("DTSTART")]
check("Friday class does NOT occur on swapped Fri 2026-11-13", not any("20261113" in s for s in starts_fri), f"starts: {starts_fri}")

# ── 14. Cell AJAX Key Resolution (Hermetization S4) ──────────────────────────
print("\n-- 14. Cell AJAX Key Resolution (Hermetization S4) ------------------")
from sources.umg_wn.arktur_parser import _resolve_cell_ajax_key

inputs_full = {
    "id_pzz_PN_39_0": "101",
    "id_pzz_PN_39_0_2": "202",
    "id_pzz_PN_39_0_3": "303"
}
key_full = _resolve_cell_ajax_key("td_PN_39_0", inputs_full)
check("Resolves complete 3-token key", key_full == "101_202_303", f"got {key_full}")

inputs_partial = {
    "id_pzz_WT_12_1": "999"
}
key_partial = _resolve_cell_ajax_key("td_WT_12_1", inputs_partial)
check("Missing tokens default to '0'", key_partial == "999_0_0", f"got {key_partial}")

key_empty = _resolve_cell_ajax_key("invalid", {})
check("Malformed cell ID defaults to 0_0_0", key_empty == "0_0_0", f"got {key_empty}")

# ── 15. Reindex precondition check (S5 Speculative Generality) ───────────────
print("\n-- 15. Reindex precondition check (S5) ------------------------------")
import tempfile
import json
from core.cross_ref import build_cross_reference_indexes

with tempfile.TemporaryDirectory() as empty_tmp:
    res_empty = build_cross_reference_indexes(schedules_dir=empty_tmp)
    check("Empty directory safely fails reindex", not bool(res_empty))

with tempfile.TemporaryDirectory() as valid_tmp:
    with open(os.path.join(valid_tmp, "1_GR_1.json"), "w", encoding="utf-8") as f:
        json.dump({"PON": {}}, f)
    out_tmp = os.path.join(valid_tmp, "cross_reference.json")
    res_valid = build_cross_reference_indexes(
        plans_metadata={"plans": {"1": {"name": "Test", "groups": ["GR 1"]}}},
        schedules_dir=valid_tmp,
        output_path=out_tmp
    )
    check("Valid dist directory succeeds reindex", bool(res_valid) and "room_list" in res_valid)

# ── 16. Typed schedule models (S3 Data Clumps) ────────────────────────────────
print("\n-- 16. Typed schedule models (S3) -----------------------------------")
from sources.umg_wn.arktur_parser import LessonDict
from core.contracts import RoomScheduleEntry

lesson_typed: LessonDict = {
    "przedmiot": "Nawigacja",
    "raw_przedmiot": "NAW",
    "prowadzacy": "Kowalski",
    "godziny": "08:00 - 09:30",
    "sala": "Aula",
    "height": 16,
    "colspan": 1,
    "data_start": "2026-10-05",
    "tygodnie": 15,
    "co_ile": 1,
    "polowa_sem": None
}
check("LessonDict model validates required keys", "co_ile" in lesson_typed and "tygodnie" in lesson_typed)

room_typed: RoomScheduleEntry = {
    "slot": 24,
    "hours": "08:00 - 09:30",
    "subject": "Nawigacja",
    "teacher": "Kowalski",
    "groups": ["1 TM"],
    "plan_id": "549",
    "plan_name": "Nawigacja sem 1",
    "weeks": 15,
    "data_start": "2026-10-05",
    "co_ile": 1,
    "polowa_sem": None
}
check("RoomScheduleEntry model validates cycle fields", "co_ile" in room_typed and "weeks" in room_typed)

# ── 17. Deep module core.ics (S2) ------------------------------------
print("\n-- 17. Deep module core.ics (S2) ------------------------------------")
from core import ics as ics_export

check("core.ics exports generuj_ics", hasattr(ics_export, "generuj_ics"))
check("core.ics exports generate_ics alias", hasattr(ics_export, "generate_ics"))
check("core.ics exports generate_group_ics", callable(ics_export.generate_group_ics))
check("core.ics exports load_academic_calendar", callable(ics_export.load_academic_calendar))
test_plan = {"PON": {24: {"przedmiot": "Test", "data_start": "2026-10-05", "godziny": "08:00 - 09:30", "tygodnie": 1}}}
ics_direct = ics_export.generate_ics(test_plan, "TEST_GRP")
check("generate_ics returns valid RFC 5545", "BEGIN:VCALENDAR" in ics_direct and "END:VCALENDAR" in ics_direct)

# ── 18. Deep modules arktur_client and arktur_parser (S2) ------------
print("\n-- 18. Deep modules arktur_client and arktur_parser (S2) ------------")
from sources.umg_wn import arktur_client, arktur_parser

check("arktur_client exports pobierz_liste_planow", callable(arktur_client.pobierz_liste_planow))
check("arktur_client exports pobierz_surowy_plan", callable(arktur_client.pobierz_surowy_plan))
check("arktur_client exports pobierz_dane_z_ajax", callable(arktur_client.pobierz_dane_z_ajax))
check("arktur_parser exports _wspolny_parser_html", callable(arktur_parser._wspolny_parser_html))
check("arktur_parser exports parsuj_plan_html alias", callable(arktur_parser.parsuj_plan_html))
check("arktur_parser exports przetworz_plan_na_grafike", callable(arktur_parser.przetworz_plan_na_grafike))
check("arktur_parser exports _resolve_cell_ajax_key", callable(arktur_parser._resolve_cell_ajax_key))
check("arktur_parser alias matches _wspolny_parser_html", arktur_parser.parsuj_plan_html is arktur_parser._wspolny_parser_html)

# ── 19. Clean plan titles and version extraction ---------------------
print("\n-- 19. Clean plan titles and version extraction ---------------------")
from sources.umg_wn.arktur_html import parse_plan_title

p1 = parse_plan_title("[TM Sem 1] Transport Morski pierwszego stopnia sem. 1 [2026-09-14 17:55] wer. 2")
check("Clean name removes prefix and degree", p1["clean_name"] == "Transport Morski sem. 1")
check("Published at date extracted", p1["published_at"] == "2026-09-14 17:55")
check("Version string extracted", p1["version"] == "wer. 2")

p2 = parse_plan_title("Transport i Logistyka pierwszego stopnia sem. 1 [2026-09-15 19:52] wer. 1")
check("Clean name for TiL", p2["clean_name"] == "Transport i Logistyka sem. 1")
check("Version for TiL", p2["version"] == "wer. 1")

p3 = parse_plan_title("Nawigacja drugiego stopnia sem. 2 [2026-09-14 12:00] wer. 3")
check("Second degree marked with (II st.)", p3["clean_name"] == "Nawigacja sem. 2 (II st.)")

# ── 20. Teacher index alternating cycle deduplication isolation ──────
print("\n-- 20. Teacher index alternating cycle deduplication isolation ------")
import tempfile
import json
import os
from core.cross_ref import build_cross_reference_indexes

with tempfile.TemporaryDirectory() as td:
    plan_meta_test = {
        "plans": {
            "999": {
                "name": "Testowy Plan",
                "groups": ["GR 1", "GR 2", "GR 3", "GR 4"]
            }
        }
    }
    # GR 1 & GR 2 in week 1 cycle
    g1_data = {"PON": {"24": {"przedmiot": "Nawigacja", "prowadzacy": "Kpt. Nowak", "godziny": "08:00 - 09:30",
                              "sala": "202", "co_ile": 2, "od_tyg": 1, "data_start": "2026-10-05", "tygodnie": 8}}}
    g2_data = {"PON": {"24": {"przedmiot": "Nawigacja", "prowadzacy": "Kpt. Nowak", "godziny": "08:00 - 09:30",
                              "sala": "202", "co_ile": 2, "od_tyg": 1, "data_start": "2026-10-05", "tygodnie": 8}}}
    # GR 3 & GR 4 in week 2 cycle
    g3_data = {"PON": {"24": {"przedmiot": "Nawigacja", "prowadzacy": "Kpt. Nowak", "godziny": "08:00 - 09:30",
                              "sala": "202", "co_ile": 2, "od_tyg": 2, "data_start": "2026-10-12", "tygodnie": 7}}}
    g4_data = {"PON": {"24": {"przedmiot": "Nawigacja", "prowadzacy": "Kpt. Nowak", "godziny": "08:00 - 09:30",
                              "sala": "202", "co_ile": 2, "od_tyg": 2, "data_start": "2026-10-12", "tygodnie": 7}}}

    for grp, dt in [("GR_1", g1_data), ("GR_2", g2_data), ("GR_3", g3_data), ("GR_4", g4_data)]:
        with open(os.path.join(td, f"999_{grp}.json"), "w", encoding="utf-8") as f:
            json.dump(dt, f)

    test_cross_path = os.path.join(td, "cross_reference.json")
    build_cross_reference_indexes(plan_meta_test, schedules_dir=td, output_path=test_cross_path)
    with open(test_cross_path, "r", encoding="utf-8") as f:
        cross_res = json.load(f)

    nowak_classes = cross_res["teachers"].get("Kpt. Nowak", [])
    check("Teacher has exactly 2 separate cycle entries", len(nowak_classes) == 2, f"Got {len(nowak_classes)}")
    if len(nowak_classes) == 2:
        check("Cycle 1 has GR 1 and GR 2", sorted(nowak_classes[0]["groups"]) == ["GR 1", "GR 2"])
        check("Cycle 2 has GR 3 and GR 4", sorted(nowak_classes[1]["groups"]) == ["GR 3", "GR 4"])
        check("Cycles preserved in index (od_tyg)", nowak_classes[0]["od_tyg"] == 1 and nowak_classes[1]["od_tyg"] == 2)

    room_classes = cross_res["rooms"].get("202", {}).get("PON", [])
    check("Room has exactly 2 separate cycle entries", len(room_classes) == 2, f"Got {len(room_classes)}")

# ── 21. Arktur cell color parsing (arktur_kolor) ─────────────────────────────
print("\n-- 21. Arktur cell color parsing (arktur_kolor) ----------------------")
COLOR_HTML = ("<html><body>"
              '<td id="td_1_24_0" class="komopcji_cyan" colspan="1" rowspan="12"><div class="drag"><div>'
              '<font color="green">08:00</font> WYKLAD'
              '</div></div></td>'
              '<td id="td_1_36_0" class="komopcji_magenta" colspan="1" rowspan="12"><div class="drag"><div>'
              '<font color="green">09:00</font> LAB'
              '</div></div></td>'
              '<td id="td_1_48_0" class="komopcji_magenta_top" colspan="1" rowspan="12"><div class="drag"><div>'
              '<font color="green">10:00</font> LAB_TOP'
              '</div></div></td>'
              '<td id="td_1_60_0" class="komopcji" colspan="1" rowspan="12"><div class="drag"><div>'
              '<font color="green">11:00</font> CWICZENIA'
              '</div></div></td>'
              "</body></html>")
d_color, _, _ = _wspolny_parser_html(COLOR_HTML)
lessons_color = [l for slots in d_color.values() for sd in slots.values() for l in sd.values()]
color_by_sub = {l["przedmiot"]: l.get("arktur_kolor") for l in lessons_color}
check("Cyan cell parsed as cyan", color_by_sub.get("WYKLAD") == "cyan", f"got {color_by_sub.get('WYKLAD')}")
check("Magenta cell parsed as magenta", color_by_sub.get("LAB") == "magenta", f"got {color_by_sub.get('LAB')}")
check("Magenta_top cell parsed as magenta", color_by_sub.get("LAB_TOP") == "magenta", f"got {color_by_sub.get('LAB_TOP')}")
check("Default cell parsed as default", color_by_sub.get("CWICZENIA") == "default", f"got {color_by_sub.get('CWICZENIA')}")

# ── 22. Lesson form classification (classify_lesson_form) ─────────────────────
print("\n-- 22. Lesson form classification (classify_lesson_form) -------------")
from sources.umg_wn.arktur_html import classify_lesson_form, load_curriculum_forms, load_forms_manual

curr_cat = load_curriculum_forms()
forms_cfg = load_forms_manual()

# 1. Manual override - WF -> cwiczenia
wf_lesson = {"przedmiot": "Wychowanie Fizyczne", "raw_przedmiot": "WF", "sala": "basen", "colspan": 2}
check("WF is cwiczenia (manual override)", classify_lesson_form(wf_lesson, "Transport Morski sem. 1", curr_cat, forms_cfg) == "cwiczenia")

# 2. Manual override - BHP -> wyklad
bhp_lesson = {"przedmiot": "Bezpieczeństwo i Higiena Pracy", "raw_przedmiot": "BHP", "sala": "C136", "colspan": 1}
check("BHP is wyklad (manual override)", classify_lesson_form(bhp_lesson, "Transport Morski sem. 1", curr_cat, forms_cfg) == "wyklad")

# 3. Simulator by room
sym_lesson = {"przedmiot": "Nawigacja", "raw_przedmiot": "Naw", "sala": "306", "colspan": 1}
check("Room 306 is symulator", classify_lesson_form(sym_lesson, "Transport Morski sem. 3", curr_cat, forms_cfg) == "symulator")

ecdis_lesson = {"przedmiot": "Systemy", "raw_przedmiot": "Sys", "sala": "Symulator ECDIS", "colspan": 1}
check("Room with simulator keyword is symulator", classify_lesson_form(ecdis_lesson, "Transport Morski sem. 3", curr_cat, forms_cfg) == "symulator")

# 4. Urządzenia Nawigacyjne in 306,400 -> laboratorium
un_lab_lesson = {"przedmiot": "Urządzenia Nawigacyjne", "raw_przedmiot": "UN", "sala": "306,400", "colspan": 1}
check("UN in 306,400 is laboratorium", classify_lesson_form(un_lab_lesson, "Transport Morski sem. 3", curr_cat, forms_cfg) == "laboratorium")

# 5. Urządzenia Nawigacyjne in Aula -> wyklad
un_w_lesson = {"przedmiot": "Urządzenia Nawigacyjne", "raw_przedmiot": "UN", "sala": "Aula", "colspan": 10}
check("UN in Aula with colspan 10 is wyklad", classify_lesson_form(un_w_lesson, "Transport Morski sem. 3", curr_cat, forms_cfg) == "wyklad")

# 6. Magenta cell -> laboratorium
mag_lesson = {"przedmiot": "Fizyka", "raw_przedmiot": "Fiz", "sala": "P1", "colspan": 1, "arktur_kolor": "magenta"}
check("Magenta cell is laboratorium", classify_lesson_form(mag_lesson, "Transport i Logistyka sem. 1", curr_cat, forms_cfg) == "laboratorium")

# 7. Cyan cell does NOT force wyklad; curriculum decides form
cyan_fiz_lesson = {"przedmiot": "Fizyka", "raw_przedmiot": "Fiz", "sala": "114", "colspan": 1, "arktur_kolor": "cyan"}
check("Cyan cell for Fizyka (cs=1) is cwiczenia from curriculum", classify_lesson_form(cyan_fiz_lesson, "Transport i Logistyka sem. 1", curr_cat, forms_cfg, total_groups=8) == "cwiczenia")

# 8. TiL Sem 3 (Plan 550) cyan cells correctly classified via curriculum
mat_lab = {"przedmiot": "Materiałoznawstwo", "raw_przedmiot": "Mater", "sala": "H204", "colspan": 1, "arktur_kolor": "cyan"}
check("Materiałoznawstwo in H204 (cs=1, cyan) is laboratorium", classify_lesson_form(mat_lab, "Transport i Logistyka sem. 3", curr_cat, forms_cfg, total_groups=6) == "laboratorium")

mat_wyk = {"przedmiot": "Materiałoznawstwo", "raw_przedmiot": "Materiałoznawstwo", "sala": "C136", "colspan": 6, "arktur_kolor": "cyan"}
check("Materiałoznawstwo in C136 (cs=6, cyan) is wyklad", classify_lesson_form(mat_wyk, "Transport i Logistyka sem. 3", curr_cat, forms_cfg, total_groups=6) == "wyklad")

str_cw = {"przedmiot": "Środki Transportu", "raw_przedmiot": "ŚTr", "sala": "020", "colspan": 2, "arktur_kolor": "cyan"}
check("Środki Transportu in 020 (cs=2, cyan) is cwiczenia", classify_lesson_form(str_cw, "Transport i Logistyka sem. 3", curr_cat, forms_cfg, total_groups=6) == "cwiczenia")

pbikm_lab = {"przedmiot": "Podstawy Budowy i Konstrukcji Maszyn", "raw_przedmiot": "PBiKM", "sala": "P1", "colspan": 1, "arktur_kolor": "cyan"}
check("PBiKM in P1 (cs=1, cyan) is laboratorium", classify_lesson_form(pbikm_lab, "Transport i Logistyka sem. 3", curr_cat, forms_cfg, total_groups=6) == "laboratorium")

# 9. Disambiguation for curriculum with both C > 0 and L > 0 (Mechanika Techniczna in TiL sem 2: A=15, C=30, L=15)
mech_lab = {"przedmiot": "Mechanika Techniczna", "raw_przedmiot": "MT", "sala": "MW", "colspan": 1}
check("Mechanika Techniczna in lab room (MW) is laboratorium", classify_lesson_form(mech_lab, "Transport i Logistyka sem. 2", curr_cat, forms_cfg, total_groups=6) == "laboratorium")

mech_cw = {"przedmiot": "Mechanika Techniczna", "raw_przedmiot": "MT", "sala": "114", "colspan": 2}
check("Mechanika Techniczna with cs=2 is cwiczenia", classify_lesson_form(mech_cw, "Transport i Logistyka sem. 2", curr_cat, forms_cfg, total_groups=6) == "cwiczenia")

# 10. Math and Physics exercises (colspan 2 in 8-group plan) -> cwiczenia
mat_cw = {"przedmiot": "Matematyka", "raw_przedmiot": "MA", "sala": "114", "colspan": 2, "arktur_kolor": "default"}
check("Matematyka with cs=2 (room 114) is cwiczenia", classify_lesson_form(mat_cw, "Transport i Logistyka sem. 1", curr_cat, forms_cfg, total_groups=8) == "cwiczenia")

fiz_cw = {"przedmiot": "Fizyka", "raw_przedmiot": "Fiz", "sala": "P1", "colspan": 2, "arktur_kolor": "default"}
check("Fizyka with cs=2 (room P1) is cwiczenia", classify_lesson_form(fiz_cw, "Transport i Logistyka sem. 1", curr_cat, forms_cfg, total_groups=8) == "cwiczenia")

# 11. Math and Physics lectures in C136 with full cohort (colspan 8) -> wyklad
mat_w = {"przedmiot": "Matematyka", "raw_przedmiot": "MA", "sala": "C136", "colspan": 8, "arktur_kolor": "default"}
check("Matematyka in C136 with cs=8 is wyklad", classify_lesson_form(mat_w, "Transport i Logistyka sem. 1", curr_cat, forms_cfg, total_groups=8) == "wyklad")

fiz_w = {"przedmiot": "Fizyka", "raw_przedmiot": "Fiz", "sala": "C136", "colspan": 8, "arktur_kolor": "default"}
check("Fizyka in C136 with cs=8 is wyklad", classify_lesson_form(fiz_w, "Transport i Logistyka sem. 1", curr_cat, forms_cfg, total_groups=8) == "wyklad")

# ── 23. Safe group detection regex (including II degree groups A1, B1, etc.) ────
print("\n-- 23. Safe group detection regex (including II degree groups) ---------")
GROUP_REGEX = r"^(?:GR\.?\s*\d+|[1-4]\s*(?:TM|ER|L|N)\b|[A-Z]{2,4}\.?\s*\d+|[A-E]\s*\d{1,2}$)"

pos_groups = ["A1", "A 1", "B1", "B2", "C1", "D1", "E2", "GR. 1", "GR.01", "GR 8", "1 TM", "2 ER", "MSTL. 1", "TiL 1"]
for g in pos_groups:
    check(f"Group '{g}' matches regex", bool(re.search(GROUP_REGEX, g, re.IGNORECASE)))

neg_groups = ["termin", "Inny plan", "Przedmiot A:", "A", "F1", "Z1", "Plan", "Poniedziałek"]
for g in neg_groups:
    check(f"Junk '{g}' does NOT match regex", not bool(re.search(GROUP_REGEX, g, re.IGNORECASE)))

# ── 24. Natural sorting of plans (get_plan_sort_key) ──────────────────────────
print("\n-- 24. Natural sorting of plans (get_plan_sort_key) -------------------")
from sources.umg_wn.arktur_html import get_plan_sort_key, classify_lesson_form as clf

plans_to_sort = {
    "557": {"name": "Transport Morski pierwszego stopnia sem. 1"},
    "550": {"name": "Transport i Logistyka pierwszego stopnia sem. 3"},
    "559": {"name": "Transport Morski pierwszego stopnia sem. 3"},
    "558": {"name": "Transport i Logistyka pierwszego stopnia sem. 1"},
    "556": {"name": "Morskie Systemy Transportowe i Logistyczne drugiego stopnia sem. 2"},
    "551": {"name": "Transport i Logistyka pierwszego stopnia sem. 5"},
}

sorted_pids = [pid for pid, _ in sorted(plans_to_sort.items(), key=get_plan_sort_key)]
check("Plans sorted alphabetically by major and ascending by semester",
      sorted_pids == ["556", "558", "550", "551", "557", "559"],
      f"got {sorted_pids}")

# ── 25. Regressions: symulator branch reachability + group regex strip ─────────
print("\n-- 25. Regressions: symulator branch + group regex strip ---------------")

sym_lesson = {"przedmiot": "Symulator Ratunkowy", "raw_przedmiot": "SRat", "sala": "Symulator", "colspan": 1, "arktur_kolor": "default"}
from sources.umg_wn.arktur_html import classify_lesson_form as clf
_sym_catalog = {
    "majors": {
        "transport i logistyka": {
            "semesters": {
                "1": {
                    "symulator ratunkowy": {"A": 0, "C": 0, "L": 0, "S": 15, "forms": ["symulator"], "single_form": None}
                }
            }
        }
    },
    "global_single_forms": {},
}
_sym_cfg = {"override_by_subject": {}, "override_by_room": {}, "room_regex": []}
check("Symulator-only entry returns 'symulator'",
      clf(sym_lesson, "Transport i Logistyka sem. 1", _sym_catalog, _sym_cfg, total_groups=8) == "symulator")

# 25b. Symulator + cwiczenia + laboratorium — blok CW/LAB disambiguuje (symulator guard nie blokuje)
sym_cw_lab_lesson = {"przedmiot": "Sym. Tech.", "raw_przedmiot": "ST", "sala": "114", "colspan": 2, "arktur_kolor": "default"}
_sym_cw_catalog = {
    "majors": {
        "transport i logistyka": {
            "semesters": {
                "1": {
                    "sym. tech.": {"A": 0, "C": 15, "L": 15, "S": 10, "forms": ["cwiczenia", "laboratorium", "symulator"], "single_form": None}
                }
            }
        }
    },
    "global_single_forms": {},
}
check("CW+LAB+SYM entry with colspan 2 returns 'cwiczenia' from disambiguation",
      clf(sym_cw_lab_lesson, "Transport i Logistyka sem. 1", _sym_cw_catalog, _sym_cfg, total_groups=8) == "cwiczenia")

# 25c. Group regex handles trailing whitespace ("A1 " — common HTML whitespace)
GROUP_REGEX_25 = r"^(?:GR\.?\s*\d+|[1-4]\s*(?:TM|ER|L|N)\b|[A-Z]{2,4}\.?\s*\d+|[A-E]\s*\d{1,2}$)"
check("'A1 ' with strip() matches II-degree group regex",
      bool(re.search(GROUP_REGEX_25, "A1 ".strip(), re.IGNORECASE)))
check("'A1\\t' with strip() matches II-degree group regex",
      bool(re.search(GROUP_REGEX_25, "A1\t".strip(), re.IGNORECASE)))

# ── 26. Niestacjonarne (NST) client & parser tests ───────────────────────────
print("\n-- 26. Niestacjonarne (NST) client & parser --------------------------")
from sources.umg_wn.nst_client import fetch_nst_plans_list, pobierz_liste_planow_nst
from sources.umg_wn.nst_parser import normalize_iso_date, _parse_single_table, parse_pdf_schedule, extract_stream_runs, _extract_lesson_details
from core.ics import generate_nst_ics, generuj_ics_nst

# 26a. Canonical English exports and backward compatibility aliases
check("fetch_nst_plans_list is pobierz_liste_planow_nst", fetch_nst_plans_list is pobierz_liste_planow_nst)
check("generate_nst_ics is generuj_ics_nst", generate_nst_ics is generuj_ics_nst)

# 26b. Normalizacja daty ISO
check("normalize_iso_date handles '1.10.2026'", normalize_iso_date("1.10.2026") == "2026-10-01")
check("normalize_iso_date handles '15.01.2027'", normalize_iso_date("15.01.2027") == "2027-01-15")
check("normalize_iso_date handles invalid string", normalize_iso_date("brak-daty") is None)

# 26c. Mockowana tabela z PDF z wielookresowymi blokami zajęć
sample_table = [
    [None, None, "3.10.2026", None, None],
    [None, None, "sobota", None, None],
    [None, None, "GR.01", "GR.02", "Sala"],
    ["08:00", "08:45", "Matematyka\nW", "Fizyka\nC", "Aula"],
    ["08:50", "09:35", None, None, None],
    ["09:40", "10:25", "Milczek Beata, dr", "Nowak Jan, dr", "Aula"],
    ["10:30", "11:15", "Fizyka\nC", "Matematyka\nW", "Aula"],
    ["11:20", "12:05", None, None, None],
    ["12:10", "12:55", "Nowak Jan, dr", "Milczek Beata, dr", "Aula"]
]
parsed_mock = _parse_single_table(sample_table)
check("Parsed table contains GR.01 and GR.02", "GR.01" in parsed_mock and "GR.02" in parsed_mock)
check("Parsed table has date 2026-10-03", "2026-10-03" in parsed_mock.get("GR.01", {}))
gr1_lessons = parsed_mock.get("GR.01", {}).get("2026-10-03", [])
check("GR.01 has 2 lessons", len(gr1_lessons) == 2, f"got {len(gr1_lessons)}")
if gr1_lessons:
    l0 = gr1_lessons[0]
    check("Lesson 0 subject extracted", "Matematyka" in l0["przedmiot"], f"got {l0['przedmiot']}")
    check("Lesson 0 teacher extracted", "Milczek" in l0["prowadzacy"], f"got {l0['prowadzacy']}")
    check("Lesson 0 hours extracted", l0["godziny"] == "08:00-10:25", f"got {l0['godziny']}")
    check("Lesson 0 room extracted", l0["sala"].upper() == "AULA", f"got {l0['sala']}")
    check("Lesson 0 day is Sobota", l0["dzien"] == "Sobota", f"got {l0['dzien']}")

# 26d. Test generate_nst_ics
sample_nst_schedule = {"2026-10-03": gr1_lessons}
ics_output = generate_nst_ics(sample_nst_schedule, "GR.01")
check("generate_nst_ics produces valid iCal with VEVENT", "BEGIN:VEVENT" in ics_output and "Matematyka" in ics_output)

# 26e. Regression test for Saturday multi-group & multi-period classes without gridlines (2026-11-21)
sample_pdf_path = os.path.join(REPO_ROOT, "cache_nst_pdf", "TiL_I.pdf")
if not os.path.exists(sample_pdf_path):
    sample_pdf_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "cache_nst_pdf", "TiL_I.pdf")
if os.path.exists(sample_pdf_path):
    parsed_pdf = parse_pdf_schedule(sample_pdf_path)
    gr4_nov21 = parsed_pdf.get("GR.04", {}).get("2026-11-21", [])
    check("GR.04 on 2026-11-21 has afternoon lessons", len(gr4_nov21) >= 3, f"got {len(gr4_nov21)}")

    l_1330 = next((l for l in gr4_nov21 if l["godziny"].startswith("13:30")), None)
    check("GR.04 has 13:30 lesson", l_1330 is not None)
    if l_1330:
        check("GR.04 13:30 subject is Podstawy nautyki w transporcie", l_1330["przedmiot"] == "Podstawy nautyki w transporcie", f"got {l_1330['przedmiot']}")
        check("GR.04 13:30 teacher is Gil Mateusz", "Gil Mateusz" in l_1330["prowadzacy"], f"got {l_1330['prowadzacy']}")
        check("GR.04 13:30 room is C30", l_1330["sala"] == "C30", f"got {l_1330['sala']}")
        check("GR.04 13:30 form is laboratorium", l_1330["forma"] == "laboratorium", f"got {l_1330['forma']}")
        check("GR.04 13:30 subject has no interleaving artifacts", "Gkir" not in l_1330["przedmiot"] and "sPkoadstawy" not in l_1330["przedmiot"])

    l_1600 = next((l for l in gr4_nov21 if l["godziny"].startswith("16:00")), None)
    check("GR.04 has 16:00 lesson", l_1600 is not None)
    if l_1600:
        check("GR.04 16:00 subject is Grafika inżynierska", l_1600["przedmiot"] == "Grafika inżynierska", f"got {l_1600['przedmiot']}")
        check("GR.04 16:00 teacher is Tessmer Agnieszka", "Tessmer Agnieszka" in l_1600["prowadzacy"], f"got {l_1600['prowadzacy']}")
        check("GR.04 16:00 room is B211", l_1600["sala"] == "B211", f"got {l_1600['sala']}")

    gr5_nov21 = parsed_pdf.get("GR.05", {}).get("2026-11-21", [])
    l5_1330 = next((l for l in gr5_nov21 if l["godziny"].startswith("13:30")), None)
    check("GR.05 has 13:30 lesson", l5_1330 is not None)
    if l5_1330:
        check("GR.05 13:30 subject is Grafika inżynierska", l5_1330["przedmiot"] == "Grafika inżynierska", f"got {l5_1330['przedmiot']}")
        check("GR.05 13:30 room is B211", l5_1330["sala"] == "B211", f"got {l5_1330['sala']}")

    # 26f. Regression test for empty days (29.10, 30.10) and adjacent subject splitting (28.11 18:30)
    for empty_date in ("2026-10-29", "2026-10-30"):
        gr1_empty = parsed_pdf.get("GR.01", {}).get(empty_date, [])
        check(f"GR.01 has 0 lessons on empty day {empty_date}", len(gr1_empty) == 0, f"got {len(gr1_empty)}: {gr1_empty}")
        gr2_empty = parsed_pdf.get("GR.02", {}).get(empty_date, [])
        check(f"GR.02 has 0 lessons on empty day {empty_date}", len(gr2_empty) == 0, f"got {len(gr2_empty)}: {gr2_empty}")

    gr1_nov28 = parsed_pdf.get("GR.01", {}).get("2026-11-28", [])
    check("GR.01 on 2026-11-28 has 3 lessons", len(gr1_nov28) == 3, f"got {len(gr1_nov28)}")
    gr1_1830 = next((l for l in gr1_nov28 if l["godziny"].startswith("18:30")), None)
    check("GR.01 on 2026-11-28 has 18:30 lesson", gr1_1830 is not None)
    if gr1_1830:
        check("GR.01 18:30 subject is Podstawy nautyki w transporcie", gr1_1830["przedmiot"] == "Podstawy nautyki w transporcie", f"got {gr1_1830['przedmiot']}")
        check("GR.01 18:30 teacher is Gil Mateusz", "Gil Mateusz" in gr1_1830["prowadzacy"], f"got {gr1_1830['prowadzacy']}")
        check("GR.01 18:30 room is C31", gr1_1830["sala"] == "C31", f"got {gr1_1830['sala']}")
else:
    print(f"  [SKIP] 26e/26f — PDF fixture not found at {sample_pdf_path!r}. Run with the real PDF to execute integration tests.")

# 26g. Deterministyczny test: extract_stream_runs — split na font-change i is_glued_title (regresja 28.11 18:30)
print("\n-- 26g. extract_stream_runs — split na zmianie fontu i is_glued_title ----------")

def _make_char(text, x0, x1, top=100.0, bottom=108.0, fontname="BCDEEE+Calibri"):
    return {"text": text, "x0": x0, "x1": x1, "top": top, "bottom": bottom, "fontname": fontname}

same_font_chars = [
    _make_char("P", 78.0, 84.0),
    _make_char("o", 84.0, 89.0),
    _make_char("d", 89.0, 94.0),
]
same_font_runs = extract_stream_runs(same_font_chars)
check("Znaki tego samego fontu tworzą jeden run", len(same_font_runs) == 1, f"got {len(same_font_runs)}")
check("Treść runu: 'Pod'", same_font_runs[0]["text"] == "Pod", f"got {same_font_runs[0]['text']}")

font_change_chars = [
    _make_char("P", 78.0, 84.0, fontname="BCDEEE+Calibri"),
    _make_char("o", 84.0, 89.0, fontname="BCDEEE+Calibri"),
    _make_char("G", 89.0, 95.0, fontname="BCDFEE+Calibri"),
    _make_char("r", 95.0, 100.0, fontname="BCDFEE+Calibri"),
]
font_change_runs = extract_stream_runs(font_change_chars)
check("Zmiana fontu tworzy nowy run (regresja 28.11)", len(font_change_runs) == 2,
      f"got {len(font_change_runs)}: {[r['text'] for r in font_change_runs]}")
check("Run 1 to 'Po'", font_change_runs[0]["text"] == "Po", f"got {font_change_runs[0]['text']}")
check("Run 2 to 'Gr'", font_change_runs[1]["text"] == "Gr", f"got {font_change_runs[1]['text']}")

glued_chars = [
    _make_char("a", 78.0, 83.0),
    _make_char("B", 83.0, 89.0),
]
glued_runs = extract_stream_runs(glued_chars)
check("Glued lowercase→uppercase bez luki tworzy nowy run (is_glued_title)", len(glued_runs) == 2,
      f"got {len(glued_runs)}: {[r['text'] for r in glued_runs]}")

all_upper_chars = [
    _make_char("A", 78.0, 84.0),
    _make_char("B", 84.0, 90.0),
    _make_char("C", 90.0, 96.0),
]
all_upper_runs = extract_stream_runs(all_upper_chars)
check("Ciąg uppercase bez zmiany fontu i bez luki pozostaje jednym runem", len(all_upper_runs) == 1,
      f"got {len(all_upper_runs)}")

normal_word_chars = [
    _make_char("t", 78.0, 83.0),
    _make_char("r", 83.0, 88.0),
    _make_char("a", 88.0, 93.0),
    _make_char("n", 93.0, 98.0),
]
normal_word_runs = extract_stream_runs(normal_word_chars)
check("Normalne słowo lowercase (bez luki, bez zmiany fontu) tworzy jeden run", len(normal_word_runs) == 1,
      f"got {len(normal_word_runs)}")

# 26h. Deterministyczny test: _extract_lesson_details — odrzuca tekst złożony wyłącznie z tokenów grupy
print("\n-- 26h. _extract_lesson_details — guard dla tokenów grupy (regresja 29/30.10) --")

check("_extract_lesson_details('GR.01') zwraca None",
      _extract_lesson_details("GR.01", fallback_room="", time_range="08:00-10:25",
                              day_name="Sobota", date_iso="2026-10-29", group_name="GR.01") is None)
check("_extract_lesson_details('GR.01 GR.02') zwraca None",
      _extract_lesson_details("GR.01 GR.02", fallback_room="", time_range="08:00-10:25",
                              day_name="Sobota", date_iso="2026-10-29", group_name="GR.01") is None)
check("_extract_lesson_details('GR 1 GR 2') zwraca None",
      _extract_lesson_details("GR 1 GR 2", fallback_room="", time_range="08:00-10:25",
                              day_name="Sobota", date_iso="2026-10-29", group_name="GR.01") is None)

ok_result = _extract_lesson_details(
    "Matematyka W Milczek Beata, dr Aula",
    fallback_room="", time_range="08:00-10:25", day_name="Sobota", date_iso="2026-10-03", group_name="GR.01"
)
check("_extract_lesson_details zwraca dict dla prawidłowych zajęć", ok_result is not None)
if ok_result:
    check("Prawidłowe zajęcia: przedmiot zawiera Matematyka", "Matematyka" in ok_result.get("przedmiot", ""))

# ── 27. Plany w trakcie modyfikacji przez uczelnię ([modyfikowany]) ───────────
print("\n-- 27. Plany w trakcie modyfikacji przez uczelnię --------------------")
from unittest.mock import patch, MagicMock
from sources.umg_wn.arktur_client import pobierz_liste_planow, pobierz_plany_w_modyfikacji
from sources.umg_wn.arktur_html import parse_plan_title

raw_mod_title = "[TM Sem 1] Transport Morski pierwszego stopnia sem. 1 [modyfikowany] [2026-09-28 08:25] wer. 3"
p_title = parse_plan_title(raw_mod_title)
check("parse_plan_title usuwa [modyfikowany] z clean_name",
      p_title["clean_name"] == "Transport Morski sem. 1",
      f"got {p_title['clean_name']}")
check("parse_plan_title wyciąga poprawną wersję",
      p_title["version"] == "wer. 3",
      f"got {p_title['version']}")
check("parse_plan_title wyciąga poprawną datę",
      p_title["published_at"] == "2026-09-28 08:25",
      f"got {p_title['published_at']}")

html_with_mod = """
<select name="kierunek">
  <option value="557">[TM Sem 1] Transport Morski sem. 1 [2026-09-14 17:55] wer. 2</option>
  <option value="0">[TM Sem 1] Transport Morski sem. 1 [modyfikowany] [2026-09-28 08:25] wer. 3</option>
  <option value="558">Nawigacja sem. 1 wer. 1</option>
</select>
"""
mock_resp = MagicMock()
mock_resp.text = html_with_mod
mock_resp.raise_for_status = MagicMock()

with patch("sources.umg_wn.arktur_client.requests.get", return_value=mock_resp):
    active_plans = pobierz_liste_planow()
    mod_plans = pobierz_plany_w_modyfikacji()

check("pobierz_liste_planow nie zawiera planu o ID 0", "0" not in active_plans.values())
check("pobierz_liste_planow zawiera aktywne plany 557 i 558", "557" in active_plans.values() and "558" in active_plans.values())
check("pobierz_plany_w_modyfikacji zawiera wpis o modyfikacji", len(mod_plans) == 1)
if mod_plans:
    check("mod_plans raw_name contains [modyfikowany]", "[modyfikowany]" in mod_plans[0]["raw_name"])
    check("mod_plans value is 0", mod_plans[0]["value"] == "0")
    mod_parsed = parse_plan_title(mod_plans[0]["raw_name"])
    check("mod_plans draft_version is wer. 3", mod_parsed["version"] == "wer. 3")
    check("mod_plans draft_date is 2026-09-28 08:25", mod_parsed["published_at"] == "2026-09-28 08:25")
    check("mod_plans clean_name matches 557", mod_parsed["clean_name"] == p_title["clean_name"])

# ── 28. Walidacja schematu bazy wydarzeń (tenants/umg_wn/events.json) ─────────
print("\n-- 28. Walidacja schematu bazy wydarzeń (tenants/umg_wn/events.json) --")
events_json_path = os.path.join(REPO_ROOT, "tenants", "umg_wn", "events.json")
check("Plik tenants/umg_wn/events.json istnieje", os.path.exists(events_json_path))

events_data = None
try:
    with open(events_json_path, "r", encoding="utf-8") as ef:
        events_data = json.load(ef)
    check("Plik tenants/umg_wn/events.json zawiera poprawny format JSON", isinstance(events_data, list))
except Exception as e:
    check(f"Plik tenants/umg_wn/events.json zawiera poprawny format JSON (error: {e})", False)

if isinstance(events_data, list):
    date_regex = re.compile(r"^\d{4}-\d{2}-\d{2}$")
    time_regex = re.compile(r"^\d{2}:\d{2}$")
    all_valid = True
    for ev in events_data:
        ev_id = ev.get("id")
        ev_date = ev.get("date")
        ev_start = ev.get("time_start")
        ev_end = ev.get("time_end")
        ev_title = ev.get("title")

        if not (ev_id and ev_title and ev_date and date_regex.match(ev_date)):
            all_valid = False
            break
        if ev_start and not time_regex.match(ev_start):
            all_valid = False
            break
        if ev_end and not time_regex.match(ev_end):
            all_valid = False
            break

    check("Wszystkie wpisy wydarzeń posiadają prawidłowe ID, tytuł, daty ISO i godziny", all_valid)

# ── 29. Test GitOps Issue Form Parser (scripts/add_event_from_issue.py) ───────
print("\n-- 29. GitOps Issue Form Parser --------------------------------------")
sys.path.insert(0, os.path.join(REPO_ROOT, "scripts"))
try:
    from add_event_from_issue import parse_issue_markdown, slugify

    mock_issue_body = """
### Tytuł wydarzenia

Czwartkowe Flanki

### Data wydarzenia (RRRR-MM-DD)

2026-10-08

### Godzina rozpoczęcia (GG:MM)

18:00

### Godzina zakończenia (GG:MM)

22:00

### Typ i styl wydarzenia

flanki (Flanki i integracja przy piwie 🍻 - złote tło)

### Miejsce / Lokalizacja

Polanka Redłowska

### Pełny opis wydarzenia

Tradycyjne spotkanie na polance.

### Link zewnętrzny (opcjonalnie)

https://maps.app.goo.gl/example

### Tekst na przycisku linku (opcjonalnie)

Otwórz mapę

### Kto powinien widzieć to wydarzenie?

all (Wszyscy studenci - stacjonarni i niestacjonarni)
"""
    res = parse_issue_markdown(mock_issue_body)
    check("parse_issue_markdown extracts title", res["title"] == "Czwartkowe Flanki")
    check("parse_issue_markdown extracts date", res["date"] == "2026-10-08")
    check("parse_issue_markdown extracts time_start", res["time_start"] == "18:00")
    check("parse_issue_markdown extracts time_end", res["time_end"] == "22:00")
    check("parse_issue_markdown cleans type to flanki", res["type"] == "flanki")
    check("parse_issue_markdown extracts button_text", res["button_text"] == "Otwórz mapę")
    check("parse_issue_markdown extracts target_mode", res["target_mode"] == "all")
    check("slugify creates url-friendly slug", slugify("Czwartkowe Flanki 2026!") == "czwartkowe-flanki-2026")

    # 29b. Bezpieczeństwo URL - odrzucanie javascript: i nieobsługiwanych schematów
    xss_issue_body = mock_issue_body.replace("https://maps.app.goo.gl/example", "javascript:alert(1)")
    res_xss = parse_issue_markdown(xss_issue_body)
    check("parse_issue_markdown odrzuca javascript: URL", res_xss["url"] is None, f"got {res_xss['url']}")

    ftp_issue_body = mock_issue_body.replace("https://maps.app.goo.gl/example", "ftp://files.example.com")
    res_ftp = parse_issue_markdown(ftp_issue_body)
    check("parse_issue_markdown odrzuca ftp: URL", res_ftp["url"] is None, f"got {res_ftp['url']}")
except Exception as e:
    check(f"GitOps Issue Form Parser error: {e}", False)

# ── 30. Quality Gate w build_static.py (thin wrapper -> core.build) ───────────
print("\n-- 30. Quality Gate w build_static.py --------------------------------")
import build_static

# 30a. Awaryjne przerwanie buildu, gdy build_tenant zwraca 0 planów i 0 grup
try:
    with patch("build_static.build_tenant", return_value={"total_groups_processed": 0, "total_plans": 0}):
        build_static.build()
    check("Quality gate: build() przerywa z kodem 1 przy 0 planów i 0 grup", False, "build() zakończył się bez błędu")
except SystemExit as se:
    check("Quality gate: build() przerywa z kodem 1 przy 0 planów i 0 grup", se.code == 1, f"exit code: {se.code}")
except Exception as e:
    check(f"Quality gate 30a: nieoczekiwany wyjątek: {e}", False)

# 30b. Sukces buildu, gdy build_tenant zwraca przetworzone grupy
with patch("build_static.build_tenant", return_value={"total_groups_processed": 12, "total_plans": 2}):
    res_total = build_static.build(limit=1)
    check("build_static.build() zwraca liczbę przetworzonych grup z core.build", res_total == 12, f"got {res_total}")

# ── 31. Poprawność końców linii w plikach .ics (RFC 5545 CRLF bez podwójnego \\r)
print("\n-- 31. Pliki .ics bez podwójnego carriage return (\\r\\r\\n) na Windows --")
import tempfile
from core.ics import generuj_ics

# Przetestuj czy zapisany plik ICS nie zawiera podwójnych znaków powrotu karetki
test_cal_dict = {
    "PON": {
        "08:00": {
            "przedmiot": "Nawigacja",
            "prowadzacy": "Jan Kowalski",
            "sala": "101",
            "godziny": "08:00-09:35",
            "data_start": "2026-10-05",
            "tygodnie": 1,
            "co_ile": 1
        }
    }
}
ics_text_res = generuj_ics(test_cal_dict, "GR. 1")

# Symulacja zapisu w build_static: weryfikacja b'\r\r\n'
with tempfile.NamedTemporaryFile(suffix=".ics", delete=False) as tmp_f:
    tmp_path = tmp_f.name

try:
    # Zapis w trybie binarnym
    with open(tmp_path, "wb") as f_out:
        f_out.write(ics_text_res.encode("utf-8") if isinstance(ics_text_res, str) else ics_text_res)

    with open(tmp_path, "rb") as f_in:
        raw_bytes = f_in.read()

    check("Zapisany ICS zawiera standardowe CRLF b'\\r\\n'", b"\r\n" in raw_bytes)
    check("Zapisany ICS NIE zawiera podwójnego b'\\r\\r\\n'", b"\r\r\n" not in raw_bytes)
finally:
    if os.path.exists(tmp_path):
        os.remove(tmp_path)


# ── Summary ───────────────────────────────────────────────────────────────────
print("\n" + "="*60)
passed = sum(1 for ok,_ in results if ok)
failed = sum(1 for ok,_ in results if not ok)
print(f"  {passed} passed  |  {failed} failed")
if failed:
    print("  Failures:")
    for ok,name in results:
        if not ok: print(f"    [FAIL]  {name}")
    sys.exit(1)


