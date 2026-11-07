import {writeFile} from 'node:fs/promises';
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const plain=s=>String(s||'').replace(/<[^>]*>/g,'').trim();
export async function renderEditorial(pack,credits){
  const title='ВИКТОРИНА У АЛИНЫ ДОМА';
  const md=[`# ${title}`,'','**Пакет ведущего: здесь раскрыты ответы.**','','20 категорий · 2 раунда · 100 вопросов. В каждой теме 100–500 баллов.','',...pack.notes.map(n=>`- ${n}`),''];
  const style=`body{font:18px/1.5 system-ui,sans-serif;background:#111922;color:#f2f1e9;max-width:1200px;margin:35px auto;padding:0 20px}a{color:#c3f68a}h2{margin-top:55px}article{border:1px solid #34414b;border-radius:12px;padding:24px;margin:20px 0;background:#1a2530}summary{cursor:pointer;color:#c3f68a;font-weight:bold}.image{position:relative;display:inline-block;max-width:100%;line-height:0}.image img{max-width:100%;max-height:550px;width:auto;height:auto}.mask{position:absolute;background:#273f48;display:grid;place-items:center;color:#9bbbbd;font:50px system-ui}.rebus{display:flex;gap:18px;align-items:center;padding:45px 15px 15px;max-width:100%;background:#f4f1e8;color:#172b3a;border-radius:10px}.panel{flex:1;min-width:0;position:relative;text-align:center}.panel img{display:block;width:100%;height:300px;object-fit:contain}.token{font-size:65px;font-weight:700}.op{position:absolute;top:-38px;left:0;right:0;font-weight:bold;font-size:25px}.trim{position:absolute;right:-8px;top:-45px;font-size:60px;font-weight:bold}details{margin-top:20px}small{color:#a5b4c0}nav{columns:2}@media(max-width:650px){.panel img{height:190px}.rebus{gap:8px}.token{font-size:40px}body{font-size:16px}}`;
  const html=[`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — пакет ведущего</title><style>${style}</style><body><h1>${title}</h1><p>Пакет ведущего · 100 вопросов. Здесь есть ответы; игрокам этот документ не показывать.</p><nav>`];
  for(const c of pack.categories)html.push(`<p><a href="#c${c.id}">${esc(c.title)}</a></p>`);
  html.push('</nav>');
  for(const round of pack.rounds){
    md.push(`## Раунд ${round.id}`,'');html.push(`<h2>Раунд ${round.id}</h2>`);
    for(const id of round.category_ids){
      const c=pack.categories.find(c=>c.id===id);md.push(`### ${c.title}`,'');html.push(`<h2 id="c${id}">${esc(c.title)}</h2>`);
      for(const q of c.questions){
        md.push(`#### ${q.value} — ${q.id}`,'',q.prompt,'');html.push(`<article id="${q.id}"><small>${q.value} баллов · ${q.id}</small><h3>${esc(q.prompt)}</h3>`);
        const m=q.media;
        if(m?.kind==='photo_rebus'){
          html.push('<div class="rebus">');
          for(const token of m.tokens||[])html.push(`<span class="token">${esc(token)}</span>`);
          for(const [i,p] of m.panels.entries()){
            if(i)html.push(`<span class="token">${esc(m.joiner||'+')}</span>`);
            html.push(`<div class="panel">${p.replace_letters?`<span class="op">${esc(p.replace_letters)}</span>`:''}${p.trim_end?`<span class="trim">${'’'.repeat(p.trim_end)}</span>`:''}<img loading="lazy" src="${esc(p.path)}" alt="Фотография для ребуса"></div>`);
            md.push(`Фото: [${p.source_id}](${p.path})${p.trim_end?' · убрать последнюю букву':''}${p.replace_letters?` · ${p.replace_letters}`:''}`,'');
          }
          html.push('</div>');
        }else if(m){
          md.push(`Фото: [${m.source_id}](${m.path})`,'');html.push(`<div class="image"><img loading="lazy" src="${esc(m.path)}" alt="Изображение к вопросу">`);
          for(const [x,y,w,h] of m.question_masks_normalized||[])html.push(`<span class="mask" style="left:${x*100}%;top:${y*100}%;width:${w*100}%;height:${h*100}%">?</span>`);
          html.push('</div>');
        }
        md.push(`**Ответ:** ${q.answer}`,'',`**Зачёт:** ${q.accepted_answers.join('; ')}`,'',q.explanation,'');
        html.push(`<details><summary>Ответ и пояснение</summary><h3>${esc(q.answer)}</h3><p>${esc(q.explanation)}</p><p>Зачёт: ${esc(q.accepted_answers.join('; '))}</p>`);
        if(q.host_note){md.push(`Ведущему: ${q.host_note}`,'');html.push(`<p>${esc(q.host_note)}</p>`);}
        if(m?.question_masks_normalized)html.push(`<div class="image"><img loading="lazy" src="${esc(m.path)}" alt="Полный кадр"></div>`);
        for(const sid of q.source_ids){
          const s=pack.sources[sid];if(!s)continue;
          md.push(s.url?`Источник: [${s.title}](${s.url})`:`Источник: ${s.title}`,'');
          html.push(s.url?`<p><a href="${esc(s.url)}" target="_blank" rel="noreferrer">${esc(s.title)}</a></p>`:`<p>${esc(s.title)}</p>`);
        }
        html.push('</details></article>');
      }
    }
  }
  html.push('</body></html>');
  await writeFile('ВИКТОРИНА_100_ВОПРОСОВ.md',md.join('\n'));
  await writeFile('ПРОСМОТР_ПАКЕТА.html',html.join('\n'));
  const attribution=['# Изображения текущего пакета','',`Используется ${credits.length} файлов. Старые неиспользуемые фото не включаются в сайт.`,'','Веб-копии уменьшены и перекодированы. Фото в ребусах показываются отдельными элементами интерфейса; буквы, знаки и плашки не изменяют исходники.',''];
  for(const r of credits)attribution.push(`## ${r.id}`,'',`Файл: ${r.path}`,'',`Источник: [${r.title}](${r.source_url||''})`,'',`Автор: ${plain(r.author_html)}`,'',`Лицензия: ${r.license}${r.license_url?` — ${r.license_url}`:''}`,'');
  await writeFile('assets/ИСТОЧНИКИ_ИЗОБРАЖЕНИЙ.md',attribution.join('\n'));
}
