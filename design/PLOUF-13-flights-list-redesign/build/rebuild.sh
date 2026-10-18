#!/bin/zsh
# Rebuild designs.pen from gen.py (data) + prelude.js / components.js (pen.dev execute helpers),
# export every frame at scale 2 and write exports/View--State--Breakpoint--Theme.png.
# Needs the pen CLI with PEN_CLI_KEY. Run from anywhere: design/PLOUF-13-flights-list-redesign/build/rebuild.sh
set -e
here=${0:A:h}
cd "$(git -C "$here" rev-parse --show-toplevel)"
proj=design/PLOUF-13-flights-list-redesign
tmp=$(mktemp -d)
python3 "$here/build.py" "$tmp/export" > "$tmp/cmds.txt"
python3 "$here/run.py" "$tmp/cmds.txt" "$proj/designs.pen" > "$tmp/out.txt"
if grep -q -E "rror:|issues detected" "$tmp/out.txt"; then grep -n -E "rror:|issues detected" "$tmp/out.txt"; exit 1; fi
rm -rf "$proj/exports"; mkdir -p "$proj/exports"
python3 - "$tmp" "$proj/exports" <<'PY'
import json, re, shutil, sys
tmp, dest = sys.argv[1:]
out = open(f"{tmp}/out.txt").read()
for i, name in json.loads(re.search(r"MAP (\[.*\])", out).group(1)):
    if name.endswith(" / Light"):   # frames only; components are not exported
        shutil.copy(f"{tmp}/export/{i}.png", f"{dest}/" + name.replace(" / ", "--").replace(" · ", "-").replace(" ", "-") + ".png")
PY
ls "$proj/exports"
