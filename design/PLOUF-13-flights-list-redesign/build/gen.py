#!/usr/bin/env python3
"""Generate the pen interactive command file that (re)builds designs.pen for PLOUF-16."""
import datetime as dt, json, sys

SUBTITLE = "Newest first. Flights of 2h30 or more are marked."
BUDGET = {"m": 31, "d": 35}          # line-1 characters before the route truncates
META_BUDGET = {"m": (44, 28), "d": (50, 35)}   # line-2 chars (plain, standout with tag)


def ell(s, n):
    return s if len(s) <= n else s[: n - 1].rstrip() + "…"


def F(t, l, pilot, wing, iso, air, km, c, s=False, **kw):
    return dict(t=t, l=l, pilot=pilot, wing=wing, iso=iso, a=air, k=km, c=c, s=s, **kw)


def row(f, bp, full_date=False, mark=True, **extra):
    d = dt.date.fromisoformat(f["iso"])
    day = f"{d.day} {d.strftime('%b')} {d.year}" if full_date else f"{d.strftime('%a')} {d.day}"
    standout = f["s"] and mark
    t, l = f["t"], f["l"]
    budget = BUDGET.get(bp, 999) - (2 if standout else 0)
    if len(t) + 3 + len(l) > budget:
        room = budget - 3 - len(t)
        if room >= 3:
            l = ell(l, room)
        else:
            t, l = ell(t, budget - 3 - 6), ell(l, 6)
    meta = f"{f['pilot']} · {f['wing']} · {day}"
    if bp in META_BUDGET:
        meta = ell(meta, META_BUDGET[bp][1 if standout else 0])
    r = dict(t=t, l=l, m=meta, a=f["a"], k=f["k"], c=f["c"], s=standout)
    r.update(extra)
    return r


# ---- data: the dev seed's seasons, as the brief describes them -------------------------
O1 = F("Col de la Forclaz", "Doussard", "Ewan", "Niviuk Artik 6", "2026-10-17", "1h 12m", "31.4 km", "indigo")
O2 = F("Planfait", "Talloires Plage", "Marta", "Supair Leaf 3", "2026-10-11", "48min", "18.2 km", "blue")
O3 = F("Dent de Crolles Sud", "Lumbin", "Théo", "Ozone Rush 6", "2026-10-10", "2h 34m", "71.9 km", "red", True)
O4 = F("Saint-Hilaire du Touvet", "Lumbin", "Jonas", "Ozone Delta 4", "2026-10-04", "41min", "12.6 km", "red")
OCT = [O1, O2, O3, O4]
S1 = F("Le Brévent", "Bois du Bouchet", "Camille", "Niviuk Artik 6", "2026-09-27", "1h 22m", "39.0 km", "orange")
S2 = F("Aiguillette des Houches", "Le Savoy", "Camille", "Advance Alpha 7", "2026-09-19", "3h 05m", "88.4 km", "violet", True)
S3 = F("Plan de l'Aiguille", "Le Savoy", "Camille", "Niviuk Artik 6", "2026-09-18", "1h 07m", "38.4 km", "orange")
S4 = F("Col de la Forclaz", "Doussard", "Ewan", "Ozone Rush 6", "2026-09-13", "1h 40m", "52.3 km", "indigo")
S5 = F("Dent de Crolles Sud", "Lumbin", "Théo", "Ozone Rush 6", "2026-09-06", "2h 41m", "77.7 km", "red", True)
S6 = F("Montmin Sud", "Doussard", "Anaïs", "Advance Alpha 7", "2026-09-05", "55min", "21.0 km", "violet")
S7 = F("La Tournette Ouest", "Talloires Plage", "Théo", "Gin Bonanza 3", "2026-09-01", "47min", "19.8 km", "green")
SEP = [S1, S2, S3, S4, S5, S6, S7]
A1 = F("Bruneck Kronplatz", "Campitello", "Marta", "Supair Leaf 3", "2026-08-12", "3h 12m", "92.4 km", "blue", True)
A2 = F("Col de la Forclaz", "Doussard", "Ewan", "Niviuk Artik 6", "2026-08-02", "2h 30m", "64.1 km", "indigo", True)
J1 = F("Dent de Crolles Sud", "Lumbin", "Théo", "Ozone Rush 6", "2026-07-31", "2h 38m", "77.7 km", "red", True)
JN1 = F("Bruneck Kronplatz", "Campitello", "Marta", "Supair Leaf 3", "2026-06-14", "2h 52m", "80.6 km", "blue", True)

