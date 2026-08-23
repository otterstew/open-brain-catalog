#!/usr/bin/env python3
"""Render docs/artifact-index.md into the published overview page.

The markdown file is the source of truth; this only lays it out. Run it after
editing an entry, or after the scheduled job appends one, then publish the
output with the Artifact tool at the SAME url so the link stays stable.

    python3 tools/build-artifact-index.py [out.html]
"""
import html
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "docs" / "artifact-index.md"
FIELDS = ("id", "title", "url", "audience", "role", "summary", "use", "holds", "review")


def parse(text):
    entries = []
    for block in text.split("## entry")[1:]:
        entry, key = {}, None
        for line in block.strip().splitlines():
            if line.startswith("## "):
                break
            m = re.match(r"^(\w+):\s*(.*)$", line)
            if m and m.group(1) in FIELDS:
                key = m.group(1)
                entry[key] = m.group(2).strip()
            elif key and line.strip():
                entry[key] += " " + line.strip()
        if entry.get("url"):
            entries.append(entry)
    return entries


CSS = """
:root{--ground:#EDF0F2;--paper:#FBFCFD;--paper-sunk:#E4E9EC;--ink:#12181D;
--ink-soft:#5B6670;--ink-faint:#8B959D;--rule:#D2D9DE;--rule-strong:#B9C3CA;
--signal:#0F6D6A;--signal-wash:#DDE9E8;--clay:#A8482E;--clay-wash:#F1E1DB;
--shadow:0 1px 2px rgba(18,24,29,.05),0 8px 24px -16px rgba(18,24,29,.28);
--serif:"IBM Plex Serif",Georgia,serif;--sans:"IBM Plex Sans",-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;
--mono:"IBM Plex Mono",ui-monospace,Menlo,Consolas,monospace}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--ground:#0E1317;--paper:#161D22;
--paper-sunk:#1D262C;--ink:#E3E9EC;--ink-soft:#99A5AD;--ink-faint:#6E7C85;--rule:#26313A;
--rule-strong:#33414B;--signal:#63C7BA;--signal-wash:#16302F;--clay:#E29377;--clay-wash:#33211A;
--shadow:0 1px 2px rgba(0,0,0,.4),0 10px 28px -18px rgba(0,0,0,.8)}}
:root[data-theme="dark"]{--ground:#0E1317;--paper:#161D22;--paper-sunk:#1D262C;--ink:#E3E9EC;
--ink-soft:#99A5AD;--ink-faint:#6E7C85;--rule:#26313A;--rule-strong:#33414B;--signal:#63C7BA;
--signal-wash:#16302F;--clay:#E29377;--clay-wash:#33211A;
--shadow:0 1px 2px rgba(0,0,0,.4),0 10px 28px -18px rgba(0,0,0,.8)}
body{background:var(--ground);color:var(--ink);font-family:var(--sans);font-size:17px;
line-height:1.62;-webkit-font-smoothing:antialiased}
.sheet{max-width:1000px;margin:0 auto;padding:clamp(28px,5vw,72px) clamp(18px,4vw,44px) 96px}
.masthead{display:flex;flex-direction:column;gap:20px;padding-bottom:34px;border-bottom:2px solid var(--ink)}
.eyebrow{font-family:var(--mono);font-size:12px;font-weight:500;letter-spacing:.13em;
text-transform:uppercase;color:var(--signal)}
h1{font-family:var(--serif);font-weight:600;font-size:clamp(34px,6vw,56px);line-height:1.05;
letter-spacing:-.015em;text-wrap:balance;max-width:15ch}
.standfirst{font-family:var(--serif);font-style:italic;font-size:clamp(18px,2.4vw,21px);
line-height:1.5;color:var(--ink-soft);max-width:62ch;text-wrap:pretty}
.factbar{display:flex;flex-wrap:wrap;gap:8px 28px;font-family:var(--mono);font-size:12.5px;color:var(--ink-faint)}
.factbar b{font-weight:500;color:var(--ink-soft)}
h2{font-family:var(--serif);font-weight:600;font-size:clamp(22px,3.2vw,29px);line-height:1.18;
letter-spacing:-.01em;margin:56px 0 6px;text-wrap:balance}
p{max-width:68ch;text-wrap:pretty}
a{color:var(--signal);text-decoration-thickness:1px;text-underline-offset:2px}
a:focus-visible{outline:2px solid var(--signal);outline-offset:3px;border-radius:2px}
.order{display:flex;flex-direction:column;gap:14px;margin-top:24px}
.card{background:var(--paper);border:1px solid var(--rule);border-radius:4px;
box-shadow:var(--shadow);overflow:hidden}
.card .head{display:flex;align-items:baseline;justify-content:space-between;gap:16px;
padding:14px 20px;background:var(--paper-sunk);border-bottom:1px solid var(--rule);flex-wrap:wrap}
.card .n{font-family:var(--mono);font-size:11.5px;color:var(--ink-faint);
font-variant-numeric:tabular-nums;flex:0 0 auto}
.card .name{font-family:var(--serif);font-size:20px;font-weight:600;letter-spacing:-.01em;flex:1 1 auto}
.card .name a{text-decoration:none;color:var(--ink)}
.card .name a:hover{color:var(--signal);text-decoration:underline}
.card .role{font-family:var(--mono);font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;
color:var(--signal);flex:0 0 auto}
.card .inner{padding:18px 20px 20px;display:flex;flex-direction:column;gap:14px}
.card .summary{font-size:16px;line-height:1.55;margin:0}
.meta{display:flex;flex-direction:column;gap:10px;font-size:14.5px;line-height:1.5}
.meta .row{display:flex;gap:12px;align-items:baseline}
.meta .k{font-family:var(--mono);font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;
color:var(--ink-faint);flex:0 0 76px;padding-top:2px}
.meta .v{flex:1 1 auto;max-width:62ch;margin:0}
.meta .v b{font-weight:600}
.flag{display:inline-block;font-family:var(--mono);font-size:10.5px;letter-spacing:.06em;
text-transform:uppercase;padding:3px 9px;border-radius:3px;background:var(--clay-wash);
color:var(--clay);border:1px solid var(--clay)}
.note{background:var(--paper);border:1px solid var(--rule);border-left:3px solid var(--signal);
border-radius:4px;padding:20px 22px;display:flex;flex-direction:column;gap:10px;
box-shadow:var(--shadow);margin-top:22px}
.note .label{font-family:var(--mono);font-size:11px;font-weight:500;letter-spacing:.12em;
text-transform:uppercase;color:var(--signal)}
.note .lead{font-family:var(--serif);font-size:18px;line-height:1.5}
footer{margin-top:72px;padding-top:22px;border-top:1px solid var(--rule);
font-size:13.5px;color:var(--ink-faint)}
"""


