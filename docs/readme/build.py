#!/usr/bin/env python3
"""Gera as animações SVG do README a partir do visual do site (preto, ciano, Archivo condensada, Geist Mono).

GitHub não roda JS no README, mas mostra SVG animado (CSS dentro do SVG) — então as animações da
página são recriadas aqui. As fontes vão embutidas (subconjunto, base64) para renderizar igual em
qualquer lugar. Rodar: python3 docs/readme/build.py  → docs/readme/{hero,demo,flow}.svg
"""
import base64, html, random
from pathlib import Path

HERE = Path(__file__).parent
ACC, TEXT, MUTED, FAINT, OK, WARN, GOLD = "#5ff5ff", "#f5f5f5", "#a3a3a3", "#6b6b6b", "#4ade80", "#fbbf24", "#fbbf24"
GHOST = ("M32 6C45 6 51 16 51 29V37C55 38 59 41 59 44C59 47 55 47.5 51.5 46.5V55Q47.2 61.5 42.7 55Q38.3 61.5 34 55"
         "Q29.7 61.5 25.3 55Q20.8 61.5 16.5 55L12.5 55V46.5C9 47.5 5 47 5 44C5 41 9 38 13 37V29C13 16 19 6 32 6Z")


def font(name, family, weight, stretch="normal"):
    data = base64.b64encode((HERE / "fonts" / f"{name}.woff2").read_bytes()).decode()
    return (f"@font-face{{font-family:'{family}';font-weight:{weight};font-stretch:{stretch};"
            f"src:url(data:font/woff2;base64,{data}) format('woff2')}}")


ALL_FONTS = {
    "d600": lambda: font("archivo-62-600", "RW Display", 600, "62%"), "d300": lambda: font("archivo-62-300", "RW Display", 300, "62%"),
    "m400": lambda: font("geistmono-400", "RW Mono", 400), "m600": lambda: font("geistmono-600", "RW Mono", 600),
    "s400": lambda: font("geist-400", "RW Sans", 400),
}
BASE_CSS = f"""
.d{{font-family:'RW Display','Archivo Narrow','Arial Narrow',sans-serif;font-weight:600;font-stretch:62%}}
.dl{{font-family:'RW Display','Archivo Narrow','Arial Narrow',sans-serif;font-weight:300;font-stretch:62%}}
.m{{font-family:'RW Mono',ui-monospace,'SF Mono',Menlo,Consolas,monospace}}
.mb{{font-family:'RW Mono',ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-weight:600}}
.s{{font-family:'RW Sans',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif}}
@media (prefers-reduced-motion: reduce){{*{{animation:none!important}}}}
"""


def svg(w, h, body, css="", title="", fonts=("d600", "m400")):
    embedded = "\n".join(ALL_FONTS[f]() for f in fonts)          # só as fontes que o SVG usa
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img">'
            f"<title>{html.escape(title)}</title><style>{embedded}{BASE_CSS}{css}</style>{body}</svg>\n")


def ghost_mark(x, y, s, color=TEXT, sw=3.4):
    k = s / 64
    return (f'<g transform="translate({x} {y}) scale({k})"><path d="{GHOST}" fill="none" stroke="{color}" stroke-width="{sw}" '
            f'stroke-linejoin="round"/><ellipse cx="25.5" cy="28" rx="3" ry="3.8" fill="{color}"/>'
            f'<ellipse cx="38.5" cy="28" rx="3" ry="3.8" fill="{color}"/></g>')


# ------------------------------------------------------------------ 1. hero

