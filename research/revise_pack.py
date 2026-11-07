"""Apply the host's November 7 editorial notes to the canonical question bank."""
from pathlib import Path
import json, copy
ROOT=Path(__file__).resolve().parents[1]
path=ROOT/'quiz-pack.json';pack=json.loads(path.read_text(encoding='utf8'))
if pack.get('version')=='3.0-host-revision':raise SystemExit('Revision already applied; edit quiz-pack.json directly for further changes.')
cats={c['id']:c for c in pack['categories']}
qs={q['id']:q for c in pack['categories'] for q in c['questions']}
records={r['id']:r for r in json.loads((ROOT/'assets/image_sources.json').read_text(encoding='utf8'))}
def source(sid,title,url):pack['sources'][sid]={'title':title,'url':url,'checked_at':'2026-11-07'}
def edit(qid,prompt,answer=None,accepted=None,explanation=None,sources=None):
 q=qs[qid];q['prompt']=prompt
 if answer is not None:q['answer']=answer;q['accepted_answers']=accepted or [answer]
 if explanation is not None:q['explanation']=explanation
 if sources:q['source_ids']=sources
 return q
def photo(aid):
 r=records[aid];source(aid,r['title'],r['source_url'])
 return {'kind':'image','path':r['path'],'source_id':aid,'question_alt':'Фотография к вопросу','question_crop_normalized':None,'reveal':'full_original'}
def panel(aid,**extra):
 r=records[aid];source(aid,r['title'],r['source_url'])
 return {'path':r['path'],'source_id':aid,**extra}
def rebus(qid,panels,tokens=None):
 q=qs[qid];q['prompt']='Решите ребус';q['media']={'kind':'photo_rebus','panels':panels,'tokens':tokens or [],'question_alt':'Фоторебус'};q['source_ids']=[p['source_id'] for p in panels]+['own'];q['time_seconds']=30

source('meme-fine','KC Green — On Fire','https://gunshowcomic.com/648')
source('nasa-flame','NASA: Candle Flame — 1g vs Microgravity','https://www.nasa.gov/image-article/candle-flame-1g-vs-microgravity/')
source('air-guitar','Air Guitar World Championships — Oulu, Finland','https://airguitarworldchampionships.com/en/entry/')
source('cheese-race','Cotswold Way — Cooper’s Hill','https://cotswoldway.org/the-way/sights/coopers-hill')
source('cambridge-magazine','Cambridge Dictionary: magazine','https://dictionary.cambridge.org/dictionary/english/magazine')
source('cambridge-pain','Cambridge Dictionary: pain (French → English)','https://dictionary.cambridge.org/dictionary/french-english/pain')
source('cambridge-latte','Cambridge Dictionary: latte (Italian → English)','https://dictionary.cambridge.org/dictionary/italian-english/latte')
source('sobchak-andrey','Осторожно: Собчак — Андрей Григорьев-Апполонов (All Right)','https://www.youtube.com/watch?v=T0SvIFRHjUo')
source('mario','Nintendo — Mario','https://www.nintendo.com/en-gb/Games/Characters-hub/Super-Mario-Hub/Characters-2493286.html')
source('creeper','Minecraft — Meet the Creeper','https://www.minecraft.net/en-us/article/meet-creeper')
source('gta','Rockstar Games — Grand Theft Auto V','https://www.rockstargames.com/gta-v')
source('cs2','Valve — Counter-Strike 2','https://www.counter-strike.net/cs2')
source('portal','Valve — Portal 2','https://store.steampowered.com/app/620/Portal_2/')
source('popcorn','Popcorn Board — What makes popcorn pop?','https://www.popcorn.org/Popcorn-101/What-Makes-Popcorn-Pop')
source('marzipan','Dr. Oetker — Marzipan','https://www.oetker.de/produkte/p/marzipan-rohmasse')
source('tkemali','Tkemali — спецификация географического указания','https://assets.publishing.service.gov.uk/media/6437e6b5f3e62c001361a607/15_Tkemali_%E1%83%A2%E1%83%A7%E1%83%94%E1%83%9B%E1%83%90%E1%83%9A%E1%83%98_Other_products_of_Annex_I_of_the_Treaty__spices_etc___PGI_.pdf')
source('own-food','Кулинарный вопрос для домашней игры','')

