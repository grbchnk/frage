import {readFileSync,existsSync} from 'node:fs';
import {it,expect} from 'vitest';
import type {Pack} from '../src/types';
const pack:Pack=JSON.parse(readFileSync('public/content/questions.json','utf8'));
it('20 тем и 100 уникальных вопросов, два непересекающихся раунда по 10 тем',()=>{
  expect(pack.categories).toHaveLength(20);
  expect(pack.rounds.map(r=>r.category_ids.length)).toEqual([10,10]);
  expect(new Set(pack.rounds.flatMap(r=>r.category_ids)).size).toBe(20);
  const questions=pack.categories.flatMap(c=>c.questions);
  expect(questions).toHaveLength(100);expect(new Set(questions.map(q=>q.id)).size).toBe(100);
  for(const c of pack.categories)expect(c.questions.map(q=>q.value)).toEqual([100,200,300,400,500]);
});
it('публичный пакет не содержит правильных ответов или заметок ведущего',()=>{
  for(const q of pack.categories.flatMap(c=>c.questions)){
    expect(q).not.toHaveProperty('answer');expect(q).not.toHaveProperty('explanation');expect(q).not.toHaveProperty('host_note');expect(q).not.toHaveProperty('accepted_answers');
    expect(q.time_seconds).toBeGreaterThan(0);
  }
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
  expect(count).toBe(41);
});
it('новые рубрики, отсутствие вариантов и фоторебусы соответствуют правкам ведущего',()=>{
  const original=JSON.parse(readFileSync('quiz-pack.json','utf8'));
  const qs=original.categories.flatMap((c:any)=>c.questions);
  expect(original.categories.find((c:any)=>c.id===3).title).toBe('Съедобное / несъедобное');
  expect(qs.filter((q:any)=>q.options?.length)).toHaveLength(0);
  expect(qs.filter((q:any)=>!q.id.startsWith('q03-')&&q.prompt.includes(' или '))).toHaveLength(0);
  expect(qs.find((q:any)=>q.id==='q11-200').accepted_answers).toContain('Боровик');
  expect(qs.filter((q:any)=>q.media?.kind==='photo_rebus')).toHaveLength(7);
  expect(pack.revision).toMatch(/^[a-f0-9]{16}$/);
});