def hero():
    W, H = 1280, 560
    random.seed(7)
    cells, css = [], []
    C, G = 16, 4
    x0, cols, rows = 540, (W - 540) // C, H // C
    for r in range(rows):
        for c in range(cols):
            x, y = x0 + c * C, r * C
            v = random.random()
            if v > 0.42:
                delay = (c + r * 0.5) * 0.05
                cells.append(f'<rect class="w" x="{x}" y="{y}" width="{C-G}" height="{C-G}" style="animation-delay:{delay:.2f}s"/>')
            elif v > 0.36:
                cells.append(f'<rect x="{x}" y="{y}" width="{C-G}" height="{C-G}" fill="#fff" fill-opacity=".14"/>')
            else:
                cells.append(f'<rect x="{x}" y="{y}" width="{C-G}" height="{C-G}" fill="#fff" fill-opacity=".04"/>')
    css.append("""
.w{fill:#fff;fill-opacity:.05;animation:wave 4.2s linear infinite}
@keyframes wave{0%,100%{fill:#fff;fill-opacity:.05}4%{fill:#5ff5ff;fill-opacity:.85}9%{fill:#fff;fill-opacity:.22}16%{fill-opacity:.05}}
.fadein{animation:fi 1.1s ease-out both}.fi2{animation-delay:.15s}.fi3{animation-delay:.3s}.fi4{animation-delay:.45s}.fi5{animation-delay:.7s}
@keyframes fi{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.caret{animation:bl 1s steps(2) infinite}@keyframes bl{50%{opacity:0}}
""")
    body = f"""
<rect width="{W}" height="{H}" fill="#000"/>
<defs><linearGradient id="fade" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity="1"/><stop offset=".22" stop-color="#000" stop-opacity="0"/></linearGradient>
<linearGradient id="fadeb" x1="0" y1="0" x2="0" y2="1"><stop offset=".75" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="1"/></linearGradient></defs>
<g>{''.join(cells)}</g>
<rect x="{x0}" width="{W-x0}" height="{H}" fill="url(#fade)"/><rect width="{W}" height="{H}" fill="url(#fadeb)"/>
<g class="fadein">{ghost_mark(64, 52, 40)}<text x="114" y="84" class="d" font-size="30" fill="{TEXT}" letter-spacing="1">RAMWISP</text></g>
<text x="64" y="160" class="m fadein fi2" font-size="17" fill="{TEXT}" letter-spacing="2">[ RAM FOR SUBAGENTS ]</text>
<g class="fadein fi3"><text x="60" y="258" class="d" font-size="104" fill="{TEXT}">YOUR SUBAGENTS</text>
<text x="60" y="352" class="d" font-size="104" fill="{TEXT}">DON’T FIT IN</text>
<text x="60" y="446" class="d" font-size="104" fill="{ACC}">YOUR RAM.</text></g>
<g class="fadein fi5"><rect x="64" y="486" width="640" height="44" fill="#050505" stroke="#2a2a2a"/>
<text x="82" y="514" class="m" font-size="15" fill="{ACC}">$</text>
<text x="102" y="514" class="m" font-size="15" fill="{TEXT}">claude mcp add --scope user ramwisp -- npx -y ramwisp@latest</text>
<rect class="caret" x="690" y="500" width="8" height="18" fill="{TEXT}"/></g>
"""
    return svg(W, H, body, "".join(css), "ramwisp — Your subagents don’t fit in your RAM.")


# ------------------------------------------------------------------ 2. demo (sessão real do Claude Code)