# search "forclaz": 9 of 165
FZ = [
    ("October 2026", "1 of 4 flights · 1 h", [O1]),
    ("September 2026", "1 of 7 flights · 2 h", [S4]),
    ("August 2026", "3 of 31 flights · 5 h", [
        F("Col de la Forclaz", "Doussard", "Anaïs", "Advance Alpha 7", "2026-08-22", "1h 05m", "27.5 km", "violet"),
        F("Col de la Forclaz", "Montmin Sud", "Ewan", "Niviuk Artik 6", "2026-08-09", "1h 18m", "34.0 km", "indigo"),
        A2]),
    ("July 2026", "2 of 26 flights · 3 h", [
        F("Col de la Forclaz", "Doussard", "Ewan", "Niviuk Artik 6", "2026-07-24", "1h 45m", "58.6 km", "indigo"),
        F("Col de la Forclaz", "Talloires Plage", "Marta", "Supair Leaf 3", "2026-07-11", "1h 02m", "26.3 km", "blue")]),
    ("June 2026", "1 of 11 flights · 58 min", [
        F("Col de la Forclaz", "Doussard", "Jonas", "Ozone Delta 4", "2026-06-20", "58min", "22.9 km", "red")]),
    ("May 2026", "1 of 9 flights · 1 h", [
        F("Col de la Forclaz", "Doussard", "Théo", "Gin Bonanza 3", "2026-05-16", "1h 10m", "30.2 km", "green")]),
]

CAMILLE = [S1, S2, S3,
           F("Aiguillette des Houches", "Le Savoy", "Camille", "Advance Alpha 7", "2026-07-29", "53min", "33.5 km", "violet"),
           F("Croix de Coeur", "Le Châble", "Camille", "Advance Alpha 7", "2026-05-25", "1h 30m", "44.2 km", "violet"),
           F("Savoleyres", "Verbier Village", "Camille", "Niviuk Artik 6", "2026-04-26", "1h 34m", "51.2 km", "orange"),
           F("Croix de Coeur", "Le Châble", "Camille", "Niviuk Artik 6", "2026-03-31", "1h 11m", "41.4 km", "orange")]
THEO_RECENT = [O3, S5, S7, J1,
               F("Le Cul de Chien", "Lumbin", "Théo", "Ozone Rush 6", "2026-07-14", "1h 15m", "43.9 km", "red")]


def show_all(n, month):
    return f"Show all {n} flights in {month}" if n != 1 else f"Show 1 flight in {month}"


def default_groups(bp):
    return [
        dict(m="October 2026", s="4 flights · 5 h", rows=[row(f, bp) for f in OCT]),
        dict(m="September 2026", s="7 flights · 12 h", rows=[row(S2, bp), row(S5, bp)],
             foot=dict(txt=show_all(7, "September 2026"))),
        dict(m="August 2026", s="31 flights · 38 h", rows=[row(A1, bp), row(A2, bp)],
             foot=dict(txt=show_all(31, "August 2026"))),
        dict(m="July 2026", s="26 flights · 29 h", rows=[row(J1, bp)],
             foot=dict(txt=show_all(26, "July 2026"))),
        dict(m="June 2026", s="11 flights · 16 h", rows=[row(JN1, bp)],
             foot=dict(txt=show_all(11, "June 2026"))),
    ]


