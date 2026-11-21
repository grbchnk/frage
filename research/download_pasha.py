"""Download new licensed quiz photographs with Wikimedia attribution metadata."""
from pathlib import Path
import urllib.request, urllib.parse, json, hashlib, time, sys
ROOT=Path(__file__).resolve().parents[1]
FILES={
 'pasha-whisk':'File:Kitchen-whisk.jpg',
 'pasha-corkscrew':'File:Corkscrew-01.jpg',
 'pasha-stapler':'File:Stapler.jpg',
 'pasha-clothespin':'File:Wooden clothespin.jpg',
 'pasha-colander':'File:Colander.jpg',
 'pasha-caliper':'File:Messschieber.jpg',
 'pasha-sparkplug':'File:Spark plug.jpg',
 'pasha-bearing':'File:Ball bearing.jpg',
 'pasha-torque':'File:Western Forge Craftsman beam torque wrench.jpg',
 'pasha-ratchet':'File:Socket wrench.jpg',
 'pasha-kalimba':'File:Kalimba Touba Dialaw.jpg',
 'pasha-theremin':'File:Etherwave Theremin Kit.jpg',
 'pasha-cajon':'File:Cajon.jpg',
 'pasha-ocarina':'File:Ocarina.jpg',
 'pasha-accordion':'File:Accordion.jpg',
 'pasha-floppy':'File:Floppy disk 2009 G1.jpg',
 'pasha-pager':'File:Pager.jpg',
 'pasha-cassette':'File:Compact Cassette - Fuji Metal Z 90.JPG',
 'pasha-phone':'File:Rotary dial telephone.jpg',
 'pasha-typewriter':'File:Typewriter.jpg',
 'pasha-golden':'File:Golden Gate Bridge from Fort Point.jpg',
 'pasha-tower':'File:Tower Bridge London Feb 2006.jpg',
 'pasha-rialto':'File:Rialto bridge 2015.jpg',
 'pasha-sydney':'File:Sydney Harbour Bridge from Circular Quay.jpg',
 'pasha-charles':'File:Charles Bridge at night.jpg',
}
FILES.update({
 'pasha-actor-a':'File:Leonardo DiCaprio crop.jpg',
 'pasha-actor-b':'File:Reunião com o ator norte-americano Keanu Reeves (46806576944) (cropped).jpg',
 'pasha-actor-c':'File:Robert Downey Jr 2014 Comic Con (cropped).jpg',
 'pasha-actor-d':'File:Margot Robbie at Somerset House in 2013 (cropped).jpg',
 'pasha-actor-e':'File:Ryan Gosling in 2023.jpg',
 'pasha-rap-a':'File:Bushido Zho 2024.jpg',
 'pasha-rap-b':'File:FRIENDLY THUG 52 NGG.jpg',
 'pasha-rap-c':'File:Madkid 2026.jpg',
 'pasha-rap-d':'File:Тёмный принц 2026.jpg',
 'pasha-rap-e':'File:Whole Lotta Swag на VK Fest 2025 в СПб.jpg',
})

SEARCH={
 'pasha-whisk':'whisk kitchen utensil', 'pasha-corkscrew':'corkscrew tool',
 'pasha-stapler':'stapler stationery', 'pasha-clothespin':'wooden clothespin',
 'pasha-colander':'colander kitchen', 'pasha-caliper':'vernier caliper',
 'pasha-sparkplug':'spark plug', 'pasha-bearing':'ball bearing',
 'pasha-torque':'torque wrench tool', 'pasha-ratchet':'ratchet socket wrench',
 'pasha-kalimba':'kalimba instrument', 'pasha-theremin':'theremin instrument',
 'pasha-cajon':'cajon instrument', 'pasha-ocarina':'ocarina instrument',
 'pasha-accordion':'accordion instrument', 'pasha-floppy':'3.5 floppy disk',
 'pasha-pager':'pager device', 'pasha-cassette':'compact cassette tape',
 'pasha-phone':'rotary dial telephone', 'pasha-typewriter':'typewriter',
 'pasha-golden':'Golden Gate Bridge Fort Point','pasha-tower':'Tower Bridge London',
 'pasha-rialto':'Rialto Bridge Venice','pasha-sydney':'Sydney Harbour Bridge',
 'pasha-charles':'Charles Bridge Prague',
}
SEARCH.update({'pasha-actor-e':'Ryan Gosling portrait'})

def fetch(url):
 return urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'PashaCinemaQuiz/1.0 (educational trivia; attribution recorded)'}),timeout=35)
def api(params):
 return json.load(fetch('https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode({'action':'query','format':'json','requestid':str(time.time_ns()),**params})))
if len(sys.argv)>1:
 manifest=json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
 FILES={aid:spec['title'] for aid,spec in manifest.items()}
 SEARCH.update({aid:spec.get('search',spec['title'].replace('File:','')) for aid,spec in manifest.items()})
records={r['id']:r for r in json.loads((ROOT/'assets/image_sources.json').read_text(encoding='utf-8'))}
for aid,title in FILES.items():
 if aid in records and (ROOT/records[aid]['path']).exists() and (aid not in ['pasha-torque','pasha-cassette','pasha-actor-d','more-art-e'] or records[aid]['title']==title):continue
 try:
  common={'prop':'imageinfo','iiprop':'url|extmetadata','iiurlwidth':960}
  pages=api({'titles':title,**common})['query']['pages']
  page=next((p for p in pages.values() if p.get('imageinfo')),None)
  if not page:
   pages=api({'generator':'search','gsrsearch':SEARCH[aid]+' filetype:bitmap','gsrnamespace':6,'gsrlimit':5,**common})['query']['pages']
   candidates=sorted(pages.values(),key=lambda p:p.get('index',99))
   page=next(p for p in candidates if p.get('imageinfo') and p['imageinfo'][0].get('extmetadata',{}).get('LicenseShortName',{}).get('value','').startswith(('CC','Public domain')))
  info=page['imageinfo'][0];meta=info.get('extmetadata',{});url=info.get('thumburl',info['url'])
  url=url.split('?')[0]
  try: raw=fetch(url).read()
  except Exception:
   url=info['url'].split('?')[0]+'?download='+str(time.time_ns());raw=fetch(url).read()
  ext=Path(urllib.parse.unquote(urllib.parse.urlparse(url).path)).suffix.lower()
  dest=ROOT/'assets/images'/f'{aid}{ext}';dest.write_bytes(raw)
  val=lambda k:meta.get(k,{}).get('value','')
  records[aid]={'id':aid,'path':dest.relative_to(ROOT).as_posix(),'source_url':info['descriptionurl'],'download_url':url,'title':page['title'],'author_html':val('Artist'),'license':val('LicenseShortName'),'license_url':val('LicenseUrl'),'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'downloaded_at':'2026-11-21','used_in_current_pack':False}
  (ROOT/'assets/image_sources.json').write_text(json.dumps(list(records.values()),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
  print(aid,page['title'].encode('ascii','replace').decode(),val('LicenseShortName'),flush=True)
  time.sleep(8)
 except Exception as e:
  print('FAILED',aid,str(e),flush=True)
  if '429' in str(e):time.sleep(15)