def demo():
    W, H, T = 1280, 640, 16.0
    lines = [
        ("you", "> run every package’s tests in parallel and fix whatever breaks"),
        ("say", "⏺ I’ll give each package its own ramwisp subagent with 8 GB."),
        ("tool", '⏺ ramwisp - spawn_agent (MCP)(mission: "Run the tests in packages/api…", ram_gb: 8, workspace: ".")'),
        ("out", '  ⎿  { "id": "wp-3fa91c20", "status": "launching", "instance_type": "m7i.xlarge" }'),
        ("dim", "  … +3 more spawn_agent calls"),
        ("tool", '⏺ ramwisp - wait_agent (MCP)(id: "wp-3fa91c20")'),
        ("out", '  ⎿  { "status": "done", "result": "2 failing tests fixed", "patch_stat": "3 files changed" }'),
        ("dim", "  … +3 more wait_agent calls"),
        ("tool", "⏺ Bash(git apply ~/.config/wisp/patches/wp-3fa91c20.patch)"),
        ("out", "  ⎿  (No content)"),
        ("say", "⏺ All 4 finished. Applied 2 patches — the whole suite passes."),
    ]
    start = [0.6 + i * 0.75 for i in range(len(lines))]
    boot_t, run_t, done_t, end_t = start[2], start[5], start[8], start[10] + 2.2
    pct = lambda t: f"{100 * t / T:.2f}%"
    css = [f".ln{{opacity:0;animation-duration:{T}s;animation-iteration-count:infinite;animation-timing-function:steps(1,end)}}"]
    tl = []
    y = 150
    for i, (k, text) in enumerate(lines):
        css.append(f"@keyframes l{i}{{0%{{opacity:0}}{pct(start[i])}{{opacity:1}}{pct(end_t)}{{opacity:1}}{pct(end_t + 0.01)},100%{{opacity:0}}}}")
        color = {"you": "#d4d4d4", "say": TEXT, "tool": TEXT, "out": "#9a9a9a", "dim": FAINT}[k]
        cls = "s" if k == "say" else ("mb" if k == "tool" else "m")
        t = text if len(text) < 88 else text[:86] + "…"
        extra = ""
        if k == "you":
            extra = f'<rect x="40" y="{y-19}" width="700" height="28" fill="#fff" fill-opacity=".06"/>'
        dot = ""
        if k == "tool":
            dot = f'<text x="52" y="{y}" class="m" font-size="14" fill="{OK}">⏺</text>'
            t = "  " + t[1:]
        tl.append(f'<g class="ln" style="animation-name:l{i}">{extra}{dot}<text x="52" y="{y}" class="{cls}" font-size="14" fill="{color}" xml:space="preserve">{html.escape(t)}</text></g>')
        y += 34 if k in ("you", "say") else 30
    # painel das máquinas: estados por janela de tempo
    states = [("—", 0, boot_t, FAINT), ("attesting", boot_t, run_t, TEXT), ("running", run_t, done_t, TEXT),
              ("done", done_t, end_t - 0.9, OK), ("evaporated", end_t - 0.9, end_t, FAINT)]
    for j, (_, a, b, _) in enumerate(states):
        css.append(f"@keyframes st{j}{{0%{{opacity:0}}{pct(a)}{{opacity:1}}{pct(b)}{{opacity:1}}{pct(b + 0.01)},100%{{opacity:0}}}}")
    css.append(f"@keyframes st0x{{0%,{pct(boot_t)}{{opacity:1}}{pct(boot_t+0.01)},{pct(end_t)}{{opacity:0}}{pct(end_t+0.01)},100%{{opacity:1}}}}")
    names, ram = ["api", "web", "worker", "shared"], [0.62, 0.48, 0.71, 0.39]
    rows = []
    for i, n in enumerate(names):
        yy = 318 + i * 46
        css.append(f"@keyframes bar{i}{{0%,{pct(boot_t)}{{transform:scaleX(0)}}{pct(boot_t+0.4)}{{transform:scaleX(.08)}}"
                   f"{pct(run_t+0.6)}{{transform:scaleX({ram[i]})}}{pct(run_t+2.2)}{{transform:scaleX({max(0.2, ram[i]-0.18)})}}"
                   f"{pct(done_t)}{{transform:scaleX({ram[i]})}}{pct(end_t-0.9)}{{transform:scaleX(0)}}100%{{transform:scaleX(0)}}}}")
        st = "".join(
            f'<text x="1222" y="{yy+5}" text-anchor="end" class="m ln" font-size="13" fill="{c}" style="animation-name:{"st0x" if j == 0 else f"st{j}"}">{s}</text>'
            for j, (s, _, _, c) in enumerate(states))
        rows.append(f'<line x1="808" x2="1222" y1="{yy-22}" y2="{yy-22}" stroke="#1f1f1f"/>{ghost_mark(806, yy-14, 20, "#8a8a8a", 3.6)}'
                    f'<text x="836" y="{yy+5}" class="m" font-size="13" fill="{TEXT}">{n}</text>'
                    f'<rect x="920" y="{yy-3}" width="170" height="5" fill="#1a1a1a"/>'
                    f'<rect x="920" y="{yy-3}" width="170" height="5" fill="{ACC}" style="transform-origin:920px 0;animation:bar{i} {T}s linear infinite"/>{st}')
    css.append(f"@keyframes lap{{0%,{pct(boot_t)}{{transform:scaleX(.34)}}{pct(boot_t+0.6)},{pct(end_t)}{{transform:scaleX(.31)}}100%{{transform:scaleX(.34)}}}}")
    body = f"""
<rect width="{W}" height="{H}" fill="#000"/>
<rect x="20" y="20" width="{W-40}" height="{H-40}" fill="#050505" stroke="#2a2a2a"/>
<line x1="20" x2="{W-20}" y1="70" y2="70" stroke="#2a2a2a"/>
<rect x="36" y="32" width="112" height="26" fill="{ACC}"/><text x="92" y="50" text-anchor="middle" class="m" font-size="13" fill="#000">Claude Code</text>
<rect x="148" y="32" width="70" height="26" fill="none" stroke="#2a2a2a"/><text x="183" y="50" text-anchor="middle" class="m" font-size="13" fill="{FAINT}">Codex</text>
<text x="{W/2}" y="50" text-anchor="middle" class="m" font-size="13" fill="{FAINT}">~/project</text>
<rect x="{W-140}" y="32" width="100" height="26" fill="none" stroke="#2a2a2a"/><text x="{W-90}" y="50" text-anchor="middle" class="m" font-size="13" fill="{TEXT}">us-east-1</text>
<line x1="782" x2="782" y1="70" y2="{H-80}" stroke="#2a2a2a"/>
{''.join(tl)}
<text x="806" y="112" class="m" font-size="13" fill="{TEXT}" letter-spacing="1">YOUR LAPTOP · 16 GB</text>
<rect x="806" y="126" width="416" height="6" fill="#1a1a1a"/><rect x="806" y="126" width="416" height="6" fill="{ACC}" style="transform-origin:806px 0;animation:lap {T}s linear infinite"/>
<text x="806" y="156" class="m" font-size="12" fill="{FAINT}">4 subagents running elsewhere</text>
<text x="806" y="270" class="m" font-size="13" fill="{TEXT}" letter-spacing="1">MACHINES</text><text x="1222" y="270" text-anchor="end" class="m" font-size="12" fill="{FAINT}">nitro enclave</text>
{''.join(rows)}
<line x1="20" x2="{W-20}" y1="{H-80}" y2="{H-80}" stroke="#2a2a2a"/>
<text x="40" y="{H-52}" class="m" font-size="13" fill="{TEXT}" letter-spacing="1">ENCLAVE ATTESTED <tspan fill="{FAINT}">· PCR0 32d2…d0a4e</tspan></text>
<circle cx="{W-196}" cy="{H-56}" r="3.5" fill="#ff5a5f"/><text x="{W-40}" y="{H-52}" text-anchor="end" class="m" font-size="13" fill="{TEXT}" letter-spacing="1">UPTIME 00:22:17</text>
"""
    return svg(W, H, body, "".join(css), "A real Claude Code session launching 4 ramwisp subagents", ("m400", "m600", "s400"))