def expanded_groups(bp):
    return [
        dict(m="September 2026", s="7 flights · 12 h", rows=[row(f, bp) for f in SEP],
             foot=dict(txt="Show standouts only", icon="chevron-up")),
        dict(m="August 2026", s="31 flights · 38 h", rows=[row(A1, bp), row(A2, bp)],
             foot=dict(txt=show_all(31, "August 2026"))),
    ]


def search_groups(bp):
    return [dict(m=m, s=s, rows=[row(f, bp) for f in rows]) for m, s, rows in FZ]


# ---- frames ---------------------------------------------------------------------------
MX, DX = 0, 0
MY, DY, SY = 0, 1200, 2400      # mobile row, desktop row, specimen / other pages row
MSTEP, DSTEP = 800, 1900
HALF = dict(sy=462, sh=370)
FULL = dict(sy=89, sh=743)
PEEK = dict(sy=731, sh=101)

frames = []   # (spec, note)


def mobile(i, name, note, **sp):
    frames.append((dict(bp="m", name=name, x=MX + i * MSTEP, y=MY, **sp), note))


def desktop(i, name, note, **sp):
    frames.append((dict(bp="d", name=name, x=DX + i * DSTEP, y=DY, **sp), note))


mobile(0, "Flights / Default / Mobile / Light",
       "Default: sheet at half height (44%, 371 px).\n\n• Legend chip row dropped (Decision). Subtitle states the standout rule; the count lives only in the search field.\n• Visible at half: header, search, the October 2026 heading and its first rows (S-3 target met).\n• Newest month is shown in full; standouts carry the 2h30+ tag, a 6 px bar and airtime in primary.\n• Signup card unchanged (out of scope).",
       header=True, search=dict(), groups=default_groups("m"), **HALF)
mobile(1, "Flights / Default · full sheet / Mobile / Light",
       "Sheet dragged to full (88%, 743 px). Not scrolled.\n\n• October is in full. September and later show only their standouts, then 'Show all N flights in <Month>'.\n• Month headings scroll with the list (not sticky): groups are short once collapsed, and a sticky heading costs sheet height (Decision).\n• Tapping 'Show all…' expands the month in place, without moving the scroll position.",
       header=True, search=dict(), groups=default_groups("m"), **FULL)
mobile(2, "Flights / Default · peek / Mobile / Light",
       "Sheet at peek (12%, 101 px): the handle and the first line of content (the panel title).\n\n• Peek and expand behave as today (AC 13). Drag the handle or tap it to go to half.",
       header=True, search=dict(), groups=default_groups("m"), **PEEK)
mobile(3, "Flights / Month expanded / Mobile / Light",
       "After tapping 'Show all 7 flights in September 2026' on the full sheet; the list is scrolled so September is at the top (the header and October are above).\n\n• Every September flight in date order, standouts still marked.\n• Ends with 'Show standouts only', which collapses the month again and keeps the heading in place.\n• Expanded months are restored on browser back together with scroll and ?q= (AC 19, recommended).",
       header=False, groups=expanded_groups("m"), signup=False, **FULL)
mobile(4, "Flights / Search results / Mobile / Light",
       "Typing 'forclaz' (URL becomes /flights?q=forclaz).\n\n• Count reads '9 of 165' (announced via aria-live).\n• Only months with matches remain, each shown in full; headings count matches: '1 of 4 flights · 1 h'.\n• Standouts among results keep their mark; search never promotes a flight.\n• Clearing the field returns the default view.",
       header=True, search=dict(q="forclaz", cnt="9 of 165"), groups=search_groups("m"), **HALF)
mobile(5, "Flights / No results / Mobile / Light",
       "Typing 'zzz'.\n\n• Empty state names the query and offers 'Clear search' (Button / Secondary), which empties the field, removes ?q= and returns focus to the search field.\n• Count reads '0 of 165'.",
       header=True, search=dict(q="zzz", cnt="0 of 165"), empty="zzz", **HALF)

desktop(0, "Flights / Default / Desktop / Light",
        "Desktop default: list in the side panel (Panel / Sheet), map fills the rest.\n\n• Same list as mobile; rows are 356 px wide.\n• Hover or focus a row → its track highlights on the map and the row takes List Item / Flight Current (as today).\n• Legend chips dropped (Decision).",
        header=True, search=dict(), groups=default_groups("d"))
