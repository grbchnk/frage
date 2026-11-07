"""Download original quiz photographs and retain source/license metadata. No image edits."""
import concurrent.futures
import hashlib
import json
from pathlib import Path
import sys
import urllib.parse
import urllib.request

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "assets" / "images"
DEST.mkdir(parents=True, exist_ok=True)
UA = {"User-Agent": "FriendsQuizResearch/1.0"}
FILES = {
    "q08-100": "File:Bartekopp Norsk folkemuseum NF.1985-0623.jpg",
    "q08-200": "File:Stopfpilz.jpg",
    "q08-300": "File:Sugar nips Sweden 1800s.jpg",
    "q08-400": "File:Stretcher, glove (AM 2005.87.10-1).jpg",
    "q08-500": "File:Asparagus tongs MET 183254.jpg",
    "q09-200": "File:Florence Lawrence02 1908.jpg",
    "q09-300": "File:Emma Goldman 1901 mugshot.png",
    "q09-400": "File:Evelyn Nesbit.jpg",
    "q09-500": "File:Goldman.jpg",
    "q04-300": "File:Fire grenade P1950083.jpg",
}

def request(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40)

params = {"action": "query", "format": "json", "titles": "|".join(FILES.values()),
          "prop": "imageinfo", "iiprop": "url|extmetadata", "iiurlwidth": "1600"}
data = json.load(request("https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(params)))
pages = {p["title"]: p for p in data["query"]["pages"].values()}

def download(item):
    asset_id, title = item
    info = pages[title]["imageinfo"][0]
    url = info["url"].split("?")[0]
    ext = Path(urllib.parse.unquote(urllib.parse.urlparse(url).path)).suffix.lower()
    path = DEST / (asset_id + ext)
    if path.exists():
        raw = path.read_bytes()
    else:
        try:
            raw = request(url).read()
        except Exception:
            url = info.get("thumburl", info["url"])
            raw = request(url).read()
    path.write_bytes(raw)
    meta = info.get("extmetadata", {})
    def field(k): return meta.get(k, {}).get("value", "")
    return {"id": asset_id, "path": path.relative_to(ROOT).as_posix(), "source_url": info["descriptionurl"],
            "download_url": url, "title": title, "author_html": field("Artist"),
            "credit_html": field("Credit"), "description_html": field("ImageDescription"),
            "license": field("LicenseShortName"), "license_url": field("LicenseUrl"),
            "attribution_required": field("AttributionRequired"), "sha256": hashlib.sha256(raw).hexdigest(),
            "bytes": len(raw), "alterations": "none", "downloaded_at": "2026-11-07"}

records = [download(item) for item in FILES.items()]
url = "https://janefonda.com/wp-content/uploads/2009/05/mugweb.jpg"
raw = request(url).read()
path = DEST / "q09-100.jpg"
path.write_bytes(raw)
records.append({"id": "q09-100", "path": path.relative_to(ROOT).as_posix(), "source_url": "https://janefonda.com/2009/05/mug-shot/",
                "download_url": url, "title": "Jane Fonda, Cleveland mugshot, 1970", "author_html": "Police photograph; reproduced on Jane Fonda's official website",
                "credit_html": "Jane Fonda official website", "description_html": "The subject identifies this as her actual Cleveland Jail mugshot.",
                "license": "Not specified on source page; local research copy", "license_url": "", "attribution_required": "unknown",
                "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw), "alterations": "none", "downloaded_at": "2026-11-07",
                "publication_review": "Confirm reuse rights or replace before public publication; private preparation copy only."})
(ROOT / "assets" / "image_sources.json").write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
from PIL import Image
for record in records:
    with Image.open(ROOT / record["path"]) as im:
        im.verify()
    with Image.open(ROOT / record["path"]) as im:
        print(record["id"], im.size, record["license"], record["bytes"])
