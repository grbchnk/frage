import React, {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {available,findQuestion,initialGame,roundCategories,transition,type Action} from './engine';
import {demo,loadAnswers,readGame,saveGame,subscribeGame,supabase,readParticipants,readBuzzer,subscribeParticipants,emptyBuzzer,rearm,restoreGame,resetGame} from './connection';
import type {Answer,Game,Pack,Snapshot,Participant,Buzzer} from './types';
import {QuizAudio} from './audio';
import './style.css';
import {JoinLink,ParticipantScreen} from './Participant';

const params=new URLSearchParams(location.search);
const initialRole=params.get('mode')||(matchMedia('(max-width: 760px) and (pointer: coarse)').matches?'player':'display');
const colors=['#f4bd62','#f28c68','#e8d4aa','#dc7862','#c8aa7b','#ffcda4','#bd9178','#edb18e','#fff0c4','#d39c63'];
const fmt=(seconds:number)=>`${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;
function AnimatedScore({value}:{value:number}){
  const [shown,setShown]=useState(value),from=useRef(value);
  useEffect(()=>{
    if(matchMedia('(prefers-reduced-motion:reduce)').matches){setShown(value);from.current=value;return;}
    const initial=from.current,start=performance.now();let frame=0;
    const tick=(now:number)=>{const t=Math.min(1,(now-start)/650),v=Math.round(initial+(value-initial)*(1-Math.pow(1-t,3)));setShown(v);from.current=v;if(t<1)frame=requestAnimationFrame(tick);};
    frame=requestAnimationFrame(tick);return ()=>cancelAnimationFrame(frame);
  },[value]);
  return <span aria-label={String(value)}>{shown.toLocaleString('ru-RU')}</span>;
}
function Clock({endsAt,large=false}:{endsAt:number|null;large?:boolean}){
  const [now,setNow]=useState(Date.now());useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),250);return ()=>clearInterval(timer);},[]);
  const left=endsAt?Math.max(0,Math.ceil((endsAt-now)/1000)):0;
  return <span className={`clock ${large?'large':''} ${left===0?'expired':''}`} aria-label={`Осталось ${left} секунд`}>{fmt(left)}</span>;
}
function App(){
  const [role,setRole]=useState(initialRole);
  const host=role==='host';
  const [pack,setPack]=useState<Pack|null>(null);
  const [snapshot,setSnapshot]=useState<Snapshot>({id:'main',revision:-1,state:initialGame()});
  const current=useRef(snapshot);
  const [connection,setConnection]=useState('Соединяем…');
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);const writing=useRef(false);
  const [answers,setAnswers]=useState<Record<string,Answer>>({});const [authorized,setAuthorized]=useState(demo);
  const [authLoading,setAuthLoading]=useState(!demo&&host);
  const history=useRef<{state:Game;after:number;buzzer:Buzzer}[]>([]);const [undoCount,setUndoCount]=useState(0);
  const [confirm,setConfirm]=useState<'reset'|'endRound'|null>(null);
  const [scorePlayerId,setScorePlayerId]=useState<string|null>(null);
  const [help,setHelp]=useState(false);const [credits,setCredits]=useState(false);
  const [audioOn,setAudioOn]=useState(false);const [volume,setVolume]=useState(.35);const audio=useRef<QuizAudio|null>(null);const lastEvent=useRef<number|null>(null);
  const state=snapshot.state;
  useEffect(()=>{if(state.phase==='lobby'||!host)setScorePlayerId(null);},[state.phase,host]);
  const [roster,setRoster]=useState<Participant[]>([]),[buzzer,setBuzzer]=useState<Buzzer>(emptyBuzzer),[buttonsOnline,setButtonsOnline]=useState(false);
  const syncButtons=useCallback(async()=>{try{const [r,b]=await Promise.all([readParticipants(),readBuzzer()]);setRoster(r);setBuzzer(b);setButtonsOnline(true);}catch(e){setButtonsOnline(false);throw e;}},[]);
  useEffect(()=>{const sync=()=>{void syncButtons().catch(()=>{});};sync();const stop=subscribeParticipants(sync);const timer=setInterval(sync,3000);window.addEventListener('focus',sync);window.addEventListener('online',sync);return ()=>{stop();clearInterval(timer);window.removeEventListener('focus',sync);window.removeEventListener('online',sync);};},[syncButtons]);
  useEffect(()=>{void syncButtons().catch(()=>{});},[snapshot.revision,syncButtons]);
  useEffect(()=>{window.scrollTo(0,0);},[state.phase,state.activeQuestionId]);
  const accept=useCallback((incoming:Snapshot)=>{
    if(incoming.revision>=current.current.revision){current.current=incoming;setSnapshot(incoming);}
  },[]);
  const refresh=useCallback(async()=>{try{accept(await readGame());setConnection(demo?'Демо · один браузер':'В эфире');}catch(e){setConnection((e as {code?:string}).code==='PGRST205'?'Нужна настройка':'Нет связи');throw e;}},[accept]);
  useEffect(()=>{
    let alive=true;
    fetch(`${import.meta.env.BASE_URL}content/questions.json`).then(r=>{if(!r.ok)throw new Error('Не найден пакет. Запустите npm run prepare:content.');return r.json();}).then(p=>{if(alive)setPack(p);}).catch(e=>setError(e.message));
    void refresh().catch(e=>setError(e.message));
    const unsubscribe=subscribeGame(accept,setConnection);
    const poll=setInterval(()=>{void refresh().catch(()=>{});},5000);
    const focus=()=>{void refresh().catch(()=>{});};window.addEventListener('focus',focus);window.addEventListener('online',focus);
    return ()=>{alive=false;unsubscribe();clearInterval(poll);window.removeEventListener('focus',focus);window.removeEventListener('online',focus);};
  },[accept,refresh]);
  useEffect(()=>{
    if(!host){setAuthorized(false);setAnswers({});setAuthLoading(false);return;}
    if(!pack)return;
    const expectedRevision=pack.revision;
    let alive=true;
    const verify=async()=>{
      if(!demo&&!supabase){setAuthLoading(false);return;}
      setAuthLoading(true);
      try{
        if(!demo){const {data}=await supabase!.auth.getSession();if(!data.session){if(alive){setAuthorized(false);setAnswers({});}return;}}
        const result=await loadAnswers(expectedRevision,pack.categories.reduce((n,c)=>n+c.questions.length,0));if(alive){setAnswers(result);setAuthorized(true);}
      }catch(e){if(alive){setAuthorized(false);setAnswers({});setError((e as Error).message);}}
      finally{if(alive)setAuthLoading(false);}
    };
    void verify();
    const authSub=!demo?supabase?.auth.onAuthStateChange(()=>{setTimeout(()=>{if(alive)void verify();},0);}):null;
    return ()=>{alive=false;authSub?.data.subscription.unsubscribe();};
  },[host,pack?.revision]);
  const previousScores=useRef<Record<string,number>>({});
  useEffect(()=>{
    audio.current?.setPhase(state.phase);
    if(lastEvent.current!==null&&state.event!==lastEvent.current)audio.current?.effect(state.players.some(p=>p.score<(previousScores.current[p.id]??p.score))?'wrong':state.phase);
    lastEvent.current=state.event;previousScores.current=Object.fromEntries(state.players.map(p=>[p.id,p.score]));
  },[state.event,state.phase]);
  useEffect(()=>()=>audio.current?.stop(),[]);
  const previousClaim=useRef<string|null>(null);
  useEffect(()=>{
    const key=buzzer.claimant?`${buzzer.window_id}:${buzzer.claimant}`:null;
    if(key&&key!==previousClaim.current)audio.current?.effect('buzz');
    previousClaim.current=key;
  },[buzzer.claimant,buzzer.window_id]);
  function switchRole(){const next=host?'display':'host';setRole(next);const url=new URL(location.href);url.searchParams.set('mode',next);historyWindow(url);}
  async function sound(){try{if(!audio.current){audio.current=new QuizAudio();await audio.current.enable();audio.current.setPhase(state.phase);}const value=!audioOn;audio.current.volume(value?volume:0);setAudioOn(value);}catch{setError('Нажмите ещё раз, чтобы браузер включил звук.');}}
  async function act(action:Action){
    if(!pack||!authorized||writing.current)return false;
    writing.current=true;setBusy(true);setError('');
    const before=current.current;
    try{const next=transition(before.state,action,pack);const saved=await saveGame(before,next);accept(saved);history.current.push({state:before.state,after:saved.revision,buzzer:structuredClone(buzzer)});if(history.current.length>30)history.current.shift();setUndoCount(history.current.length);return true;}
    catch(e){setError((e as Error).message);await refresh().catch(()=>{});return false;}
    finally{writing.current=false;setBusy(false);}
  }
  async function newGame(){
    if(!authorized||writing.current)return;writing.current=true;setBusy(true);setError('');
    try{const fresh=await resetGame();accept(fresh);history.current=[];setUndoCount(0);setScorePlayerId(null);setConfirm(null);await syncButtons();}
    catch(e){setError((e as Error).message);await refresh().catch(()=>{});}
    finally{writing.current=false;setBusy(false);}
  }
  async function undo(){
    if(writing.current||!authorized)return;
    const previous=history.current.at(-1);if(!previous)return;
    if(previous.after!==current.current.revision){history.current=[];setUndoCount(0);setError('После действий с другого устройства отмена недоступна.');return;}
    writing.current=true;setBusy(true);
    try{const saved=await restoreGame(current.current,{...previous.state,event:current.current.state.event+1},previous.buzzer);accept(saved);history.current.pop();const top=history.current.at(-1);if(top)top.after=saved.revision;setUndoCount(history.current.length);setError('');}
    catch(e){setError((e as Error).message);await refresh().catch(()=>{});}finally{writing.current=false;setBusy(false);}
  }
  async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{setError('Полный экран недоступен в этом браузере. Можно скрыть панели браузера вручную.');}}
  if(role==='player')return <ParticipantScreen state={state} roster={roster} buzzer={buzzer} online={buttonsOnline&&snapshot.revision>=0} onUpdate={syncButtons}/>;
  const q=pack?findQuestion(pack,state.activeQuestionId):undefined;
  const category=pack?.categories.find(c=>c.questions.some(item=>item.id===q?.id));
  const privateAnswer=q?answers[q.id]:null;
  const leader=[...state.players].sort((a,b)=>b.score-a.score);
  const winners=leader.filter(p=>p.score===leader[0]?.score);
  const inGame=state.phase!=='lobby';
  const scorePlayer=state.players.find(p=>p.id===scorePlayerId);
  const legacy=inGame&&!state.categoryIds?.length;
  const respondent=state.phase==='question'&&buzzer.question_id===state.activeQuestionId?state.players.find(p=>p.id===buzzer.claimant):undefined;
  async function wrongAnswer(){
    if(writing.current||!pack)return;writing.current=true;setBusy(true);
    const before=current.current,beforeBuzzer=structuredClone(buzzer);
    try{const result=await rearm(buzzer.window_id,before,pack);setBuzzer(result.buzzer);accept(result.snapshot);history.current.push({state:before.state,after:result.snapshot.revision,buzzer:beforeBuzzer});if(history.current.length>30)history.current.shift();setUndoCount(history.current.length);setError('');}
    catch(e){setError((e as Error).message);await Promise.all([syncButtons().catch(()=>{}),refresh().catch(()=>{})]);}
    finally{writing.current=false;setBusy(false);}
  }
  return <div className={`app ${host?'host':'display'} phase-${state.phase}`}>
    <header className="topbar"><a className="brand" href={location.pathname+location.search} aria-label="ВИКТОРИНА В КИНОКОМНАТЕ У ПАШИ"><span className="brand-title">ВИКТОРИНА<span>В КИНОКОМНАТЕ У ПАШИ</span></span></a>
      <div className="top-actions"><span className={`connection ${connection.includes('эфире')||demo?'live':''}`} role="status" aria-label={demo?'Соединение установлено':connection} title={demo?'Соединение установлено':connection}><i/>{!demo&&!connection.includes('эфире')&&<span>{connection}</span>}</span><button className="icon-button" onClick={()=>setHelp(true)} aria-label="Как играть">?</button>{!host&&<><button className={`icon-button ${audioOn?'selected':''}`} onClick={()=>void sound()} title="Музыка и звуки" aria-label={audioOn?'Выключить звук':'Включить звук'}>{audioOn?'♫':'♪'}</button><button className="icon-button fullscreen" onClick={()=>void fullscreen()} aria-label="Полный экран">⛶</button></>}<button className="mode-button" onClick={switchRole}>{host?'Экран ↗':'Пульт ↗'}</button></div>
    </header>
    {error&&<div className="error" role="alert"><span>{error}</span><button onClick={()=>setError('')} aria-label="Закрыть сообщение">×</button></div>}
    {host&&(!authorized||authLoading)?<Login loading={authLoading} onError={setError}/>:snapshot.revision<0||!pack?<main className="waiting"><span className="eyebrow">ВИКТОРИНА В КИНОКОМНАТЕ У ПАШИ</span><h1>Собираем игру<span className="accent">.</span></h1><p>Подключаем экран к общему столу.</p><button onClick={()=>void refresh().then(()=>setError('')).catch(e=>setError(e.message))}>Повторить подключение</button>{import.meta.env.DEV&&!demo&&<a className="text-link" href="?mode=host&demo=1">Локальная репетиция без базы ↗</a>}</main>:legacy?<main className="waiting"><h1>Новая игра в кинокомнате</h1><p>Обновились правила и банк вопросов. Ведущий может начать новую партию с кнопками участников.</p>{host&&<button onClick={()=>setConfirm('reset')}>Начать новую игру</button>}</main>:<>
      {inGame&&<section className="scoreboard" aria-label="Очки игроков" style={{'--player-count':state.players.length,'--mobile-columns':host?(state.players.length>6?3:2):(state.players.length<=4?2:state.players.length<=6?3:4)} as React.CSSProperties}>{state.players.map((p,i)=><div className={`player ${state.phase==='board'&&i===state.turnIndex?'choosing':''} ${state.winnerId===p.id?'scored':''}`} key={p.id} style={{'--player-color':colors[i]} as React.CSSProperties}><div className="player-name"><span>{p.name}</span></div><strong>{host?p.score.toLocaleString('ru-RU'):<AnimatedScore value={p.score}/>}</strong><div className="score-delta-slot">{state.scoreChanges?.[p.id]!==undefined&&<span className={`score-change ${state.scoreChanges[p.id]>0?'positive':'negative'}`} key={`${p.id}-${state.event}`} aria-label={`За последний ответ: ${state.scoreChanges[p.id]>0?'плюс':'минус'} ${Math.abs(state.scoreChanges[p.id])}`}>{state.scoreChanges[p.id]>0?'+':'−'}{Math.abs(state.scoreChanges[p.id])}</span>}</div></div>)}</section>}
      {state.phase==='lobby'&&(host?<Setup categories={pack.categories} busy={busy} roster={roster} online={buttonsOnline} start={(names,limit,categoryIds)=>void act({type:'start',names,limit,participants:roster,categoryIds})}/>:<main className="lobby"><div className="lobby-copy"><h1>ВИКТОРИНА<br/><em>В КИНОКОМНАТЕ У ПАШИ</em></h1><div className="lobby-pills"><span>{pack.categories.length} темы в банке</span><span>10 случайных тем</span><span>1 раунд</span></div></div><div className="lobby-art" aria-hidden="true"><div className="orbit"/><div className="art-tile a">100</div><div className="art-tile b">?</div><div className="art-tile c">500</div><span className="spark">✳</span></div><JoinLink/><div className="waiting-host"><span className="pulse"/> Ожидаем ведущего · подключились: {roster.map(p=>p.name).join(", ")||"пока никого"}</div>{!audioOn&&<button className="sound-start" onClick={()=>void sound()}>♫ Включить звук</button>}</main>)}
      {state.phase==='board'&&<main className="board-main"><div className="board-heading"><h1>Большая игра<span className="round-total"> · 10 тем</span></h1><div className="turn"><span>Выбирает</span><strong>{state.players[state.turnIndex]?.name}</strong></div></div><div className="board" aria-label="Категории и вопросы">{roundCategories(pack,state).map((c,row)=>{const used=c.questions.filter(item=>state.completed.includes(item.id)).length;return <div className={`board-row ${used>=state.questionsPerCategory?'complete':''}`} style={{'--row':row} as React.CSSProperties} key={c.id}><div className="category-title"><strong>{c.title}</strong>{state.questionsPerCategory===3&&<small>{used}/3</small>}</div>{c.questions.map(item=><button className={`price ${state.completed.includes(item.id)?'played':''}`} key={item.id} disabled={!host||busy||!available(pack,state,item.id)} onClick={()=>void act({type:'open',id:item.id})} aria-label={`${c.title}, ${item.value}${state.completed.includes(item.id)?', сыграно':''}`}>{state.completed.includes(item.id)?<span className="played-mark">—</span>:item.value}</button>)}</div>;})}</div><div className="board-bottom"><span>{roundCategories(pack,state).flatMap(c=>c.questions).filter(item=>state.completed.includes(item.id)).length} / {state.questionsPerCategory*10} сыграно</span></div></main>}
      {(state.phase==='question'||state.phase==='answer')&&q&&<main className={`question-main ${q.media?'with-media':''} ${state.phase==='answer'?'revealed':''}`} key={q.id}><div className="question-meta"><span className="question-category">{category?.title}</span><span className="question-value">{q.value} <small>БАЛЛОВ</small></span>{state.phase==='question'&&<Clock endsAt={state.questionEndsAt}/>}</div><div className="question-content"><FittedCopy contentKey={`${q.id}-${state.phase}-${role}`}><h1><TypedQuestion text={q.prompt} openedAt={state.questionOpenedAt??(state.questionEndsAt!-q.time_seconds*1000)} reveal={host||state.phase==='answer'}/></h1>{state.phase==='answer'&&state.revealed&&<div className="answer-copy"><h2>{state.revealed.answer}</h2><p>{state.revealed.explanation}</p><span className="award-label">{state.winnerId?`+${q.value} · ${state.players.find(p=>p.id===state.winnerId)?.name}`:'В этот раз без баллов'}</span></div>}</FittedCopy>{q.media&&<QuestionImage question={q} reveal={host||state.phase==='answer'}/>}</div>
        {state.phase==='question'&&<div className={`respondent ${respondent?'has-respondent':''}`} role="status">{respondent?`Отвечает ${respondent.name}`:buzzer.excluded.length>=state.players.length?'Все попробовали — ведущий раскрывает ответ':'Кто первый нажмёт?'}</div>}
        {host&&state.phase==='question'&&<section className="host-answer">
          <div className="private-answer"><span className="eyebrow">Ответ для ведущего</span><h2>{privateAnswer?.answer||'Ответ ещё не загружен'}</h2>{privateAnswer&&privateAnswer.accepted_answers?.length>0&&<p className="accepted-answers">Принимаем: {privateAnswer.accepted_answers.join(' · ')}</p>}
          {(privateAnswer?.explanation||privateAnswer?.host_note)&&<details className="answer-notes"><summary>Пояснение и заметки</summary><p>{privateAnswer.explanation}</p>{privateAnswer.host_note&&<p className="host-note">{privateAnswer.host_note}</p>}</details>}</div>
          {respondent&&state.winnerId===null?<div className="judgement-panel"><h3>Отвечает {respondent.name}</h3><div className="judgement-buttons"><button className="judge-correct" disabled={busy||!privateAnswer} onClick={()=>privateAnswer&&void act({type:'correct',playerId:respondent.id,answer:privateAnswer})}><span>Правильно</span><strong>+{q.value}</strong></button><button className="judge-wrong" disabled={busy} onClick={()=>void wrongAnswer()}><span>Неправильно</span><strong>−{q.value/2}</strong></button></div></div>:
          state.winnerId!==null?<button className="primary" disabled={busy||!privateAnswer} onClick={()=>privateAnswer&&void act({type:'reveal',answer:privateAnswer})}>Показать правильный ответ</button>:<div className="awaiting-response"><p>{buzzer.excluded.length>=state.players.length?'Все участники уже попробовали':'Ждём нажатия следующего участника'}</p><button className="secondary" disabled={busy||!privateAnswer} onClick={()=>privateAnswer&&void act({type:'reveal',answer:privateAnswer})}>Никто не ответил · раскрыть ответ</button></div>}
        </section>}
        {host&&state.phase==='answer'&&<button className="primary continue" disabled={busy} onClick={()=>void act({type:'continue'})}>Продолжить игру <span>→</span></button>}
      </main>}

      {state.phase==='finished'&&<main className="finale"><div className="confetti" aria-hidden="true">{Array.from({length:22},(_,i)=><i key={i} style={{left:`${(i*47)%100}%`,background:colors[i%colors.length],animationDelay:`${i*.13}s`,transform:`rotate(${i*33}deg)`}}/>)}</div><span className="trophy" aria-hidden="true">✶</span><h1>{winners.length>1?'Победители':'Победитель'}</h1><h2>{winners.map(p=>p.name).join(' и ')}</h2><p className="winner-score">{leader[0]?.score.toLocaleString('ru-RU')} баллов</p><div className="standings">{leader.map((p,i)=><div key={p.id}><span>{i>0&&p.score===leader[i-1].score?leader.findIndex(item=>item.score===p.score)+1:i+1}</span><strong>{p.name}</strong><b>{p.score.toLocaleString('ru-RU')}</b></div>)}</div>{host&&<button className="secondary" onClick={()=>setConfirm('reset')}>Собрать новую игру ↗</button>}</main>}
      {host&&inGame&&<nav className="host-toolbar"><button disabled={busy||!undoCount} onClick={()=>void undo()}>↶ Отменить</button>{state.phase==='board'&&<button disabled={busy} onClick={()=>setConfirm('endRound')}>Закончить игру</button>}<button onClick={()=>setConfirm('reset')}>Новая игра</button><span>{busy?'Сохраняем…':''}</span></nav>}
      {host&&inGame&&<details className="host-score-adjustments"><summary>Корректировка баллов</summary><div className="score-adjustment-list">{state.players.map(p=><div className="score-adjustment-row" key={p.id}><div><strong>{p.name}</strong><span>{p.score.toLocaleString('ru-RU')} баллов</span></div><div className="score-adjustment-buttons"><button disabled={busy} aria-label={`Отнять 50 баллов: ${p.name}`} onClick={()=>void act({type:'adjustScore',playerId:p.id,delta:-50})}>−50</button><button disabled={busy} aria-label={`Добавить 50 баллов: ${p.name}`} onClick={()=>void act({type:'adjustScore',playerId:p.id,delta:50})}>+50</button><button disabled={busy} aria-label={`Другое количество баллов: ${p.name}`} onClick={()=>setScorePlayerId(p.id)}>Другая сумма</button></div></div>)}</div></details>}
      {host&&state.phase==='question'&&state.winnerId===null&&<button className="text-link question-return" disabled={busy} onClick={()=>void act({type:'cancel'})}>Вернуть вопрос на поле</button>}

    </>}
    <footer className="site-footer"><button onClick={()=>setCredits(true)}>Фото и авторы ↗</button>{!host&&audioOn&&<label className="volume">♫ <input type="range" min="0" max="0.8" step=".02" aria-label="Громкость" value={volume} onChange={e=>{const v=Number(e.target.value);setVolume(v);audio.current?.volume(v);}}/></label>}</footer>
    {confirm&&<div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><span className="eyebrow">РЕШЕНИЕ ВЕДУЩЕГО</span><h2 id="confirm-title">{confirm==='reset'?'Начать с чистого счёта?':'Завершить игру?'}</h2><p>{confirm==='reset'?'Имена, очки и сыгранные вопросы будут сброшены.':'Оставшиеся вопросы пропустим. Очки сохранятся.'}</p><button className="primary" disabled={busy} onClick={()=>{if(confirm==='reset')void newGame();else void act({type:'endRound'}).then(saved=>{if(saved)setConfirm(null);});}}>{confirm==='reset'?'Да, новая игра':'Завершить игру'} →</button><button className="secondary" onClick={()=>setConfirm(null)}>Вернуться</button></section></div>}
    {host&&authorized&&inGame&&scorePlayer&&<ScoreAdjustment key={scorePlayer.id} player={scorePlayer} busy={busy} close={()=>setScorePlayerId(null)} apply={async delta=>{const saved=await act({type:'adjustScore',playerId:scorePlayer.id,delta});if(saved)setScorePlayerId(null);return saved;}}/>}
    {help&&<div className="modal-backdrop"><section className="modal help" role="dialog" aria-modal="true" aria-labelledby="help-title"><button className="close" onClick={()=>setHelp(false)} aria-label="Закрыть">×</button><h2 id="help-title">Правила игры</h2><ol><li>Следующую тему и стоимость выбирает тот, кто ответил правильно. Если никто не угадал, выбирает прежний игрок.</li><li>Ответить может любой. Право ответа получает тот, чьё нажатие первым приняла база.</li><li>За верный ответ — стоимость вопроса. За неверный — минус половина стоимости и блокировка кнопки до следующего вопроса.</li><li>У ведущего две кнопки: «Правильно» начисляет баллы и сразу показывает ответ; «Неправильно» открывает кнопки остальным.</li><li>Один раунд: 10 случайных или выбранных ведущим тем. После последнего вопроса — победитель.</li></ol><p>Телефон — пульт, телевизор — экран. Можно переключить режим кнопкой вверху. Звук включается на телевизоре отдельным нажатием.</p><button className="primary" onClick={()=>setHelp(false)}>Всё понятно, поехали →</button></section></div>}
    {credits&&<Credits close={()=>setCredits(false)}/>}
  </div>;
}
function historyWindow(url:URL){window.history.replaceState(null,'',url);}
function ScoreAdjustment({player,busy,close,apply}:{player:Game['players'][number];busy:boolean;close:()=>void;apply:(delta:number)=>Promise<boolean>}){
  const [amount,setAmount]=useState('50');
  const [failure,setFailure]=useState('');
  const value=Number(amount);
  const valid=amount.trim()!==''&&Number.isSafeInteger(value)&&value>0;
  async function submit(sign:number){
    if(busy)return;
    if(!valid){setFailure('Введите целое положительное количество баллов.');return;}
    if(!Number.isSafeInteger(player.score+sign*value)){setFailure('Слишком большое количество баллов.');return;}
    if(!await apply(sign*value))setFailure('Не удалось сохранить баллы. Проверьте соединение и повторите.');
  }
  return <div className="modal-backdrop"><section className="modal score-modal" role="dialog" aria-modal="true" aria-labelledby="score-title"><button className="close" disabled={busy} onClick={close} aria-label="Закрыть">×</button><span className="eyebrow">Бонус или штраф</span><h2 id="score-title">Баллы: {player.name}</h2><p>Сейчас: {player.score.toLocaleString('ru-RU')} баллов. Можно уйти в минус.</p><form onSubmit={e=>{e.preventDefault();void submit(1);}}><label htmlFor="score-amount">Количество баллов</label><input id="score-amount" type="number" inputMode="numeric" min="1" step="1" value={amount} autoFocus disabled={busy} onChange={e=>{setAmount(e.target.value);setFailure('');}}/>{failure&&<p className="score-error" role="alert">{failure}</p>}<div className="score-modal-actions"><button type="button" className="secondary" disabled={busy||!valid} onClick={()=>void submit(-1)}>Отнять {valid?value.toLocaleString('ru-RU'):''}</button><button type="submit" className="primary" disabled={busy||!valid}>Добавить {valid?value.toLocaleString('ru-RU'):''}</button></div></form><button className="text-link" disabled={busy} onClick={close}>Вернуться в игру</button></section></div>;
}
function FittedCopy({contentKey,children}:{contentKey:string;children:React.ReactNode}){
  const frame=useRef<HTMLDivElement>(null),copy=useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{
    const box=frame.current,text=copy.current;
    if(!box||!text)return;
    let raf=0,alive=true;
    const fit=()=>{
      if(!alive)return;
      if(!box.closest('.display')||!matchMedia('(min-width:761px)').matches){text.style.removeProperty('font-size');return;}
      const height=box.clientHeight*.96,width=box.clientWidth;
      if(height<=0||width<=0)return;
      let low=8,high=Math.min(height*.88,width*.35);
      // Binary search actual rendered lines, including the answer and explanation.
      for(let i=0;i<14;i++){
        const size=(low+high)/2;text.style.fontSize=`${size}px`;
        if(text.scrollHeight<=height&&text.scrollWidth<=width)low=size;else high=size;
      }
      text.style.fontSize=`${Math.floor(low)}px`;
    };
    const schedule=()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(fit);};
    const observer=new ResizeObserver(schedule);observer.observe(box);
    window.addEventListener('resize',schedule);
    void document.fonts.ready.then(schedule);fit();
    return ()=>{alive=false;observer.disconnect();cancelAnimationFrame(raf);window.removeEventListener('resize',schedule);};
  },[contentKey]);
  return <div className="question-text" ref={frame}><div className="question-copy" ref={copy}>{children}</div></div>;
}
function Login({loading,onError}:{loading:boolean;onError:(s:string)=>void}){
  const [pending,setPending]=useState(false);
  return <main className="setup login"><h1>Вход ведущего</h1><p>Войдите в аккаунт ведущего, созданный в Supabase.</p><form onSubmit={async e=>{e.preventDefault();if(!supabase){onError('Сначала настройте .env.local и перезапустите сборку.');return;}setPending(true);const form=new FormData(e.currentTarget);const {error}=await supabase.auth.signInWithPassword({email:String(form.get('email')).trim(),password:String(form.get('password'))});setPending(false);if(error)onError('Не получилось войти. Проверьте почту, пароль и подтверждение аккаунта в Supabase.');else onError('');}}><label>Почта<input name="email" type="email" autoComplete="username" placeholder="host@example.com" required/></label><label>Пароль<input name="password" type="password" autoComplete="current-password" placeholder="Ваш пароль" required/></label><button className="primary" disabled={pending||loading}>{pending||loading?'Проверяем доступ…':'Войти за пульт →'}</button></form>{import.meta.env.DEV&&<a className="text-link" href="?mode=host&demo=1">Локальная репетиция без базы ↗</a>}<p className="dim small">Нет аккаунта? README → «Один раз настроить Supabase». Секретный API-ключ для входа не нужен.</p></main>;
}
function Setup({busy,roster,online,start,categories}:{categories:Pack['categories'];busy:boolean;roster:Participant[];online:boolean;start:(names:string[],limit:number,categoryIds?:number[])=>void}){
  const [limit,setLimit]=useState(5),[selection,setSelection]=useState<'random'|'manual'>('random'),[selected,setSelected]=useState<number[]>([]);
  const valid=selection==='random'||selected.length===10;
  return <main className="setup"><h1>Все в сборе?</h1><p>Игроки подключаются с телефонов. Первый подключившийся выбирает первый вопрос.</p><JoinLink/><div className="joined-players">{roster.map((p,i)=><span key={p.id}><b>{i+1}</b> {p.name}</span>)}{!roster.length&&<p>Ждём участников…</p>}</div>{!online&&<p className="error">Не подключены кнопки. Выполните свежий supabase/setup.sql.</p>}
  <fieldset className="category-mode"><legend>Категории на эту игру</legend><label><input type="radio" name="category-mode" checked={selection==='random'} onChange={()=>setSelection('random')}/>Случайные 10 из {categories.length}</label><label><input type="radio" name="category-mode" checked={selection==='manual'} onChange={()=>setSelection('manual')}/>Выбрать вручную</label></fieldset>
  {selection==='manual'&&<section className="category-picker"><div className="category-picker-heading"><strong aria-live="polite">Выбрано {selected.length} / 10</strong><button type="button" disabled={busy||!selected.length} onClick={()=>setSelected([])}>Снять все</button></div><div className="category-checklist">{categories.map(c=><label key={c.id} className={selected.includes(c.id)?'checked':''}><input type="checkbox" checked={selected.includes(c.id)} disabled={busy||(!selected.includes(c.id)&&selected.length===10)} onChange={e=>setSelected(ids=>e.target.checked?[...ids,c.id]:ids.filter(id=>id!==c.id))}/><span>{c.title}</span></label>)}</div><p>Отметьте ровно 10 тем. Они сохранятся для всей партии.</p></section>}
  <fieldset className="game-length"><legend>Длина игры · 10 тем</legend><label className={limit===5?'active':''}><input type="radio" name="limit" checked={limit===5} onChange={()=>setLimit(5)}/><strong>50 вопросов</strong><span>Все пять в каждой теме</span></label><label className={limit===3?'active':''}><input type="radio" name="limit" checked={limit===3} onChange={()=>setLimit(3)}/><strong>30 вопросов</strong><span>Три любых в каждой теме</span></label></fieldset><button className="primary" disabled={busy||!online||roster.length<2||!valid} onClick={()=>start(roster.map(p=>p.name),limit,selection==='manual'?categories.filter(c=>selected.includes(c.id)).map(c=>c.id):undefined)}>{selection==='manual'?'Начать с выбранными темами':'Выбрать темы и начать'} →</button></main>;
}
function TypedQuestion({text,openedAt,reveal}:{text:string;openedAt:number;reveal:boolean}){
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const length=()=>reveal||reduced?text.length:Math.min(text.length,Math.max(0,Math.floor((Date.now()-openedAt)/28)));
  const [count,setCount]=useState(length);
  useEffect(()=>{setCount(length());if(reveal||reduced)return;const timer=setInterval(()=>setCount(length()),28);return ()=>clearInterval(timer);},[text,openedAt,reveal,reduced]);
  return <span className="typed-question" aria-label={text}><span aria-hidden="true">{text.slice(0,count)}<i className={`typing-cursor ${count>=text.length?'done':''}`}/><span className="untyped">{text.slice(count)}</span></span></span>;
}
function QuestionImage({question,reveal}:{question:NonNullable<ReturnType<typeof findQuestion>>;reveal:boolean}){
  const [ratio,setRatio]=useState<number|null>(null);const [broken,setBroken]=useState(false);const media=question.media!;
  if(media.kind==='photo_rebus')return <div className="question-image photo-rebus" role="img" aria-label="Фоторебус"><div className="rebus-stage">{media.tokens?.map((token,i)=><span className="rebus-token" key={`t${i}`}>{token}</span>)}{media.panels?.map((panel,i)=><React.Fragment key={panel.path}>{i>0&&<span className="rebus-plus">{media.joiner||'+'}</span>}<div className="rebus-panel">{panel.replace_letters&&<span className="rebus-operation">{panel.replace_letters}</span>}{panel.trim_end&&<span className="rebus-trim" aria-label="Уберите последнюю букву">{"’".repeat(panel.trim_end)}</span>}<img src={`${import.meta.env.BASE_URL}${panel.path}`} alt={`Фотография ${i+1} для ребуса`} onError={()=>setBroken(true)}/></div></React.Fragment>)}</div>{broken&&<p role="alert">Фото не загрузилось. Проверьте соединение.</p>}</div>;
  return <div className="question-image"><div className="image-stage" style={ratio?{'--image-ratio':ratio} as React.CSSProperties:undefined}>{broken?<p role="alert">Фото не загрузилось. Проверьте соединение.</p>:<><img src={`${import.meta.env.BASE_URL}${media.path}`} alt={media.question_alt||'Изображение к вопросу'} onLoad={e=>setRatio(e.currentTarget.naturalWidth/e.currentTarget.naturalHeight)} onError={()=>setBroken(true)}/>{!reveal&&media.question_masks_normalized?.map((mask,i)=><span className="photo-mask" key={i} style={{left:`${mask[0]*100}%`,top:`${mask[1]*100}%`,width:`${mask[2]*100}%`,height:`${mask[3]*100}%`}}><b>?</b></span>)}</>}</div></div>;
}
function Credits({close}:{close:()=>void}){
  const [sources,setSources]=useState<any[]>([]);
  useEffect(()=>{void fetch(`${import.meta.env.BASE_URL}content/image-sources.json`).then(r=>r.json()).then(rows=>setSources(rows.filter((r:any)=>r.used_in_current_pack))).catch(()=>{});},[]);
  const plain=(html:string)=>{return new DOMParser().parseFromString(html,'text/html').body.textContent||'';};
  return <div className="modal-backdrop"><section className="modal credits" role="dialog" aria-modal="true" aria-labelledby="credits-title"><button className="close" onClick={close} aria-label="Закрыть">×</button><h2 id="credits-title">Фото и авторы</h2><p>Фотографии Wikimedia Commons и материалы пользователя. Веб-копии уменьшены и перекодированы; в некоторых заданиях поверх стоят временные плашки. Авторские карточки и музыка созданы для игры.</p>{sources.map((s:any)=><article key={s.id}><a href={s.source_url||s.download_url} target="_blank" rel="noreferrer">{s.id} · {s.title||'Карточка'}</a><p>{plain(s.author_html||s.author||'')} · <a href={s.license_url||s.source_url} target="_blank" rel="noreferrer">{s.license||'Авторская карточка'}</a></p></article>)}</section></div>;
}
class ScreenBoundary extends React.Component<{children:React.ReactNode},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<main style={{padding:'8%',fontFamily:'Arial,sans-serif',fontSize:24,lineHeight:1.5}}><h1>Этот браузер не смог открыть обычный экран</h1><p><a href="./tv.html" style={{color:'#f4bd62'}}>Открыть экран для старого телевизора →</a></p><p>Ведущий продолжает управлять игрой с телефона.</p></main>:this.props.children;}
}
const root=import.meta.hot?.data.root??createRoot(document.getElementById('root')!);
if(import.meta.hot)import.meta.hot.data.root=root;
root.render(<ScreenBoundary><App/></ScreenBoundary>);
