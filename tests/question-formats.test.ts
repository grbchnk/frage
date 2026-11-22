import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {available,initialGame,roundCategories,transition} from '../src/engine';
import {drawQuestions,filterCategories,hasEnoughQuestions,openInputRound,scoreGroup} from '../src/rounds';
import type {Answer,Game,Pack} from '../src/types';

const pack:Pack=JSON.parse(readFileSync('public/content/questions.json','utf8'));
const players=[{id:'a',name:'Аня',score:140},{id:'b',name:'Ваня',score:50},{id:'c',name:'Лера',score:370},{id:'d',name:'Саша',score:250}];
const answer:Answer={answer:'50',explanation:'',accepted_answers:[],host_note:'',target:50};
const base:Game={...initialGame(),phase:'board',players,turnIndex:1};

it('выбирает пять вопросов после фильтра, назначает стоимость слота и сохраняет порядок',()=>{
  const filtered=filterCategories(pack.categories,['estimate']);
  expect(filtered.filter(hasEnoughQuestions).map(category=>category.id)).toEqual(expect.arrayContaining([43,76]));
  const category=filtered.find(item=>item.id===76)!;
  const pool={...category,questions:category.questions.filter(q=>q.value!==100)};
  const ids=drawQuestions([pool],[76],()=>.99);
  expect(ids).toHaveLength(5);
  expect(new Set(ids).size).toBe(5);
  expect(ids.map(id=>category.questions.find(q=>q.id===id)?.value)).toEqual([200,300,300,400,500]);
  const state=transition(initialGame(),{type:'start',names:['Аня','Ваня'],limit:5,categoryIds:[76],selectedQuestions:ids},pack);
  const board=roundCategories(pack,JSON.parse(JSON.stringify(state)))[0];
  expect(board.questions.map(q=>q.id)).toEqual(ids);
  expect(board.questions.map(q=>q.value)).toEqual([100,200,300,400,500]);
  expect(available(pack,state,'q76-100')).toBe(false);
  const opened=transition(state,{type:'open',id:ids[0],answer},pack);
  expect(opened.activeQuestionValue).toBe(100);
  const scored=transition({...opened,inputRound:{...opened.inputRound!,closed:true,submitted:['p1','p2']}},
    {type:'scoreRound',inputs:{p1:50,p2:90},answer},pack);
  expect(scored.scoreChanges).toEqual({p1:100,p2:-50});
  const photo=filterCategories(pack.categories,['buzzerMedia']).flatMap(item=>item.questions);
  expect(photo.length).toBeGreaterThan(0);
  expect(photo.every(q=>q.media&&(!q.type||q.type==='buzzer'))).toBe(true);
  expect(filterCategories(pack.categories,['buzzer']).flatMap(item=>item.questions).every(q=>!q.media)).toBe(true);
});

it('в очереди первым отвечает выбиравший, остальные по счёту, у последнего остаются два варианта',()=>{
  const question=pack.categories.find(category=>category.id===77)!.questions[0];
  const correct={...answer,correctOption:5};
  const round=openInputRound(question,correct,base,'turn-round',()=>.3)!;
  expect(round.queue).toEqual(['b','c','d','a']);
  expect(round.options).toHaveLength(5);
  expect(round.options?.filter(option=>option.id===5)).toHaveLength(1);
  let state=transition({...base,categoryIds:[77]},{type:'open',id:question.id,answer:correct,roundId:'turn-round'},pack);
  for(let index=0;index<4;index++){
    const active=state.inputRound!;
    const id=active.queue![index];
    const remaining=active.options!.filter(option=>!active.eliminated?.includes(option.id));
    expect(remaining).toHaveLength(5-index);
    const choice=index===3?5:remaining.find(option=>option.id!==5)!.id;
    state=transition({...state,inputRound:{...active,submitted:[...active.submitted,id]}},
      {type:'scoreRound',inputs:{[id]:choice},answer:correct},pack);
  }
  expect(state.phase).toBe('answer');
  expect(state.winnerId).toBe('a');
  expect(state.scoreChanges).toEqual({a:100,b:-50,c:-50,d:-50});
});

it('начисляет за близость, варианты и сортировку по заданным ставкам',()=>{
  const estimate={id:'r',stage:'estimate' as const,submitted:[]};
  expect(scoreGroup(estimate,{a:48,b:51,c:90},answer,400).map(row=>row.delta)).toEqual([0,400,-200]);
  expect(scoreGroup(estimate,{a:49,b:51},answer,400).map(row=>row.delta)).toEqual([400,400]);
  const options=[{id:0,label:'A'},{id:1,label:'B'}];
  expect(scoreGroup({id:'c',stage:'choice',submitted:[],options},{a:0,b:1},{...answer,correctOption:0},400).map(row=>row.delta))
    .toEqual([400,-200]);
  expect(scoreGroup({id:'o',stage:'order',submitted:[],options},{a:[0,1],b:[1,0]},{...answer,correctOrder:[0,1]},400).map(row=>row.delta))
    .toEqual([400,-200]);
});