def render(entries):
    e = html.escape
    cards = []
    for i, x in enumerate(entries, 1):
        flag = ""
        if x.get("review", "").lower() in ("yes", "true"):
            flag = '<span class="flag">needs a human sentence</span>'
        rows = "".join(
            f'<div class="row"><span class="k">{k}</span>'
            f'<p class="v">{e(x[f])}</p></div>'
            for k, f in (("For", "audience"), ("Use it", "use"), ("Holds", "holds"))
            if x.get(f)
        )
        cards.append(f"""<article class="card">
<div class="head">
  <span class="n">{i:02d}</span>
  <span class="name"><a href="{e(x['url'])}">{e(x.get('title','Untitled'))}</a></span>
  <span class="role">{e(x.get('role',''))}</span>
</div>
<div class="inner">
  {flag}
  <p class="summary">{e(x.get('summary',''))}</p>
  <div class="meta">{rows}</div>
</div>
</article>""")

    return f"""<title>The Artefact Set</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Serif:ital,wght@0,500;0,600&display=swap">
<style>{CSS}</style>
<div class="sheet">
<header class="masthead">
  <div class="eyebrow">Index · start here</div>
  <h1>The Artefact Set</h1>
  <p class="standfirst">Everything written about putting this system inside Microsoft — what each page is, who it is for, and the order to use them in.</p>
  <div class="factbar">
    <span><b>Pages</b> {len(entries)}</span>
    <span><b>Send</b> only the third one</span>
    <span><b>Index refreshed</b> weekly</span>
  </div>
</header>

<h2>The order that matters</h2>
<p>These are not ranked by importance. They are in the order you would actually reach for them: the opening move, then what it needs behind it, then what comes next if it lands.</p>
<div class="note">
  <div class="label">The one rule</div>
  <p class="lead">Only the Sponsor Approach Note is meant to be sent.</p>
  <p>The others are yours. Handing a first-time reader the build plan reads as over-engineering; handing them the organisational case before they have seen anything working reads as asking for money. Both are good documents at the wrong moment.</p>
</div>

<div class="order">
{"".join(cards)}
</div>

<footer>Source of truth is <code>docs/artifact-index.md</code>; this page is generated from it by <code>tools/build-artifact-index.py</code>. A weekly job appends anything newly published and flags it for a human sentence — it never rewrites an entry that already has one.</footer>
</div>
"""


def main():
    entries = parse(SRC.read_text())
    out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "artifact-index.html"
    out.write_text(render(entries))
    print(f"{len(entries)} entries -> {out}")


if __name__ == "__main__":
    main()
