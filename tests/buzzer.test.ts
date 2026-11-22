import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
import {initialGame,transition} from '../src/engine';
import type {Buzzer,Participant,Pack,Snapshot} from '../src/types';

it('гости входят по имени; только одно нажатие выигрывает; неверный ответ, старые окна, возврат и сброс',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;
   create schema auth;create table auth.users(id uuid primary key,email text);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
   insert into auth.users values('00000000-0000-0000-0000-000000000001','host@test.local');`);
  const setup=readFileSync('supabase/setup.sql','utf8');await db.exec(setup);await db.exec(setup);
  await db.exec(`insert into public.quiz_hosts values('00000000-0000-0000-0000-000000000001');set role anon;`);
  const a=(await db.query<Participant>(`select * from public.quiz_join(' Антон ')`)).rows[0];
  const b=(await db.query<Participant>(`select * from public.quiz_join('Оля')`)).rows[0];
  expect(a.name).toBe('Антон');
  expect((await db.query<Participant>(`select * from public.quiz_join('антон')`)).rows[0].id).toBe(a.id);
  await expect(db.query(`select * from public.quiz_join(' ')`)).rejects.toThrow();
  await expect(db.query(`update public.quiz_buzzer set accepting=true`)).rejects.toThrow();
  await expect(db.query(`select * from public.quiz_rearm(gen_random_uuid(),0)`)).rejects.toThrow();
  const pack:Pack=JSON.parse(readFileSync('quiz-pack.json','utf8'));
  let state=transition(initialGame(),{type:'start',names:[a.name,b.name],participants:[a,b],limit:5},pack);
  const save=async()=>{
   const rev=(await db.query<{revision:number}>('select revision from public.quiz_game')).rows[0].revision;
   return db.query('select * from public.quiz_save($1,$2::jsonb,null)',[rev,JSON.stringify(state)]);
  };
  await save();
  expect((await db.query<Participant>(`select * from public.quiz_join('Антон')`)).rows[0].id).toBe(a.id);
  await expect(db.query(`select * from public.quiz_join('Новый')`)).rejects.toThrow();
  const q=pack.categories.find(c=>c.id===state.categoryIds[0])!.questions[0];
  state=transition(state,{type:'open',id:q.id},pack,1000);await save();
  const window=(await db.query<Buzzer>(`select * from public.quiz_buzzer`)).rows[0].window_id;
  const claims=await Promise.all([a.id,b.id].map(id=>db.query<Buzzer>(`select * from public.quiz_buzz($1,$2::uuid)`,[id,window])));
  const first=claims[0].rows[0].claimant!;
  expect(claims.map(c=>c.rows[0].claimant)).toEqual([first,first]);
  await expect(db.query(`select * from public.quiz_buzz('outsider',$1::uuid)`,[window])).rejects.toThrow();
  const rev=(await db.query<{revision:number}>(`select revision from public.quiz_game`)).rows[0].revision;
  const beforeWrong=structuredClone(state),beforeBuzzer=(await db.query<Buzzer>(`select * from public.quiz_buzzer`)).rows[0];
  const penalize=async(windowId:string,revision:number)=>
   (await db.query<{result:{buzzer:Buzzer;snapshot:Snapshot}}>('select public.quiz_rearm($1::uuid,$2) as result',[windowId,revision])).rows[0].result;
  let result=await penalize(window,rev);
  expect(result.snapshot.state.players.find(p=>p.id===first)!.score).toBe(-q.value/2);
  expect(result.snapshot.state.feedback).toMatchObject({kind:'wrong',playerId:first});
  expect(result.snapshot.revision).toBe(rev+1);
  expect(result.buzzer.window_id).not.toBe(window);expect(result.buzzer.excluded).toEqual([]);
  await expect(penalize(window,rev)).rejects.toThrow();
  const next=result.buzzer;
  const other=first===a.id?b.id:a.id;
  expect((await db.query<Buzzer>('select * from public.quiz_buzz($1,$2::uuid)',[other,window])).rows[0].claimant).toBeNull();
  for(let i=0;i<2;i++){
   const id=result.buzzer.window_id;
   expect((await db.query<Buzzer>('select * from public.quiz_buzz($1,$2::uuid)',[first,id])).rows[0].claimant).toBe(first);
   result=await penalize(id,result.snapshot.revision);
  }
  const finalWindow=result.buzzer.window_id;
  state=result.snapshot.state;
  expect(state.scoreChanges[first]).toBe(-q.value*1.5);
  await db.query('select * from public.quiz_buzz($1,$2::uuid)',[first,finalWindow]);
  const judged=transition(state,{type:'correct',playerId:first,answer:{answer:'Верно',explanation:'',accepted_answers:[],host_note:''}},pack);
  await expect(db.query('select public.quiz_save($1,$2::jsonb,$3::uuid)',[result.snapshot.revision,JSON.stringify(judged),window])).rejects.toThrow();
  const settled=(await db.query<Snapshot>('select * from public.quiz_save($1,$2::jsonb,$3::uuid)',[result.snapshot.revision,JSON.stringify(judged),finalWindow])).rows[0];
  expect(settled.state.scoreChanges[first]).toBe(-q.value/2);
  expect(settled.state.players.find(p=>p.id===first)!.score).toBe(-q.value/2);
  await db.query('select public.quiz_restore($1,$2::jsonb,$3::jsonb)',[settled.revision,JSON.stringify({...beforeWrong,event:settled.state.event+1}),JSON.stringify(beforeBuzzer)]);
  const restored=(await db.query<Buzzer>(`select * from public.quiz_buzzer`)).rows[0];
  expect(restored.claimant).toBe(first);expect(restored.excluded).toEqual([]);expect(restored.accepting).toBe(false);expect(restored.window_id).not.toBe(window);
  expect((await db.query<{state:typeof state}>(`select state from public.quiz_game`)).rows[0].state.players.find(p=>p.id===first)!.score).toBe(0);
  state=transition(beforeWrong,{type:'cancel'},pack);await save();
  await expect(db.query(`select * from public.quiz_buzz($1,$2::uuid)`,[a.id,next.window_id])).rejects.toThrow();
  state=transition(state,{type:'open',id:q.id},pack,2000);await save();
  const reopened=(await db.query<Buzzer>(`select * from public.quiz_buzzer`)).rows[0];
  expect(reopened.accepting).toBe(true);expect(reopened.claimant).toBeNull();expect(reopened.excluded).toEqual([]);
  expect(reopened.window_id).not.toBe(window);
  state=transition(state,{type:'reset'},pack);await save();
  expect((await db.query(`select * from public.quiz_participants`)).rows).toHaveLength(0);
  expect((await db.query<Buzzer>(`select * from public.quiz_buzzer`)).rows[0].accepting).toBe(false);
 }finally{await db.close();}
},30000);
