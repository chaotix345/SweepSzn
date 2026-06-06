import os, time, sys, urllib.request
sys.stdout.reconfigure(encoding="utf-8")

RAW = "data/raw"
os.makedirs(RAW, exist_ok=True)
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0 Safari/537.36"
THROTTLE = 3.6  # B-R rate limit ~20/min; stay under it
LOG = open(os.path.join(RAW, "_scrape.log"), "a", encoding="utf-8")

def log(msg):
    line = f"[{time.strftime('%H:%M:%S')}] {msg}"
    print(line); LOG.write(line + "\n"); LOG.flush()

def fetch(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 2000:
        return "cached"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read()
        with open(dest, "wb") as f:
            f.write(data)
        time.sleep(THROTTLE)
        return f"ok {len(data)}B"
    except urllib.error.HTTPError as e:
        time.sleep(THROTTLE)
        return f"HTTP {e.code}"
    except Exception as e:
        time.sleep(THROTTLE)
        return f"ERR {e}"

YEARS = range(1950, 2026)
total = 0; done = 0
for y in YEARS:
    targets = [
        (f"https://www.basketball-reference.com/leagues/NBA_{y}_per_game.html", f"{RAW}/NBA_{y}_per_game.html"),
        (f"https://www.basketball-reference.com/leagues/NBA_{y}_advanced.html", f"{RAW}/NBA_{y}_advanced.html"),
        (f"https://www.basketball-reference.com/leagues/NBA_{y}.html", f"{RAW}/NBA_{y}.html"),
    ]
    for url, dest in targets:
        total += 1
        res = fetch(url, dest)
        if res.startswith("ok") or res == "cached":
            done += 1
        log(f"{y} {os.path.basename(dest)} -> {res}")
log(f"DONE. {done}/{total} files present.")
LOG.write("SCRAPE_COMPLETE\n"); LOG.flush()
print("SCRAPE_COMPLETE")
