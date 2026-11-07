"""Download replacement photo round and two nature rounds; preserve originals."""
from pathlib import Path
import concurrent.futures
import hashlib
import json
import sys
import urllib.request
import urllib.parse
from PIL import Image

sys.stdout.reconfigure(encoding="utf-8")
ROOT=Path(__file__).resolve().parents[1]
dest=ROOT/'assets/images'
files={
 'q09new-100':'File:One wheel motorcycle Goventosa.jpg',
 'q09new-200':'File:WalterRothschildWithZebras.jpg',
 'q09new-300':'File:Evelyn Nesbit.jpg',
 'q09new-400':'File:Salvador Dali A (Dali Atomicus) 09633u.jpg',
 'q09new-500':'File:Piano voor aan bed gebonden zieken - Piano for the bedridden (4192748677).jpg',
 'q11-100':'File:Amanita muscaria tyndrum.jpg',
 'q11-200':'File:(Gemeine Steinpilz) Boletus edulis.jpg',
 'q11-300':'File:Heracleum sosnowskyi Inflorescences.jpg',
 'q11-400':'File:Ginkgo biloba Leaf.jpg',
 'q11-500':'File:Laetiporus sulphureus 2010 G1.jpg',
 'q12-100':'File:Capivara(Hydrochoerus hydrochaeris).jpg',
 'q12-200':'File:008 Eurasian hoopoe eating in Keoladeo National Park Photo by Giles Laurent.jpg',
 'q12-300':'File:Kleiber Sitta europaea-0447.jpg',
 'q12-400':'File:Saiga antelope at the Stepnoi Sanctuary.jpg',
 'q12-500':'File:Balaeniceps rex (Schuhschnabel - Shoebill) - Weltvogelpark Walsrode 2010-10.jpg',
}
def req(u):return urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'FriendsQuizResearch/1.0'}),timeout=45)
p={'action':'query','format':'json','titles':'|'.join(files.values()),'prop':'imageinfo','iiprop':'url|extmetadata','iiurlwidth':1600}
d=json.load(req('https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode(p)))
pages={x['title']:x for x in d['query']['pages'].values()}
old=json.loads((ROOT/'assets/image_sources.json').read_text(encoding='utf-8'))
records={x['id']:x for x in old}
for aid,title in files.items():
 i=pages[title]['imageinfo'][0]; m=i.get('extmetadata',{});u=i['url'].split('?')[0]
 path=dest/(aid+Path(urllib.parse.unquote(urllib.parse.urlparse(u).path)).suffix.lower())
 if path.exists():raw=path.read_bytes()
 else:
  try:raw=req(u).read()
  except Exception:u=i.get('thumburl',i['url']);raw=req(u).read()
  path.write_bytes(raw)
 with Image.open(path) as im: size=im.size;im.verify()
 f=lambda k:m.get(k,{}).get('value','')
 records[aid]={'id':aid,'path':path.relative_to(ROOT).as_posix(),'source_url':i['descriptionurl'],'download_url':u,'title':title,
 'author_html':f('Artist'),'credit_html':f('Credit'),'description_html':f('ImageDescription'),
 'license':f('LicenseShortName'),'license_url':f('LicenseUrl'),'attribution_required':f('AttributionRequired'),
 'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'alterations':'none','downloaded_at':'2026-11-07'}
 print(aid,size,len(raw),f('LicenseShortName'),flush=True)
 (ROOT/'assets/image_sources.json').write_text(json.dumps(list(records.values()),ensure_ascii=False,indent=2),encoding='utf-8')