it('таймер заканчивает приём на 25-й секунде и штрафует пропустивших, отключение сохраняет ручной режим',()=>{
  const state={...base,categoryIds:[76],estimateTimer:true};
  const opened=transition(state,{type:'open',id:'q76-100',roundId:'timer'},pack,1000);
  expect(opened.inputRound?.deadline).toBe(26000);
  const withAnswers={...opened,inputRound:{...opened.inputRound!,submitted:['a','b']}};
  expect(()=>transition(withAnswers,{type:'closeInputs',roundId:'timer'},pack,25999)).toThrow();
  const closed=transition(withAnswers,{type:'closeInputs',roundId:'timer'},pack,26000);
  const scored=transition(closed,{type:'scoreRound',inputs:{a:49,b:95},answer},pack,26000);
  expect(scored.scoreChanges).toEqual({a:100,b:-50,c:-50,d:-50});
  expect(scored.results?.filter(item=>item.timedOut).map(item=>item.playerId)).toEqual(['c','d']);
  const replay={...withAnswers,inputRound:{...withAnswers.inputRound,submitted:players.map(player=>player.id)}};
  expect(transition(replay,{type:'closeInputs',roundId:'timer'},pack,2000).inputRound?.closed).toBe(true);
  const unlimited=transition({...state,estimateTimer:false},{type:'open',id:'q76-100',roundId:'unlimited'},pack,1000);
  expect(unlimited.inputRound?.deadline).toBeUndefined();
  const manual=transition(unlimited,{type:'closeInputs',roundId:'unlimited'},pack,1000);
  expect(transition(manual,{type:'scoreRound',inputs:{},answer},pack).scoreChanges).toEqual({});
});

it('финал открывает вопрос после ставок и сохраняет результат ручной проверки',()=>{
  const state=transition({...base,final:{enabled:true}},{type:'endRound'},pack);
  expect(state.final?.chooser).toBe('c');
  expect(()=>transition(state,{type:'chooseFinal',playerId:'a',categoryId:'cinema',roundId:'w'},pack)).toThrow();
  const wager=transition(state,{type:'chooseFinal',playerId:'c',categoryId:'cinema',roundId:'w'},pack);
  expect(wager.final?.prompt).toBeUndefined();
  const written=transition(wager,{type:'openFinal',questionId:'final-cinema-1',prompt:'Вопрос',roundId:'t'},pack);
  expect(written.final?.prompt).toBe('Вопрос');
  const closed=transition(written,{type:'closeInputs',roundId:'t'},pack);
  const result=transition(closed,{type:'scoreFinal',inputs:{a:'Чак Нолан',b:'Уилсон'},wagers:{a:100,b:50,c:150},correct:['a'],answer},pack);
  expect(result.scoreChanges).toEqual({a:100,b:-50,c:-150,d:0});
  expect(result.final?.stage).toBe('result');
  expect(transition(result,{type:'finishFinal'},pack).phase).toBe('finished');
});