desktop(1, "Flights / Month expanded / Desktop / Light",
        "After clicking 'Show all 7 flights in September 2026'; the panel content is scrolled so September is at the top (as on mobile, the whole panel content scrolls).\n\n• Every September flight in date order, standouts still marked; 'Show standouts only' collapses it again.",
        header=False, groups=expanded_groups("d"))
desktop(2, "Flights / Search results / Desktop / Light",
        "Search 'forclaz': '9 of 165', months with matches only, each in full, headings count matches. Under 1 h of airtime the summary shows minutes ('58 min').\n\n• The August standout (2h 30m, exactly at the threshold) keeps its mark.",
        header=True, search=dict(q="forclaz", cnt="9 of 165"), groups=search_groups("d"))
desktop(3, "Flights / No results / Desktop / Light",
        "Search 'zzz' with no match: empty state naming the query plus 'Clear search'.",
        header=True, search=dict(q="zzz", cnt="0 of 165"), empty="zzz")
desktop(4, "Flights / Hidden row hover / Desktop / Light",
        "Pointer over a track whose row is collapsed: Camille's Plan de l'Aiguille → Le Savoy, 18 Sep (1h 07m, not a standout).\n\n• The month's 'Show all 7 flights in September 2026' row takes the current-row highlight and shows the flight's colour bar (orange).\n• Nothing expands and nothing scrolls. Clicking the track still opens the flight.\n• If the month is scrolled out of view, nothing visible changes (no auto-scroll).\n• The track drawing is illustrative: the map backdrop is a still.",
        header=True, search=dict(), groups=default_groups("d"), hover=dict(month=1))

for spec, _ in frames:
    if spec.get("hover"):
        g = spec["groups"][spec["hover"]["month"]]
        g["foot"]["hl"] = "orange"

# Row states specimen sheets (mobile and desktop)
def specimens(bp):
    long_ = F("Aiguillette des Houches Sud-Est", "Plaine Joux Atterrissage", "Anne-Charlotte",
              "Advance Alpha 7 Light", "2026-09-19", "1h 58m", "61.0 km", "pink")
    long_s = F("Aiguillette des Houches Sud-Est", "Plaine Joux Atterrissage", "Anne-Charlotte",
               "Advance Alpha 7 Light", "2026-09-12", "2h 44m", "74.8 km", "pink", True)
    return [
        ("Plain row", [dict(r=row(O1, bp))]),
        ("Standout row", [dict(r=row(S2, bp))]),
        ("Hovered / current row", [dict(r=row(O2, bp, cur=True)), dict(r=row(S5, bp, cur=True))]),
        ("Keyboard focus", [dict(r=row(O4, bp, focus=True))]),
        ("Unknown takeoff", [dict(r=row(F("Unknown", "Doussard", "Ewan", "Niviuk Artik 6", "2026-09-13", "1h 03m", "24.8 km", "indigo"), bp))]),
        ("Unknown landing", [dict(r=row(F("Col de la Forclaz", "Unknown", "Marta", "Supair Leaf 3", "2026-09-12", "39min", "9.7 km", "blue"), bp))]),
        ("Long names truncate", [dict(r=row(long_, bp)), dict(r=row(long_s, bp))]),
        ("Collapsed month, standouts", [dict(h=("August 2026", "31 flights · 38 h")), dict(r=row(A1, bp)), dict(r=row(A2, bp)),
                                             dict(f=dict(txt=show_all(31, "August 2026")))]),
        ("Collapsed month, no standouts", [dict(h=("March 2026", "3 flights · 2 h")),
                                                                    dict(f=dict(txt=show_all(3, "March 2026"))),
                                                                    dict(h=("February 2026", "1 flight · 40 min")),
                                                                    dict(f=dict(txt=show_all(1, "February 2026")))]),
        ("End of an expanded month", [dict(r=row(S6, bp)), dict(r=row(S7, bp)), dict(f=dict(txt="Show standouts only", icon="chevron-up"))]),
        ("Outside /flights (full date)", [dict(r=row(O3, bp, full_date=True, mark=False))]),
    ] + ([("Show all, hidden row hovered",
           [dict(f=dict(txt=show_all(7, "September 2026"), hl="orange"))])] if bp == "d" else [])