edit('q01-100','Что говорит собака из мема, сидя в горящей комнате?','This is fine',['This is fine','Всё нормально','Всё хорошо','Всё в порядке'],'Фраза из комикса KC Green «On Fire», ставшая мемом. Английский не обязателен.',['meme-fine'])
edit('q01-400','Назовите исполнителя: «Фа ватафа пепе шнейне».')
edit('q02-100','Какой транспорт изображён на гербе Осиповичей?')
edit('q02-200','На какой реке стоят Осиповичи?')
edit('q04-100','Классическая каска американского пожарного XIX века: назовите основной материал.')
edit('q04-200','Каких животных сопровождали далматины при пожарных командах XIX века?')
edit('q04-300','Назовите назначение этой стеклянной «гранаты».')
edit('q04-500','Какую форму принимает пламя свечи в невесомости?','Шара',['Шар','Шарообразную','Сферическую','Сфера','Круглую'],'Без обычной конвекции пламя в микрогравитации становится примерно сферическим.',['nasa-flame'])

cats[5]['title']='Серии вместо сна'
edit('q05-200','Идеальный пригород: соседские секреты, измены и убийства. Улица Вистерия-Лейн.')
edit('q05-300','Школьница влюбляется в вампира. Затем в любовный треугольник вмешивается его брат.')
for c in [cats[5],cats[14]]:
 for q in c['questions']:
  for suffix in [' Назовите сериал.',' Что за сериал?',' Назовите фильм.',' Что за фильм?',' Назовите мультфильм.']:
   q['prompt']=q['prompt'].replace(suffix,'')
edit('q06-200','Каких птиц Скиннер обучал наведению ракет?')
edit('q06-300','Учёные покрасили коров под зебр. От каких насекомых их хотели защитить?','От мух',['Мухи','От мух','Кусающие мухи','Слепни'],'Шнобелевская премия 2025 года за исследование 2019 года: чёрно-белые полосы уменьшали атаки кусающих мух.',['ig'])
edit('q06-500','Кого изучали норвежские исследователи, переодевшись белыми медведями?')
edit('q07-100','Чем кидаются участники массовой уличной битвы в испанском Буньоле?')
edit('q07-500','В какой стране проводят чемпионат мира по игре на воображаемой гитаре?','В Финляндии',['Финляндия','В Финляндии'],'Чемпионат Air Guitar World Championships проходит в Оулу.',['air-guitar'])

# Move the moustache cup away from the 100-point cell.
originals=[copy.deepcopy(q) for q in cats[8]['questions']]
for i,old_index in enumerate([1,2,0,3,4]):
 q=copy.deepcopy(originals[old_index]);q['id']=f'q08-{(i+1)*100}';q['value']=(i+1)*100
 cats[8]['questions'][i]=q;qs[q['id']]=q
edit('q08-100','Какую вещь ремонтировали с помощью этого предмета?')
edit('q08-200','Какой продукт раскалывали этими щипцами?')
edit('q08-300','Что спасает эта керамическая полочка?')
edit('q08-500','Для подачи какого овоща нужны эти щипцы?')
cats[9]['title']='Прикрыли как смогли'
edit('q10-100','Чего нет в продукте с надписью «NO PRESERVATIVES»?')
edit('q10-200','Что англичанин читает, когда берёт magazine?','Журнал',['Журнал'],'Magazine по-английски — журнал.',['cambridge-magazine'])
edit('q10-300','Что означает немецкое слово Gift?')
edit('q10-400','Француз просит un pain. Что ему принести?','Хлеб',['Хлеб','Батон','Булку'],'Французское pain означает хлеб.',['cambridge-pain'])
edit('q10-500','Что принесут в Италии, если заказать просто latte?','Молоко',['Молоко'],'По-итальянски latte — молоко. Кофе с молоком — caffè latte.',['cambridge-latte'])

