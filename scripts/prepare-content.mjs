import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { renderEditorial } from './render-editorial.mjs';
const pack=JSON.parse(await readFile('quiz-pack.json','utf8'));
const revision=createHash('sha256').update(JSON.stringify(pack)).digest('hex').slice(0,16);
// These are generated output directories. Verify their absolute destinations before cleanup.
for(const relative of ['public/content','public/media']){
  const target=path.resolve(relative),parent=path.resolve('public')+path.sep;
  if(!target.startsWith(parent))throw new Error('Generated output escaped public directory');
  await rm(target,{recursive:true,force:true});await mkdir(target,{recursive:true});
}
await mkdir('supabase',{recursive:true});
const answers={};
const categories=[];
const optimized=new Map();
async function webImage(source){
  if(optimized.has(source))return optimized.get(source);
  const name=`${createHash('sha256').update(await readFile(source)).digest('hex').slice(0,18)}.webp`;
  await sharp(source).rotate().resize({width:1600,height:1200,fit:'inside',withoutEnlargement:true}).webp({quality:88}).toFile(path.join('public/media',name));
  const target=`media/${name}`;optimized.set(source,target);return target;
}
for(const c of pack.categories){
  const questions=[];
  for(const q of c.questions){
    answers[q.id]={answer:q.answer,accepted_answers:q.accepted_answers,explanation:q.explanation,host_note:q.host_note,pack_revision:revision};
    let media=null;
    if(q.media){
      if(q.media.kind==='photo_rebus'){
        const panels=[];
        for(const p of q.media.panels)panels.push({path:await webImage(p.path),trim_end:p.trim_end,replace_letters:p.replace_letters});
        media={kind:'photo_rebus',panels,tokens:q.media.tokens,joiner:q.media.joiner,question_alt:q.media.question_alt};
      }else media={kind:'image',path:await webImage(q.media.path),question_alt:q.media.question_alt,question_masks_normalized:q.media.question_masks_normalized};
    }
    questions.push({id:q.id,value:q.value,prompt:q.prompt,time_seconds:q.time_seconds,media});
  }
  categories.push({id:c.id,title:c.title,description:c.description,questions});
}
await writeFile('public/content/questions.json',JSON.stringify({revision,categories,rounds:pack.rounds}));
// Source/credits are published, but no host notes or answer text enter the public pack.
const allSources=JSON.parse(await readFile('assets/image_sources.json','utf8'));
const usedSourceIds=new Set(pack.categories.flatMap(c=>c.questions.flatMap(q=>q.media?(q.media.kind==='photo_rebus'?q.media.panels.map(p=>p.source_id):[q.media.source_id]):[])));
for(const s of allSources)s.used_in_current_pack=usedSourceIds.has(s.id);
await writeFile('assets/image_sources.json',JSON.stringify(allSources,null,2)+'\n');
const credits=allSources.filter(s=>s.used_in_current_pack);
await writeFile('public/content/image-sources.json',JSON.stringify(credits));
const quote=s=>`'${s.replaceAll("'","''")}'`;
const rows=Object.entries(answers).map(([id,data])=>`(${quote(id)},${quote(JSON.stringify(data))}::jsonb)`).join(',\n');
await writeFile('supabase/setup.sql',`${await readFile('supabase/schema.sql','utf8')}\n-- Private answer seed; repeatable.\nbegin;\ninsert into public.quiz_answers(question_id,data) values\n${rows}\non conflict(question_id) do update set data=excluded.data;\ncommit;\nselect 'Готово: 100 ответов. Теперь добавьте аккаунт ведущего по инструкции README.' as result;\n`);
console.log(`Prepared ${categories.length} categories / ${Object.keys(answers).length} questions. Answers: supabase/setup.sql only.`);
await renderEditorial(pack,credits);
