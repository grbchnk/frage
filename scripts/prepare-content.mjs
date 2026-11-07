import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const pack=JSON.parse(await readFile('quiz-pack.json','utf8'));
await mkdir('public/content',{recursive:true});await mkdir('public/media',{recursive:true});await mkdir('supabase',{recursive:true});
const answers={};
const categories=[];
for(const c of pack.categories){
  const questions=[];
  for(const q of c.questions){
    answers[q.id]={answer:q.answer,accepted_answers:q.accepted_answers,explanation:q.explanation,host_note:q.host_note};
    let media=null;
    if(q.media){
      const name=`${q.id}.webp`;
      await sharp(q.media.path).rotate().resize({width:1600,height:1200,fit:'inside',withoutEnlargement:true}).webp({quality:88}).toFile(path.join('public/media',name));
      media={kind:'image',path:`media/${name}`,question_alt:q.media.question_alt,question_masks_normalized:q.media.question_masks_normalized};
    }
    questions.push({id:q.id,value:q.value,prompt:q.prompt,time_seconds:q.time_seconds,media});
  }
  categories.push({id:c.id,title:c.title,description:c.description,questions});
}
await writeFile('public/content/questions.json',JSON.stringify({categories,rounds:pack.rounds}));
// Source/credits are published, but no host notes or answer text enter the public pack.
const credits=JSON.parse(await readFile('assets/image_sources.json','utf8')).filter(s=>s.used_in_current_pack);
await writeFile('public/content/image-sources.json',JSON.stringify(credits));
const quote=s=>`'${s.replaceAll("'","''")}'`;
const rows=Object.entries(answers).map(([id,data])=>`(${quote(id)},${quote(JSON.stringify(data))}::jsonb)`).join(',\n');
await writeFile('supabase/setup.sql',`${await readFile('supabase/schema.sql','utf8')}\n-- Private answer seed; repeatable.\nbegin;\ninsert into public.quiz_answers(question_id,data) values\n${rows}\non conflict(question_id) do update set data=excluded.data;\ncommit;\nselect 'Готово: 100 ответов. Теперь добавьте аккаунт ведущего по инструкции README.' as result;\n`);
console.log(`Prepared ${categories.length} categories / ${Object.keys(answers).length} questions. Answers: supabase/setup.sql only.`);
