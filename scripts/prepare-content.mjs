import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import QRCode from 'qrcode';
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
function privateAnswer(q){
  return {answer:q.answer,accepted_answers:q.accepted_answers??[],explanation:q.explanation??'',host_note:q.host_note??'',
    hint:q.hint,correctOption:q.correctOption,target:q.target,correctOrder:q.correctOrder,pack_revision:revision};
}
function validateQuestion(q){
  const options=q.options??[];
  const unique=options.every(option=>typeof option==='string'&&option.trim())&&new Set(options).size===options.length;
  const index=id=>Number.isInteger(id)&&id>=0&&id<options.length;
  if(q.type==='estimate'&&!Number.isFinite(q.target))throw new Error(`${q.id}: expected a numeric target`);
  if(q.type==='turns'||q.type==='choice'){
    if(!unique||!index(q.correctOption)||(q.type==='turns'?options.length!==11:options.length<2||options.length>4))
      throw new Error(`${q.id}: invalid answer options`);
  }
  if(q.type==='order'&&(!unique||options.length<2||q.correctOrder?.length!==options.length||
    !q.correctOrder.every(index)||new Set(q.correctOrder).size!==options.length))throw new Error(`${q.id}: invalid card order`);
}
async function webImage(source){
  if(optimized.has(source))return optimized.get(source);
  const name=`${createHash('sha256').update(await readFile(source)).digest('hex').slice(0,18)}.webp`;
  await sharp(source).rotate().resize({width:1600,height:1200,fit:'inside',withoutEnlargement:true}).webp({quality:88}).toFile(path.join('public/media',name));
  // Old TV browsers may not decode WebP. Keep identical dimensions for masks.
  await sharp(source).rotate().resize({width:1600,height:1200,fit:'inside',withoutEnlargement:true}).flatten({background:'#ffffff'}).jpeg({quality:88}).toFile(path.join('public/media',name.replace(/\.webp$/,'.jpg')));
  const target=`media/${name}`;optimized.set(source,target);return target;
}
for(const c of pack.categories){
  const questions=[];
  for(const q of c.questions){
    validateQuestion(q);
    if(answers[q.id])throw new Error(`Duplicate question ${q.id}`);
    answers[q.id]=privateAnswer(q);
    let media=null;
    if(q.media){
      if(q.media.kind==='photo_rebus'){
        const panels=[];
        for(const p of q.media.panels)panels.push({path:await webImage(p.path),trim_end:p.trim_end,replace_letters:p.replace_letters});
        media={kind:'photo_rebus',panels,tokens:q.media.tokens,joiner:q.media.joiner,question_alt:q.media.question_alt};
      }else media={kind:'image',path:await webImage(q.media.path),question_alt:q.media.question_alt,question_masks_normalized:q.media.question_masks_normalized};
    }
    questions.push({id:q.id,value:q.value,prompt:q.prompt,media,type:q.type,options:q.options?.length?q.options:undefined,unit:q.unit,hasHint:q.hint?true:undefined});
  }
  categories.push({id:c.id,title:c.title,description:c.description,questions});
}
const finals=(pack.finals??[]).map(category=>({
  id:category.id,title:category.title,questions:category.questions.map(q=>{
    if(answers[q.id])throw new Error(`Duplicate question ${q.id}`);
    answers[q.id]={...privateAnswer(q),finalPrompt:q.prompt};
    return {id:q.id};
  })
}));
const tvJoinUrl='https://grbchnk.github.io/frage/?mode=player';
await QRCode.toFile('public/content/tv-join.png',tvJoinUrl,{width:360,margin:4,color:{dark:'#241544',light:'#faf5ff'}});
await writeFile('public/content/questions.json',JSON.stringify({revision,categories,rounds:pack.rounds,finals,tvJoinUrl}));
// Source/credits are published, but no host notes or answer text enter the public pack.
const allSources=JSON.parse(await readFile('assets/image_sources.json','utf8'));
const usedSourceIds=new Set(pack.categories.flatMap(c=>c.questions.flatMap(q=>q.media?(q.media.kind==='photo_rebus'?q.media.panels.map(p=>p.source_id):[q.media.source_id]):[])));
for(const s of allSources)s.used_in_current_pack=usedSourceIds.has(s.id);
await writeFile('assets/image_sources.json',JSON.stringify(allSources,null,2)+'\n');
const credits=allSources.filter(s=>s.used_in_current_pack);
await writeFile('public/content/image-sources.json',JSON.stringify(credits));
const quote=s=>`'${s.replaceAll("'","''")}'`;
const rows=Object.entries(answers).map(([id,data])=>`(${quote(id)},${quote(JSON.stringify(data))}::jsonb)`).join(',\n');
const seed=`-- Repeatable answer update. Does not reset players or the current game.\nbegin;\ninsert into public.quiz_answers(question_id,data) values\n${rows}\non conflict(question_id) do update set data=excluded.data;\ncommit;\nselect 'Готово: ${Object.keys(answers).length} ответов.' as result;\n`;
await writeFile('supabase/update-answers.sql',seed);
await writeFile('supabase/setup.sql',`${await readFile('supabase/schema.sql','utf8')}\n${await readFile('supabase/participants.sql','utf8')}\n${await readFile('supabase/question-formats.sql','utf8')}\n${seed}`);
console.log(`Prepared ${categories.length} categories / ${Object.keys(answers).length} questions. Answer update: supabase/update-answers.sql.`);
await renderEditorial(pack,credits);