it('SQL принимает только доступный ответ, не публикует введённое значение и сохраняет повторную отправку',async()=>{
  const db=new PGlite();
  try{
    await db.exec("create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as $$ select null::uuid $$;");
    await db.exec(readFileSync('supabase/setup.sql','utf8'));
    const state:Game={...base,phase:'question',activeQuestionId:'q77-100',inputRound:{
      id:'round',stage:'turns',submitted:[],queue:['b','c','d','a'],turn:0,eliminated:[3],options:[{id:2,label:'A'},{id:3,label:'B'},{id:4,label:'C'}],
    }};
    await db.query("update public.quiz_game set state=$1::jsonb where id='main'",[JSON.stringify(state)]);
    await db.exec('set role anon');
    await expect(db.query("select * from public.quiz_submit_input('round','a','2')")).rejects.toThrow();
    await expect(db.query("select * from public.quiz_submit_input('round','b','3')")).rejects.toThrow();
    await expect(db.query("select * from public.quiz_submit_input('another-round','b','2')")).rejects.toThrow();
    await db.query("select * from public.quiz_submit_input('round','b','2')");
    await db.query("select * from public.quiz_submit_input('round','b','4')");
    const result=await db.query<{state:Game}>('select state from public.quiz_game');
    expect(result.rows[0].state.inputRound?.submitted).toEqual(['b']);
    expect(result.rows[0].state.inputRound).not.toHaveProperty('inputs');
    expect((await db.query('select public.quiz_host_inputs(\'round\') as inputs')).rows).toEqual([{inputs:{b:2}}]);
    await expect(db.query('select * from quiz_private.submissions')).rejects.toThrow();

    await db.exec('reset role');
    const final:Game={...base,phase:'final',final:{enabled:true,stage:'category',chooser:'c',categories:['cinema']}};
    await db.query("update public.quiz_game set state=$1::jsonb where id='main'",[JSON.stringify(final)]);
    await db.exec('set role anon');
    const wagerId='00000000-0000-0000-0000-000000000010';
    await expect(db.query("select public.quiz_choose_final('a','cinema',$1)",[wagerId])).rejects.toThrow();
    await db.query("select public.quiz_choose_final('c','cinema',$1)",[wagerId]);
    await expect(db.query("select public.quiz_submit_input($1,'c','371')",[wagerId])).rejects.toThrow();
    await db.query("select public.quiz_submit_input($1,'c','100')",[wagerId]);
    expect((await db.query('select public.quiz_host_inputs($1) as inputs',[wagerId])).rows).toEqual([{inputs:{}}]);
    await db.exec('reset role');
    const written:Game={...final,final:{...final.final!,stage:'written'},finalWagerId:wagerId,inputRound:{id:'written',stage:'written',submitted:[]}};
    await db.query("update public.quiz_game set state=$1::jsonb where id='main'",[JSON.stringify(written)]);
    await db.exec('set role anon');
    await db.query("select public.quiz_submit_input('written','c','\"Тайный ответ\"')");
    expect((await db.query("select public.quiz_host_inputs('written') as inputs")).rows).toEqual([{inputs:{}}]);
    await db.exec('reset role');
    await db.query("update public.quiz_game set state=jsonb_set(state,'{inputRound,closed}','true') where id='main'");
    await db.exec('set role anon');
    expect((await db.query('select public.quiz_host_inputs($1) as inputs',[wagerId])).rows).toEqual([{inputs:{c:100}}]);
    expect((await db.query("select public.quiz_host_inputs('written') as inputs")).rows).toEqual([{inputs:{c:'Тайный ответ'}}]);
    await expect(db.query("select public.quiz_submit_input('written','a','\"Опоздал\"')")).rejects.toThrow();
    await db.exec('reset role');
    const timedBoard:Game={...base,estimateTimer:true};
    await db.query("update public.quiz_game set state=$1::jsonb where id='main'",[JSON.stringify(timedBoard)]);
    const timed=transition({...timedBoard,categoryIds:[76]},{type:'open',id:'q76-100',roundId:'timed'},pack,1000);
    await db.query("update public.quiz_game set state=$1::jsonb where id='main'",[JSON.stringify(timed)]);
    const stamped=(await db.query<{state:Game}>('select state from public.quiz_game')).rows[0].state;
    expect(stamped.inputRound!.deadline!).toBeGreaterThan(Date.now()+20000);
    await expect(db.query("update public.quiz_game set state=jsonb_set(state,'{inputRound,closed}','true')")).rejects.toThrow('Таймер ещё идёт.');
    await db.exec('set role anon');
    await db.query("select public.quiz_submit_input('timed','a','50')");
    await db.exec('reset role');
    await db.query("update public.quiz_game set state=jsonb_set(state,'{inputRound,deadline}','0')");
    await db.exec('set role anon');
    await db.query("select public.quiz_submit_input('timed','a','50')");
    await expect(db.query("select public.quiz_submit_input('timed','b','90')")).rejects.toThrow('Время вышло.');
    await db.exec('reset role');

    const hintGame={...state,inputRound:undefined,activeQuestionId:'q01-100',activeQuestionValue:100};
    await db.query("update public.quiz_game set state=$1::jsonb where id='main'",[JSON.stringify(hintGame)]);
    const window=(await db.query<{window_id:string}>("select window_id from public.quiz_buzzer")).rows[0].window_id;
    await db.exec('set role anon');
    await db.query("select public.quiz_buzz('a',$1)",[window]);
    await db.query("select public.quiz_use_hint('a',$1)",[window]);
    const revision=(await db.query<{revision:number}>("select revision from public.quiz_game")).rows[0].revision;
    await db.query('select public.quiz_rearm($1,$2)',[window,revision]);
    const penalized=(await db.query<{state:Game}>('select state from public.quiz_game')).rows[0].state;
    expect(penalized.scoreChanges.a).toBe(-100);
  }finally{await db.close();}
},30000);
