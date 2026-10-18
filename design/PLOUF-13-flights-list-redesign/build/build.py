#!/usr/bin/env python3
"""Emit the pen interactive command file that rebuilds designs.pen. Usage: build.py <export-dir> > cmds.txt"""
import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
HERE = os.path.dirname(os.path.abspath(__file__))
import gen

data = gen.payload()
prelude = open(os.path.join(HERE, "prelude.js")).read().replace("\n", "")
export_dir = os.path.abspath(sys.argv[1])



def ex(js):
    return "execute({ input: " + json.dumps(prelude + js, ensure_ascii=False) + " })"


lines = [ex(open(os.path.join(HERE, "components.js")).read().replace("\n", ""))]
for fr in data["frames"]:
    sp = fr["spec"]
    w = 390 if sp["bp"] == "m" else 1440
    js = f"f=BUILD({json.dumps(sp, ensure_ascii=False)},{json.dumps(data['subtitle'])});NOTE({sp['x'] + w + 30},{sp['y']},{json.dumps(fr['note'], ensure_ascii=False)});"
    lines.append(ex(js))
for o in data["others"]:
    fn = {"rows": "ROWS", "dash": "DASH", "pilot": "PILOT"}[o["kind"]]
    w = 390 if o["bp"] == "m" else 1440
    js = f"f={fn}({json.dumps(o, ensure_ascii=False)});NOTE({o['x'] + w + 30},{o['y']},{json.dumps(o['note'], ensure_ascii=False)});"
    lines.append(ex(js))
lines.append(ex('ids=Get((x,c)=>{c.skipChildren();return x.type==="frame"&&!String(x.id).includes(":")?x.id:undefined});Print("MAP",JSON.stringify(ids.map(i=>[i,Get(i,{depth:0}).name])));Export(ids,"png",EXPORT_DIR,{scale:2});'.replace("EXPORT_DIR", json.dumps(export_dir))))
lines += ["save()", "exit()"]
print("\n".join(lines))