edit('q11-100','Назовите гриб.')
edit('q11-200','Назовите гриб.')
qs['q11-200']['accepted_answers']=list(dict.fromkeys(qs['q11-200']['accepted_answers']+['Боровик']))
edit('q11-300','Назовите растение.')
for qid,aid,prompt,answer,accepted in [
 ('q11-400','forest-birch','Назовите дерево.','Берёза',['Берёза','Береза']),
 ('q11-500','forest-chanterelle','Назовите гриб.','Лисичка',['Лисичка','Лисички','Лисичка обыкновенная']),
 ('q12-300','animal-bullfinch','Назовите птицу.','Снегирь',['Снегирь','Обыкновенный снегирь']),
 ('q12-400','animal-raccoon','Назовите животное.','Енот',['Енот','Енот-полоскун']),
 ('q12-500','animal-toucan','Назовите птицу.','Тукан',['Тукан','Большой тукан','Токо'])]:
 q=edit(qid,prompt,answer,accepted,'На фотографии — '+answer.lower()+'.',[aid]);q['media']=photo(aid);q['host_note']='Принимается обычное название; точный вид и латинское название не нужны.'
edit('q12-100','Назовите животное.')
edit('q12-200','Назовите птицу.')
edit('q13-400','За какой едой бегут вниз с холма участники гонки на Куперс-Хилл?','За сыром',['Сыр','За сыром','Головка сыра'],'Участники бегут за круглой головкой сыра Double Gloucester.',['cheese-race'])
edit('q16-300','В каком городе Серёжа снимал свой европейский видеоблог?')
edit('q16-500','Как зовут бывшего партнёра Серёжи, известного как All Right?','Андрей',['Андрей','Андрей All Right','Андрей Григорьев-Апполонов'],'Андрей Григорьев-Апполонов выступает под именем All Right. Фамилия не обязательна.',['sobchak-andrey'])

cats[15]['title']='Мам, это не пауза'
cats[15]['description']='Знакомые видеоигры: короткие вопросы без знания редкого лора.'
gaming=[
 ('Как зовут усатого героя Nintendo в красной кепке?','Марио',['Марио','Mario'],'mario','Марио — герой серии игр Nintendo.'),
 ('Как называется зелёный моб Minecraft, который подкрадывается и взрывается?','Крипер',['Крипер','Creeper'],'creeper','Зелёный взрывающийся моб — крипер.'),
 ('Как называется серия игр про угон машин с аббревиатурой GTA?','Grand Theft Auto',['Grand Theft Auto','Гранд Зефт Авто','Гранд Тефт Авто'],'gta','Принимается узнаваемое произношение полного названия.'),
 ('Какой шутер называют «контрой»?','Counter-Strike',['Counter-Strike','Counter Strike','CS','КС','Контр-Страйк','Контра','CS:GO','CS2'],'cs2','Принимается любая версия Counter-Strike, включая CS:GO и CS2.'),
 ('Как называется игра, в которой головоломки решают с помощью синего и оранжевого порталов?','Portal',['Portal','Portal 2','Портал','Портал 2'],'portal','Принимается Portal или Portal 2.')]
for i,(prompt,answer,accepted,sid,explanation) in enumerate(gaming):
 q=edit(f'q15-{(i+1)*100}',prompt,answer,accepted,explanation,[sid]);q['media']=None;q['host_note']='';q['time_seconds']=15