# ------------------------------------------------------------------ 3. flow (subagentes indo para as máquinas)

def flow():
    COLS, ROWS, C = 40, 18, 28
    OX, OY = 40, 70
    W, H, T = OX * 2 + COLS * C, OY + ROWS * C + 110, 13.0
    pct = lambda t: f"{100 * t / T:.2f}%"
    GH = [".###.", "#####", "#.#.#", "#####", "#.#.#"]
    cell = lambda c, r: (OX + c * C, OY + r * C)
    parts, css = [], []
    # fundo do tabuleiro
    random.seed(3)
    for r in range(ROWS):
        for c in range(COLS):
            x, y = cell(c, r)
            parts.append(f'<rect x="{x+1}" y="{y+1}" width="{C-3}" height="{C-3}" fill="#fff" fill-opacity="{0.035 if random.random() > .1 else 0.09}"/>')
    # rótulos das áreas
    labels = [("YOUR LAPTOP", 1, 0), ("ATTESTATION", 15, 0), ("MACHINES · 4 × 8 GB", 24, 0)]
    for t, c, r in labels:
        x, y = cell(c, r)
        parts.append(f'<text x="{x}" y="{OY - 14}" class="m" font-size="14" fill="{MUTED}" letter-spacing="2">{t}</text>')
    # barra de RAM do notebook: vermelha lotada → verde leve
    css.append(f"@keyframes ramhot{{0%,{pct(4.6)}{{fill:#ff5a5f}}{pct(4.61)},100%{{fill:{OK}}}}}")
    for k in range(12):
        x, y = cell(1 + k, 15)
        on = f'style="animation:ramhot {T}s steps(1,end) infinite"' if k < 4 else f'class="rk{k}"'
        parts.append(f'<rect x="{x+1}" y="{y+1}" width="{C-3}" height="{C-3}" fill="#ff5a5f" {on}/>')
    css.append(f".rk4,.rk5,.rk6,.rk7,.rk8,.rk9,.rk10,.rk11{{animation:ramoff {T}s steps(1,end) infinite}}"
               f"@keyframes ramoff{{0%,{pct(4.6)}{{fill-opacity:1}}{pct(4.61)},100%{{fill-opacity:.1;fill:#fff}}}}")
    # portão + cadeado piscando
    for r in range(1, 17):
        for c in (17, 18):
            x, y = cell(c, r)
            parts.append(f'<rect x="{x+1}" y="{y+1}" width="{C-3}" height="{C-3}" fill="#fff" fill-opacity=".13" class="gate" style="animation-delay:{(r % 6) * 0.08:.2f}s"/>')
    css.append(f".gate{{animation:gscan {T}s steps(1,end) infinite}}@keyframes gscan{{0%,{pct(4.0)}{{fill:#fff;fill-opacity:.13}}"
               f"{pct(4.0)},{pct(6.2)}{{fill:{ACC};fill-opacity:.55}}{pct(6.21)},100%{{fill:#fff;fill-opacity:.13}}}}")
    LOCK = [".##.", "#..#", "####", "####"]
    lock = "".join(f'<rect x="{cell(16 + x, 7 + y)[0]+1}" y="{cell(16 + x, 7 + y)[1]+1}" width="{C-3}" height="{C-3}" fill="{ACC}"/>'
                   for y, row in enumerate(LOCK) for x, ch in enumerate(row) if ch == "#")
    parts.append(f'<g style="animation:lockb {T}s steps(1,end) infinite">{lock}</g>')
    css.append(f"@keyframes lockb{{0%,{pct(4.0)}{{opacity:0}}{pct(4.0)}{{opacity:1}}{pct(4.5)}{{opacity:0}}{pct(5.0)}{{opacity:1}}{pct(5.5)}{{opacity:0}}{pct(6.0)}{{opacity:1}}{pct(6.3)},100%{{opacity:0}}}}")
    # máquinas: aparecem (✓), rodam (barra de RAM), evaporam
    VMS = [(24, 1), (32, 1), (24, 9), (32, 9)]
    CHECK = [".....#", "....#.", "#..#..", ".##..."]
    for m, (c0, r0) in enumerate(VMS):
        edge = []
        for r in range(r0, r0 + 7):
            for c in range(c0, c0 + 7):
                if r in (r0, r0 + 6) or c in (c0, c0 + 6):
                    x, y = cell(c, r)
                    edge.append(f'<rect x="{x+1}" y="{y+1}" width="{C-3}" height="{C-3}" fill="#fff" fill-opacity=".22"/>')
        chk = "".join(f'<rect x="{cell(c0 + 1 + x, r0 + 1 + y)[0]+1}" y="{cell(c0 + 1 + x, r0 + 1 + y)[1]+1}" width="{C-3}" height="{C-3}" fill="{OK}"/>'
                      for y, row in enumerate(CHECK) for x, ch in enumerate(row) if ch == "#")
        bar = "".join(f'<rect x="{cell(c0 + 1 + k, r0 + 7)[0]+1}" y="{cell(c0 + 1 + k, r0 + 7)[1]+1}" width="{C-3}" height="{C-3}" fill="{ACC}" '
                      f'style="animation:vmb{m}_{k} {T}s steps(1,end) infinite"/>' for k in range(5))
        for k in range(5):
            on_at = [7.0 + 0.3 * ((k + m) % 3), 8.2 + 0.25 * ((k * 2 + m) % 4)]
            css.append(f"@keyframes vmb{m}_{k}{{0%,{pct(6.6)}{{opacity:0}}{pct(on_at[0])}{{opacity:{1 if k < 3 + m % 2 else 0}}}"
                       f"{pct(on_at[1])}{{opacity:{1 if k < 2 + (m+1) % 3 else 0}}}{pct(9.4)}{{opacity:{1 if k < 4 - m % 2 else 0}}}{pct(10.2)},100%{{opacity:0}}}}")
        parts.append(f'<g style="animation:vm {T}s steps(1,end) infinite;animation-delay:0s">{"".join(edge)}'
                     f'<g style="animation:chk{m} {T}s steps(1,end) infinite">{chk}</g>{bar}</g>')
        css.append(f"@keyframes chk{m}{{0%,{pct(2.6 + m * 0.35)}{{opacity:0}}{pct(2.6 + m * 0.35)},{pct(4.2)}{{opacity:1}}{pct(4.21)},100%{{opacity:0}}}}")
    css.append(f"@keyframes vm{{0%,{pct(2.0)}{{opacity:0}}{pct(2.0)},{pct(10.4)}{{opacity:1}}{pct(10.7)}{{opacity:.5}}{pct(11.0)}{{opacity:.2}}{pct(11.3)},100%{{opacity:0}}}}")
    # fantasminhas de blocos: espremidos → fila → atravessam → rodam → evaporam
    cram, lane = [(1, 2), (6, 2), (2, 6), (7, 6)], [(14, 2), (14, 5), (14, 9), (14, 12)]
    for i in range(4):
        tgt = (VMS[i][0] + 1, VMS[i][1] + 1)
        dx = lambda p: (p[0] - cram[i][0]) * C
        dy = lambda p: (p[1] - cram[i][1]) * C
        go = 4.2 + i * 0.45
        css.append(f"@keyframes gm{i}{{0%,{pct(1.8)}{{transform:translate(0,0)}}{pct(2.6)},{pct(go)}{{transform:translate({dx(lane[i])}px,{dy(lane[i])}px)}}"
                   f"{pct(go + 0.8)},100%{{transform:translate({dx(tgt)}px,{dy(tgt)}px)}}}}"
                   f"@keyframes gc{i}{{0%,{pct(go)}{{fill:{TEXT}}}{pct(go + 0.01)},100%{{fill:{ACC}}}}}"
                   f"@keyframes go{i}{{0%,{pct(0.3)}{{opacity:0}}{pct(0.3 + i * 0.15)},{pct(10.0)}{{opacity:1}}{pct(10.4)}{{opacity:.5}}{pct(10.8)},100%{{opacity:0}}}}")
        rects = "".join(f'<rect x="{cell(cram[i][0] + x, cram[i][1] + y)[0]+1}" y="{cell(cram[i][0] + x, cram[i][1] + y)[1]+1}" width="{C-3}" height="{C-3}"/>'
                        for y, row in enumerate(GH) for x, ch in enumerate(row) if ch == "#")
        parts.append(f'<g style="animation:go{i} {T}s linear infinite"><g style="animation:gm{i} {T}s steps(6,end) infinite">'
                     f'<g style="animation:gc{i} {T}s steps(1,end) infinite;fill:{TEXT}">{rects}</g></g></g>')
    # pacotes dourados (respostas) voltando
    for m, (c0, r0) in enumerate(VMS):
        t0 = 9.6 + m * 0.2
        sx, sy = cell(c0, r0 + 3)
        ex, ey = cell(12, 3 + m)
        css.append(f"@keyframes pk{m}{{0%,{pct(t0)}{{opacity:0;transform:translate(0,0)}}{pct(t0 + 0.01)}{{opacity:1;transform:translate(0,0)}}"
                   f"{pct(t0 + 1.3)}{{opacity:1;transform:translate({ex - sx}px,{ey - sy}px)}}{pct(t0 + 1.31)},100%{{opacity:0;transform:translate({ex - sx}px,{ey - sy}px)}}}}")
        parts.append(f'<rect x="{sx+1}" y="{sy+1}" width="{C-3}" height="{C-3}" fill="{GOLD}" style="opacity:0;animation:pk{m} {T}s steps(8,end) infinite"/>')
    # os 5 passos embaixo, acendendo em sequência
    steps = [("01", "REQUEST", 0, 2.0), ("02", "PROVE", 2.0, 4.0), ("03", "SEAL", 4.0, 6.4), ("04", "RUN", 6.4, 9.5), ("05", "EVAPORATE", 9.5, 12.2)]
    sw = (COLS * C) / 5
    for k, (n, t, a, b) in enumerate(steps):
        x = OX + k * sw
        yb = OY + ROWS * C + 44
        css.append(f"@keyframes sp{k}{{0%,{pct(a)}{{opacity:.35}}{pct(a + 0.01)},{pct(b)}{{opacity:1}}{pct(b + 0.01)},100%{{opacity:.35}}}}"
                   f"@keyframes sb{k}{{0%,{pct(a)}{{transform:scaleX(0)}}{pct(b)}{{transform:scaleX(1)}}{pct(b + 0.01)},100%{{transform:scaleX(0)}}}}")
        parts.append(f'<g style="animation:sp{k} {T}s steps(1,end) infinite"><text x="{x}" y="{yb}" class="m" font-size="14" fill="{ACC}">{n}</text>'
                     f'<text x="{x + 30}" y="{yb}" class="d" font-size="30" fill="{TEXT}">{t}</text></g>'
                     f'<rect x="{x}" y="{yb + 16}" width="{sw - 16}" height="3" fill="#222"/>'
                     f'<rect x="{x}" y="{yb + 16}" width="{sw - 16}" height="3" fill="{ACC}" style="transform-origin:{x}px 0;animation:sb{k} {T}s linear infinite"/>')
    body = f'<rect width="{W}" height="{H}" fill="#000"/>' + "".join(parts)
    return svg(W, H, body, "".join(css), "Subagents leave your laptop, pass attestation, run on their own machines and evaporate")


if __name__ == "__main__":
    for name, fn in (("hero", hero), ("demo", demo), ("flow", flow)):
        out = HERE / f"{name}.svg"
        out.write_text(fn(), encoding="utf-8")
        print(f"{out.relative_to(HERE.parent.parent)}  {out.stat().st_size // 1024} KB")
