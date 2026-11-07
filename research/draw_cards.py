"""Create code-native vector rebuses and visual speed tasks. No photo manipulation."""
from pathlib import Path
from html import escape
import json
import hashlib

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/cards';OUT.mkdir(parents=True,exist_ok=True)
INK='#172b3a'; BLUE='#1979c9'; GOLD='#e9b44c'; RED='#df6352'

def text(s,x,y,size=90,color=INK,weight=700):
 return f'<text x="{x}" y="{y}" text-anchor="middle" fill="{color}" font-family="Arial, DejaVu Sans, sans-serif" font-size="{size}" font-weight="{weight}">{escape(s)}</text>'
def group(body,x,y,s=1):return f'<g transform="translate({x} {y}) scale({s})">{body}</g>'
def person(color=BLUE):
 return f'<circle cx="0" cy="-95" r="34" fill="{color}"/><path d="M-45 -45 Q0 -65 45 -45 L38 55 L26 145 L-5 145 L-10 50 L-22 145 L-53 145 L-50 45Z" fill="{color}"/><path d="M-40 -30 L-80 55 M35 -30 L70 50" stroke="{color}" stroke-width="23" stroke-linecap="round"/>'
def cat():
 return f'<path d="M-75 30 Q-105 -40 -70 -105 L-25 -65 Q0 -78 28 -65 L78 -105 L70 -15 Q90 40 55 70 Q0 110 -55 70Z" fill="{GOLD}" stroke="{INK}" stroke-width="7"/><circle cx="-30" cy="-10" r="8" fill="{INK}"/><circle cx="30" cy="-10" r="8" fill="{INK}"/><path d="M-9 16 L9 16 L0 28Z M0 28 L0 45 M-80 10 L-25 22 M25 22 L80 10 M-80 40 L-25 35 M25 35 L80 40" fill="none" stroke="{INK}" stroke-width="5"/>'
def steam():
 return f'<path d="M-90 30 L90 30 L65 110 L-65 110Z" fill="{BLUE}"/><path d="M90 45 C150 20 145 105 70 85" fill="none" stroke="{BLUE}" stroke-width="20"/><path d="M-50 5 C-95 -45 -20 -50 -55 -110 M0 5 C-45 -45 30 -50 -5 -110 M50 5 C5 -45 80 -50 45 -110" fill="none" stroke="{INK}" stroke-width="12" stroke-linecap="round"/>'
def moustache():
 return f'<path d="M0 -10 C-45 -95 -75 80 -155 -20 C-130 100 -25 95 0 40 C25 95 130 100 155 -20 C75 80 45 -95 0 -10Z" fill="{INK}"/>'
def horse():
 return f'<path d="M-85 125 L-75 20 L-105 -15 L-75 -90 L-12 -130 L-15 -75 L30 -108 L55 -55 L85 -35 L85 10 L10 20 L25 125Z" fill="{GOLD}" stroke="{INK}" stroke-width="8" stroke-linejoin="round"/><circle cx="28" cy="-38" r="7" fill="{INK}"/><path d="M-60 -70 L-35 15 L-35 125" fill="none" stroke="{INK}" stroke-width="15"/>'
def dance():
 return group(person(BLUE),-55,0,.8)+group(person(RED),60,-10,.8)+f'<path d="M-135 -130 L-105 -155 M130 -120 L145 -150 M-20 -150 L-20 -180" stroke="{GOLD}" stroke-width="10"/>'
def house():
 return f'<path d="M-145 -30 L0 -165 L145 -30" fill="none" stroke="{INK}" stroke-width="20" stroke-linejoin="round"/><path d="M-110 -30 L-110 140 L110 140 L110 -30Z" fill="{GOLD}" stroke="{INK}" stroke-width="12"/><rect x="-35" y="35" width="70" height="105" fill="#fffaf0"/>'
def spider():
 b=f'<ellipse cx="0" cy="5" rx="55" ry="75" fill="{INK}"/><circle cx="0" cy="-65" r="36" fill="{INK}"/>'
 for sign in [-1,1]:
  for yy,dy in [(-40,-80),(-10,-20),(20,40),(50,100)]:
   b+=f'<path d="M{sign*35} {yy} L{sign*100} {yy+dy/2} L{sign*155} {yy+dy}" fill="none" stroke="{INK}" stroke-width="12" stroke-linecap="round"/>'
 return b
def lamb():
 b=''
 for x,y in [(-55,0),(-20,-25),(20,-28),(55,0),(25,35),(-20,35)]:b+=f'<circle cx="{x}" cy="{y}" r="38" fill="#fff" stroke="{INK}" stroke-width="5"/>'
 return b+f'<path d="M-45 55 L-45 100 M35 55 L35 100" stroke="{INK}" stroke-width="14"/><ellipse cx="80" cy="-4" rx="34" ry="47" fill="{INK}"/><circle cx="88" cy="-20" r="5" fill="#fff"/>'
def mute():
 return f'<path d="M-90 -40 L-45 -40 L15 -95 L15 95 L-45 40 L-90 40Z" fill="{BLUE}"/><path d="M45 -55 L115 55 M115 -55 L45 55" stroke="{RED}" stroke-width="20" stroke-linecap="round"/>'
