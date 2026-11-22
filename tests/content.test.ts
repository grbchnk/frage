import {readFileSync,existsSync} from 'node:fs';
import {it,expect} from 'vitest';
import type {Pack} from '../src/types';
const pack:Pack=JSON.parse(readFileSync('public/content/questions.json','utf8'));
it('банк содержит 1000 вопросов, включая отдельный финал',()=>{
  expect(pack.categories).toHaveLength(122);
  expect(pack.rounds.map(r=>r.category_ids.length)).toEqual([122]);
  expect(new Set(pack.rounds.flatMap(r=>r.category_ids)).size).toBe(122);
  const questions=pack.categories.flatMap(c=>c.questions);
  expect(questions).toHaveLength(996);expect(new Set(questions.map(q=>q.id)).size).toBe(996);
  expect(pack.categories.every(category=>category.questions.length>=5)).toBe(true);
  expect(pack.categories.find(category=>category.id===5)?.questions).toHaveLength(35);
  expect(pack.finals).toHaveLength(2);
  const finals=pack.finals?.flatMap(category=>category.questions)??[];
  expect(finals).toHaveLength(4);
  expect(new Set([...questions,...finals].map(q=>q.id)).size).toBe(1000);
  const types:Record<string,number>={};
  for(const question of questions){
    const type=question.type??(question.media?'buzzerMedia':'buzzer');
    types[type]=(types[type]??0)+1;
  }
  expect(types)
    .toEqual({buzzer:555,buzzerMedia:84,estimate:98,choice:106,turns:77,order:76});
});
it('публичный пакет не содержит правильных ответов или заметок ведущего',()=>{
  for(const q of pack.categories.flatMap(c=>c.questions)){
    expect(q).not.toHaveProperty('answer');expect(q).not.toHaveProperty('explanation');expect(q).not.toHaveProperty('host_note');expect(q).not.toHaveProperty('accepted_answers');
    for(const field of ['time_seconds','correctOption','correctOrder','target','hint'])expect(q).not.toHaveProperty(field);
  }
  for(const q of pack.finals?.flatMap(category=>category.questions)??[])expect(Object.keys(q)).toEqual(['id']);
});
it('все фото существуют; плашки находятся в пределах изображения',()=>{
  let count=0;
  for(const q of pack.categories.flatMap(c=>c.questions))if(q.media){
    count++;
    if(q.media.kind==='photo_rebus'){
      expect(q.media.panels?.length).toBeGreaterThan(0);
      for(const p of q.media.panels||[])expect(existsSync(`public/${p.path}`)).toBe(true);
    }else expect(existsSync(`public/${q.media.path}`)).toBe(true);
    for(const [x,y,w,h] of q.media.question_masks_normalized||[]){expect(x).toBeGreaterThanOrEqual(0);expect(y).toBeGreaterThanOrEqual(0);expect(w).toBeGreaterThan(0);expect(h).toBeGreaterThan(0);expect(x+w).toBeLessThanOrEqual(1.00001);expect(y+h).toBeLessThanOrEqual(1.00001);}
  }
  expect(count).toBe(105);
});
it('новые рубрики, отсутствие вариантов и фоторебусы соответствуют правкам ведущего',()=>{
  const original=JSON.parse(readFileSync('quiz-pack.json','utf8'));
  const qs=original.categories.flatMap((c:any)=>c.questions);
  expect(original.categories.find((c:any)=>c.id===3).title).toBe('Еда с подвохом');
  expect(qs.filter((q:any)=>!q.type&&q.options?.length)).toHaveLength(0);
  expect(qs.filter((q:any)=>q.id.startsWith('q')&&Number(q.id.slice(1,3))<=20&&!q.id.startsWith('q03-')&&q.id!=='q10-500'&&q.prompt.includes(' или '))).toHaveLength(0);
  expect(qs.find((q:any)=>q.id==='q11-200').accepted_answers).toContain('Боровик');
  expect(qs.filter((q:any)=>q.media?.kind==='photo_rebus')).toHaveLength(7);
  expect(pack.revision).toMatch(/^[a-f0-9]{16}$/);
  expect(original.categories.filter((c:any)=>c.id>20&&c.id<=43)).toHaveLength(23);
  expect(original.categories.find((c:any)=>c.id===27).title).toBe('Малыш на борту');
  expect(original.categories.find((c:any)=>c.id===33).title).toBe('Клюёт только комар');
  expect(original.categories.find((c:any)=>c.id===35).title).toBe('В родзал!');
  expect(original.categories.find((c:any)=>c.id===43).questions.map((q:any)=>q.answer)).toEqual(['3 этажа','5 этажей','7 этажей','9 этажей','18 этажей']);
});
