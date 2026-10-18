#!/usr/bin/env python3
"""Run a pen interactive command file on a .pen file (headless); save any screenshots as PNGs, print the rest."""
import base64, json, os, re, subprocess, sys, time

cmd_file = sys.argv[1]
pen = sys.argv[2]
shots = os.path.join(os.path.dirname(os.path.abspath(cmd_file)), "shots")
os.makedirs(shots, exist_ok=True)
with open(cmd_file) as f:
    out = subprocess.run(["pen", "interactive", "-i", pen, "-o", pen], stdin=f,
                         stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True).stdout
stamp = time.strftime("%H%M%S")
n = [0]

def repl(m):
    n[0] += 1
    path = f"{shots}/{stamp}-{m.group(1)}-{n[0]}.png"
    with open(path, "wb") as fh:
        fh.write(base64.b64decode(m.group(2)))
    return f'"image": "<saved {path}>"'

out = re.sub(r'"nodeId": "([^"]+)",\s*"image": "([A-Za-z0-9+/=]+)"', repl, out)
out = "\n".join(l for l in out.splitlines() if not l.startswith("    at "))
print(out)