def future():
 b=''
 for x,h in [(-120,170),(-55,250),(20,190),(95,290)]:
  b+=f'<rect x="{x}" y="{-h+130}" width="52" height="{h}" rx="8" fill="{BLUE}"/>'
  for y in range(-h+150,100,45): b+=f'<rect x="{x+12}" y="{y}" width="10" height="14" fill="#fff"/>'
 b+=f'<ellipse cx="-15" cy="-155" rx="155" ry="24" fill="none" stroke="{GOLD}" stroke-width="10"/>'
 return b
def rain():
 b=f'<path d="M-140 -30 C-170 -85 -95 -130 -60 -100 C-35 -180 75 -160 80 -95 C165 -105 175 -15 120 -5 L-110 -5Z" fill="{BLUE}"/>'
 for x in [-105,-45,15,75,135]: b+=f'<path d="M{x} 35 L{x-28} 105" stroke="{BLUE}" stroke-width="12" stroke-linecap="round"/>'
 return b
def arrow(direction='right'):
 b=f'<path d="M-180 -45 L60 -45 L60 -120 L200 0 L60 120 L60 45 L-180 45Z" fill="{GOLD}" stroke="{INK}" stroke-width="8" stroke-linejoin="round"/>'
 return b if direction=='right' else f'<g transform="scale(-1 1)">{b}</g>'
def hand(missing):
 # Right palm facing the viewer: thumb is on the left; gaps retain finger positions.
 b=f'<rect x="-100" y="-20" width="200" height="210" rx="62" fill="#ebbc98" stroke="{INK}" stroke-width="7"/><rect x="-62" y="150" width="124" height="105" fill="#ebbc98"/>'
 fingers=[('index',-80,-190,48,210),('middle',-27,-235,49,255),('ring',27,-205,47,225),('little',77,-140,43,160)]
 for name,x,y,w,h in fingers:
  if name!=missing:b+=f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="23" fill="#ebbc98" stroke="{INK}" stroke-width="7"/>'
 if missing!='thumb':b+=f'<path d="M-90 95 Q-145 60 -180 -15 Q-195 -60 -160 -67 Q-130 -72 -110 -23 L-65 25" fill="#ebbc98" stroke="{INK}" stroke-width="7" stroke-linecap="round"/>'
 return b

cards={
 'q19-100':text('100',580,510,210)+text('+',850,510,130)+text('Л',1080,510,210),
 'q19-200':group(steam(),530,455,1.3)+text('+',800,495,140)+group(moustache(),1100,465,1.1),
 'q19-300':text('У',800,350,190)+text('ШКА',800,605,170),
 'q19-400':group(dance(),450,485,1.1)+text('+',790,505,130)+group(horse(),1100,455,1.0)+text('Ь',1290,375,100)+f'<path d="M1250 295 L1330 385" stroke="{RED}" stroke-width="8"/>',
 'q19-500':group(cat(),490,450,1.35)+text('+',760,495,130)+text('ЛЕТО',1100,490,150)+text('О → А',1100,645,65,RED),
 'q20-100':group(house(),980,465,1.1)+group(person(),600,485,1.0)+text('1',600,260,90),
 'q20-200':group(person(),500,480,1.0)+text('+',790,505,130)+group(spider(),1110,465,1.0),
 'q20-300':group(mute(),450,465,1.2)+text('+',760,505,130)+group(lamb(),1010,470,1.0)+group(lamb(),1250,500,.75),
 'q20-400':group(arrow('left'),460,470,1.0)+text('+',800,505,130)+group(future(),1120,480,.9),
 'q20-500':group(person(),520,500,1.05)+text('+',790,505,130)+group(rain(),1100,450,1.1),
 'q18-100':text('КРАСНЫЙ',800,520,190,BLUE),
 'q18-200':group(hand('thumb'),800,470,1.0),
 'q18-400':group(arrow(),800,465,1.5)+text('НАЛЕВО',800,490,76),
 'q18-500':group(hand('ring'),800,470,1.0),
}
circles=''
for i in range(9):
 x=480+(i%3)*320;y=290+(i//3)*180
 circles+=f'<circle cx="{x}" cy="{y}" r="62" fill="{BLUE if i%2==0 else GOLD}"/>'
cards['q18-300']=circles
records={a['id']:a for a in json.loads((ROOT/'assets/image_sources.json').read_text(encoding='utf-8'))}
for aid,body in cards.items():
 svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="#fffaf0"/><rect x="35" y="35" width="1530" height="830" rx="35" fill="none" stroke="{INK}" stroke-width="4"/>{text(aid.upper(),150,115,30,BLUE)}{body}</svg>'
 path=OUT/(aid+'.svg');path.write_text(svg,encoding='utf-8')
 records[aid]={'id':aid,'path':f'assets/cards/{aid}.png','vector_path':f'assets/cards/{aid}.svg','source_url':'','download_url':'','title':f'Original visual puzzle {aid}',
 'author_html':'Авторская векторная карточка, подготовленная для этой викторины','credit_html':'Original quiz artwork','description_html':'Code-native vector drawing; no photographs edited.',
 'license':'Original quiz artwork','license_url':'','attribution_required':'false','bytes':len(svg.encode()),'sha256':hashlib.sha256(svg.encode()).hexdigest(),'alterations':'original artwork','downloaded_at':'2026-11-07'}
(ROOT/'assets/image_sources.json').write_text(json.dumps(list(records.values()),ensure_ascii=False,indent=2),encoding='utf-8')
print('15 SVG cards created')
