import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
it('SQL запускается повторно; зритель, посторонний аккаунт и ведущий имеют разные права',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create role anon;create role authenticated;
      create schema auth;create table auth.users(id uuid primary key,email text);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
      insert into auth.users values('00000000-0000-0000-0000-000000000001','host@test.local'),('00000000-0000-0000-0000-000000000002','other@test.local');`);
    const sql=readFileSync('supabase/setup.sql','utf8');
    await db.exec(sql);await db.exec(sql);
    expect((await db.query('select * from public.quiz_answers')).rows).toHaveLength(100);
    const revision=JSON.parse(readFileSync('public/content/questions.json','utf8')).revision;
    const revisions=await db.query<{revision:string}>("select distinct data->>'pack_revision' as revision from public.quiz_answers");
    expect(revisions.rows).toEqual([{revision}]);
    await db.exec(`insert into public.quiz_hosts values('00000000-0000-0000-0000-000000000001');set role anon;`);
    expect((await db.query('select * from public.quiz_game')).rows).toHaveLength(1);
    await expect(db.query('select * from public.quiz_answers')).rejects.toThrow();
    await expect(db.query(`update public.quiz_game set revision=1`)).rejects.toThrow();
    await db.exec(`reset role;set role authenticated;set request.jwt.claim.sub='00000000-0000-0000-0000-000000000002';`);
    expect((await db.query('select * from public.quiz_answers')).rows).toHaveLength(0);
    expect((await db.query('select * from public.quiz_hosts')).rows).toHaveLength(0);
    expect((await db.query('update public.quiz_game set revision=1 returning *')).rows).toHaveLength(0);
    await expect(db.query(`insert into public.quiz_hosts values('00000000-0000-0000-0000-000000000002')`)).rejects.toThrow();
    await db.exec(`set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001';`);
    expect((await db.query('select * from public.quiz_answers')).rows).toHaveLength(100);
    expect((await db.query("update public.quiz_game set revision=1 where id='main' and revision=0 returning *")).rows).toHaveLength(1);
    // A stale second controller cannot overwrite the newer state.
    expect((await db.query("update public.quiz_game set revision=1 where id='main' and revision=0 returning *")).rows).toHaveLength(0);
    await expect(db.query(`delete from public.quiz_game`)).rejects.toThrow();
  }finally{await db.close();}
},30000);