edit('q17-200','Из чего делают попкорн?','Из кукурузы',['Кукуруза','Из кукурузы'],'Попкорн делают из специальных сортов кукурузы.',['popcorn'])
edit('q17-300','Какой ингредиент окрашивает салат «Сельдь под шубой» в розовый?','Свёкла',['Свёкла','Свекла'],'Красно-розовый цвет даёт свёкла.',['own-food'])
edit('q17-400','Какой орех входит в состав классического марципана?','Миндаль',['Миндаль'],'Основные ингредиенты марципана — миндаль и сахар.',['marzipan'])
edit('q17-500','Из какого фрукта делают грузинский соус ткемали?','Из сливы',['Слива','Из сливы','Алыча','Из алычи'],'Для ткемали используют кислые сливы, в том числе алычу.',['tkemali'])
for qid in ['q17-200','q17-300','q17-400','q17-500']:qs[qid]['host_note']='';qs[qid]['media']=None
edit('q18-100','Каким цветом написано слово?')
edit('q18-400','Куда показывает стрелка?')
for q in cats[19]['questions']:q['prompt']='Решите ребус'
rebus('q19-400',[panel('rebus-ball'),panel('rebus-horse',trim_end=1)])
rebus('q19-500',[panel('rebus-cat'),panel('rebus-summer',replace_letters='О → А')])
qs['q19-400']['explanation']='БАЛ + КОНЬ без последней буквы: БАЛКОН.'
qs['q19-500']['explanation']='КОТ + ЛЕТО; в слове ЛЕТО заменяем О на А: КОТЛЕТА.'
cats[20]['title']='Кино на пальцах'
cats[20]['description']='Названия знакомых фильмов, зашифрованные настоящими фотографиями.'
rebus('q20-100',[panel('rebus-house')],['1'])
rebus('q20-200',[panel('rebus-person'),panel('rebus-spider')])
rebus('q20-300',[panel('rebus-shush'),panel('rebus-lambs')])
rebus('q20-400',[panel('rebus-future')],['←','В'])
rebus('q20-500',[panel('rebus-person'),panel('rebus-rain')])
for q in cats[20]['questions']:q['prompt']='Какой фильм зашифрован?'

cats[3]['title']='Съедобное / несъедобное'
cats[3]['description']='Пять фотографий: определить, еда перед нами или предмет. Ничего пробовать не требуется.'
edible=[
 ('edible-romanesco','Съедобное','Капуста романеско — настоящий овощ.'),
 ('edible-soap','Несъедобное','Это куски марсельского и алеппского мыла.'),
 ('edible-pitaya','Съедобное','Это разрезанная питахайя — драконий фрукт.'),
 ('edible-silica','Несъедобное','Это силикагель — влагопоглотитель, а не конфеты.'),
 ('edible-model','Несъедобное','На фотографии восковой макет торта для витрины.')]
for i,(aid,answer,explanation) in enumerate(edible):
 q=edit(f'q03-{(i+1)*100}','Съедобное или несъедобное?',answer,[answer],explanation,[aid]);q['media']=photo(aid);q['host_note']='Нужно выбрать только «съедобное» или «несъедобное». Название предмета не требуется.';q['time_seconds']=10

for c in pack['categories']:
 for q in c['questions']:
  q['options']=[]
  if q['media']:q['media']['question_alt']='Изображение к вопросу '+q['id']
  assert q['answer'] and all(sid in pack['sources'] for sid in q['source_ids'])
used={sid for c in pack['categories'] for q in c['questions'] if q['media'] for sid in ([q['media']['source_id']] if q['media']['kind']=='image' else [p['source_id'] for p in q['media']['panels']])}
for r in records.values():r['used_in_current_pack']=r['id'] in used
pack['title']='ВИКТОРИНА У АЛИНЫ ДОМА'
pack['version']='3.0-host-revision'
pack['notes']=[
 '20 категорий, два раунда по 10 тем, 100 вопросов. Для короткого вечера доступен режим на 60 вопросов.',
 'Самбо удалено. Вместо него — Съедобное / несъедобное. Вместо Вообще-то, душнила прав — простая категория про видеоигры.',
 'Варианты ответов удалены. Ведущий видит правильный ответ и допустимые формулировки.',
 'Боровик принимается в вопросе про белый гриб. Точное видовое название для остальных природных вопросов не обязательно.',
 'В БАЛКОНЕ, КОТЛЕТЕ и пяти кино-ребусах используются фотографии с указанием авторства. Операторы и буквы — отдельные элементы интерфейса.',
 'Правки контента требуют повторного запуска supabase/setup.sql, чтобы ответы в базе совпадали с вопросами на сайте.'
]
path.write_text(json.dumps(pack,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
(ROOT/'assets/image_sources.json').write_text(json.dumps(list(records.values()),ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('Applied host revision: 20 categories / 100 questions.')
