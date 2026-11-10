#!/usr/bin/env python3
"""Llegeix a hoquei.info els resultats dels grups on juga el Ribes (teams.json)
i escriu un data/<equip>.json per a cada un.

Només fa servir la biblioteca estàndard de Python. Si la pàgina d'un grup canvia
d'estructura o retorna menys partits dels esperats, aquell fitxer no es toca i la
web continua mostrant les últimes dades bones.
"""
import datetime as dt
import html
import json
import os
import re
import sys
import urllib.request

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
CONFIG = json.load(open(os.path.join(ROOT, "teams.json"), encoding="utf-8"))
SEASON_START_YEAR = CONFIG["seasonStartYear"]
DATA_DIR = os.path.join(ROOT, "data")

MONTHS = {"set": 9, "oct": 10, "nov": 11, "des": 12, "gen": 1, "feb": 2, "febr": 2,
          "mar": 3, "març": 3, "abr": 4, "mai": 5, "maig": 5, "jun": 6, "juny": 6,
          "jul": 7, "ag": 8, "ago": 8}

ROW_RE = re.compile(
    r'<div class="hs-match-date-sep">(?P<sep>[^<]*)</div>'
    r'|<a class="hs-match-row"[^>]*?href="(?P<href>[^"]*)"[^>]*>(?P<row>.*?)</a>', re.S)


def clean(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s))).strip()


def parse_date(sep):
    m = re.search(r"(\d{1,2})\s+([a-zç]+)", sep.lower())
    if not m:
        return None
    day, mon = int(m.group(1)), MONTHS.get(m.group(2).rstrip("."))
    if not mon:
        return None
    year = SEASON_START_YEAR if mon >= 8 else SEASON_START_YEAR + 1
    return dt.date(year, mon, day).isoformat()


def parse(text):
    matches = []
    for block in text.split('<section class="hs-matchday-block">')[1:]:
        block = block.split("</section>")[0]
        jm = re.search(r"<h4>\s*JORNADA\s+(\d+)", block, re.I)
        if not jm:
            continue
        jornada, date = int(jm.group(1)), None
        for m in ROW_RE.finditer(block):
            if m.group("sep") is not None:
                date = parse_date(m.group("sep"))
                continue
            row = m.group("row")
            st = re.search(r'hs-match-row__status--(\w+)">([^<]*)<', row)
            home = re.search(r'hs-match-row__home.*?hs-match-row__name">(.*?)</span>', row, re.S)
            away = re.search(r'hs-match-row__away.*?hs-match-row__name">(.*?)</span>', row, re.S)
            score = re.search(r'hs-match-row__score">(.*?)</div>', row, re.S)
            if not (st and home and away):
                continue
            status = st.group(1)
            sc = re.match(r"^(\d+)\s*-\s*(\d+)$", clean(score.group(1)) if score else "")
            mid = re.search(r"/partit/([^/]+)/?", m.group("href"))
            matches.append({
                "id": mid.group(1) if mid else None,
                "j": jornada,
                "date": date,
                "time": clean(st.group(2)) if status == "sched" else None,
                "status": status,
                "home": clean(home.group(1)),
                "away": clean(away.group(1)),
                "hg": int(sc.group(1)) if sc else None,
                "ag": int(sc.group(2)) if sc else None,
            })
    seen, uniq = set(), []
    for m in matches:  # un partit ajornat pot sortir dues vegades
        if m["id"] and m["id"] in seen:
            continue
        seen.add(m["id"])
        uniq.append(m)
    uniq.sort(key=lambda x: (x["j"], x["date"] or "", x["time"] or "", x["home"]))
    return uniq


def fetch(url):
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (seguiment-ribes; GitHub Actions)",
        "Accept-Language": "ca,es;q=0.8"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def update_team(team, text=None):
    out = os.path.join(DATA_DIR, team["id"] + ".json")
    old = None
    if os.path.exists(out):
        try:
            old = json.load(open(out, encoding="utf-8"))
        except ValueError:
            old = None
    matches = parse(text if text is not None else fetch(team["url"]))
    names = {m["home"] for m in matches} | {m["away"] for m in matches}
    floor = max(6, int(0.8 * len(old["matches"]))) if old else 6
    if len(matches) < floor or team["ribes"] not in names:
        raise ValueError(f"{len(matches)} partits, equip trobat: {team['ribes'] in names}")
    if old and old.get("matches") == matches:
        return "sense canvis"
    data = {
        "id": team["id"],
        "updated": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        "source": team["url"],
        "matches": matches,
    }
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=0)
        f.write("\n")
    done = sum(1 for m in matches if m["status"] == "ft")
    return f"actualitzat ({len(matches)} partits, {done} jugats)"


def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    only = set(sys.argv[1:])
    errors = 0
    for team in CONFIG["teams"]:
        if only and team["id"] not in only:
            continue
        try:
            print(f"{team['id']}: {update_team(team)}")
        except Exception as e:  # un grup que falla no ha d'aturar la resta
            errors += 1
            print(f"{team['id']}: ERROR {e}", file=sys.stderr)
    if errors and errors == len(only or CONFIG["teams"]):
        sys.exit(1)


if __name__ == "__main__":
    main()
