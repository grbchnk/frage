"""Download licensed photo originals for the user-requested editorial revision."""
from pathlib import Path
import urllib.request, urllib.parse, json, hashlib, time
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
FILES={
 'edible-romanesco':'File:Fractal Broccoli.jpg',
 'edible-soap':'File:Bars of pure Marseille and Aleppo soap, 2024.jpg',
 'edible-pitaya':'File:Pitaya fruit cut in half.jpg',
 'edible-silica':'File:White Silica Gel.jpg',
 'edible-model':'File:Wax- cake model Japan1550.jpg',
 'forest-birch':'File:Betula pendula Finland.jpg',
 'forest-chanterelle':'File:Chanterelle Cantharellus cibarius.jpg',
 'animal-bullfinch':'File:Bullfinch male.jpg',
 'animal-raccoon':'File:Raccoon in Central Park (35264).jpg',
 'animal-toucan':'File:006 Toco toucan in Encontro das Águas State Park Photo by Giles Laurent.jpg',
 'rebus-ball':'File:Viennese Opera Ball New York 2017 .jpg',
 'rebus-horse':'File:Horse December 2014-1.jpg',
 'rebus-cat':'File:Cat November 2010-1a.jpg',
 'rebus-summer':'File:Rügen, Beach at Sellin -- 2009 -- 1173.jpg',
 'rebus-person':'File:Portrait of Paul Trappen.jpg',
 'rebus-house':'File:Big single-family home 2.jpg',
 'rebus-spider':'File:Araneus diadematus MHNT Femelle Fronton.jpg',
 'rebus-shush':'File:Eduardo Borges - Brazil.jpg',
 'rebus-lambs':'File:Lambs feeding.jpg',
 'rebus-future':'File:Dubai skyline 2015.jpg',
 'rebus-rain':'File:Hard rain on a roof.jpg',
}
def request(url):
 return urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'AlinaHomeQuiz/1.0 (private educational trivia; Wikimedia attribution recorded)'}),timeout=60)
params={'action':'query','format':'json','titles':'|'.join(FILES.values()),'prop':'imageinfo','iiprop':'url|extmetadata','iiurlwidth':1280}
cache=ROOT/'research/revision-thumb-metadata.json'
if cache.exists():data=json.loads(cache.read_text(encoding='utf8'))
else:
 data=json.load(request('https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode(params)))
 cache.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')
pages={p['title']:p for p in data['query']['pages'].values()}
records={r['id']:r for r in json.loads((ROOT/'assets/image_sources.json').read_text(encoding='utf8'))}
for aid,title in FILES.items():
 page=pages.get(title,{})
 if not page.get('imageinfo'):print('MISSING',aid,title,flush=True);continue
 info=page['imageinfo'][0];meta=info.get('extmetadata',{});url=info.get('thumburl',info['url'])
 ext=Path(urllib.parse.unquote(urllib.parse.urlparse(url).path)).suffix.lower()
 dest=ROOT/'assets/images'/f'{aid}{ext}'
 if not dest.exists():
  try:
   with request(url) as response:dest.write_bytes(response.read())
  except Exception as error:
   print('DOWNLOAD FAILED',aid,str(error),flush=True);continue
  time.sleep(2)
 with Image.open(dest) as im:size=im.size;im.verify()
 raw=dest.read_bytes();field=lambda key:meta.get(key,{}).get('value','')
 records[aid]={'id':aid,'path':dest.relative_to(ROOT).as_posix(),'source_url':info['descriptionurl'],'download_url':url,'title':title,
  'author_html':field('Artist'),'credit_html':field('Credit'),'description_html':field('ImageDescription'),
  'license':field('LicenseShortName'),'license_url':field('LicenseUrl'),'attribution_required':field('AttributionRequired'),
  'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'alterations':'Wikimedia thumbnail when original unavailable; no creative edits','downloaded_at':'2026-11-07','used_in_current_pack':False}
 (ROOT/'assets/image_sources.json').write_text(json.dumps(list(records.values()),ensure_ascii=False,indent=2)+'\n',encoding='utf8')
 print(aid,size,field('LicenseShortName'),flush=True)