SPEC_NOTE_M = "Row states specimen (mobile, rows 326 px wide as in the sheet). Not a screen: one frame showing every row state side by side.\n\n• Secondary tier uses $color-text-secondary (#4A4A4A), not muted, for AA (S-2).\n• Line 2 order: tag (standouts only), pilot, wing, weekday + day.\n• Show-all link text uses $color-text-primary with an underline instead of the library Link colour (#00A3DD is 2.7:1, below AA) — Decision."
SPEC_NOTE_D = "Row states specimen (desktop, rows 356 px wide as in the side panel).\n\n• Includes the 'Show all' row highlighted from the map (AC 20), desktop only."

others = []  # (kind, name, x, y, note)
others.append(("rows", "Flights / Row states / Mobile / Light", 0, SY, SPEC_NOTE_M))
others.append(("rows", "Flights / Row states / Desktop / Light", MSTEP, SY, SPEC_NOTE_D))
others.append(("dash", "Dashboard / Recent flights / Mobile / Light", MSTEP + 1440 + 400, SY,
               "/dashboard is only reachable signed in, so this frame is signed in (Théo) — the one exception to 'every frame logged out'.\n\nScrolled to Recent flights. Only the row changes: full date ('10 Oct 2026') on line 2, distance below airtime, no description, no dotted underlines, no standout mark (the standout treatment is /flights only). Everything else is unchanged."))
others.append(("dash", "Dashboard / Recent flights / Desktop / Light", MSTEP + 1440 + 400 + 800, SY,
               "Signed in (the page requires it). Scrolled to Recent flights; only the rows change. Théo's 10 Oct and 6 Sep flights are over 2 h 30 but carry no mark outside /flights."))
others.append(("pilot", "Pilot / Flights / Mobile / Light", MSTEP + 1440 + 400 + 800 + 1440 + 400, SY,
               "/pilots/[pilot_id], logged out, sheet at full, scrolled to Flights. Only the row changes (full date, no standout mark). The same row is used on /pilots/[pilot_id]/[wing] and /sites/[site_slug] (regression only)."))
others.append(("pilot", "Pilot / Flights / Desktop / Light", MSTEP + 1440 + 400 + 800 + 1440 + 400 + 800, SY,
               "/pilots/[pilot_id] on desktop, logged out. Only the rows change. Camille's 19 Sep flight (3h 05m) is a standout on /flights but carries no mark here."))


def payload():
    out = dict(frames=[dict(spec=s, note=n) for s, n in frames], subtitle=SUBTITLE,
               others=[])
    for kind, name, x, y, note in others:
        o = dict(kind=kind, name=name, x=x, y=y, note=note, bp="m" if "Mobile" in name else "d")
        if kind == "rows":
            o["items"] = [dict(label=lbl, parts=p) for lbl, p in specimens(o["bp"])]
        elif kind == "dash":
            o["takeoffs"] = [["Saint - hilaire du Touvet", "7"], ["Dent de Crolles Sud", "6"], ["Le Cul de Chien", "6"],
                             ["Col de la Forclaz", "4"], ["Montmin Sud", "3"], ["La Tournette Ouest", "2"]]
            o["rows"] = [row(f, o["bp"] if o["bp"] == "m" else "wide", full_date=True, mark=False) for f in THEO_RECENT]
        elif kind == "pilot":
            o["rows"] = [row(f, o["bp"], full_date=True, mark=False) for f in CAMILLE]
        out["others"].append(o)
    return out


if __name__ == "__main__":
    print(json.dumps(payload(), ensure_ascii=False))
