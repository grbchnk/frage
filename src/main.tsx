import React, {useCallback,useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {available,findQuestion,initialGame,roundCategories,transition,type Action} from './engine';
import {demo,loadAnswers,readGame,saveGame,subscribeGame,supabase} from './connection';
import type {Answer,Game,Pack,Snapshot} from './types';
import {QuizAudio} from './audio';
import './style.css';

const params=new URLSearchParams(location.search);
const initialRole=params.get('mode')||(matchMedia('(max-width: 760px) and (pointer: coarse)').matches?'host':'display');
const colors=['#bdf684','#afcaff','#f7b0ce','#ffd28c','#c7b7ff','#81ddd2','#f4a48d','#c4d5a0','#fff3b0','#bec6df'];
const fmt=(seconds:number)=>`${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`;
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
  const history=useRef<{state:Game;after:number}[]>([]);const [undoCount,setUndoCount]=useState(0);
  const [confirm,setConfirm]=useState<'reset'|'endRound'|null>(null);
  const [help,setHelp]=useState(false);const [credits,setCredits]=useState(false);
  const [audioOn,setAudioOn]=useState(false);const [volume,setVolume]=useState(.35);const audio=useRef<QuizAudio|null>(null);const lastEvent=useRef<number|null>(null);
  const state=snapshot.state;
  useEffect(()=>{window.scrollTo({top:0,behavior:'instant'});},[state.phase,state.activeQuestionId]);
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
        const result=await loadAnswers(expectedRevision);if(alive){setAnswers(result);setAuthorized(true);}
      }catch(e){if(alive){setAuthorized(false);setAnswers({});setError((e as Error).message);}}
      finally{if(alive)setAuthLoading(false);}
    };
    void verify();
    const authSub=!demo?supabase?.auth.onAuthStateChange(()=>{setTimeout(()=>{if(alive)void verify();},0);}):null;
    return ()=>{alive=false;authSub?.data.subscription.unsubscribe();};
  },[host,pack?.revision]);
  useEffect(()=>{
    audio.current?.setPhase(state.phase);
    if(lastEvent.current!==null&&state.event!==lastEvent.current)audio.current?.effect(state.phase);
    lastEvent.current=state.event;
  },[state.event,state.phase]);
  useEffect(()=>()=>audio.current?.stop(),[]);
  function switchRole(){const next=host?'display':'host';setRole(next);const url=new URL(location.href);url.searchParams.set('mode',next);historyWindow(url);}
  async function sound(){try{if(!audio.current){audio.current=new QuizAudio();await audio.current.enable();audio.current.setPhase(state.phase);}const value=!audioOn;audio.current.volume(value?volume:0);setAudioOn(value);}catch{setError('Нажмите ещё раз, чтобы браузер включил звук.');}}
  async function act(action:Action){
    if(!pack||!authorized||writing.current)return;
    writing.current=true;setBusy(true);setError('');
    const before=current.current;
    try{const next=transition(before.state,action,pack);const saved=await saveGame(before,next);accept(saved);history.current.push({state:before.state,after:saved.revision});if(history.current.length>30)history.current.shift();setUndoCount(history.current.length);}
    catch(e){setError((e as Error).message);await refresh().catch(()=>{});}
    finally{writing.current=false;setBusy(false);}
  }
  async function undo(){
    if(writing.current||!authorized)return;
    const previous=history.current.at(-1);if(!previous)return;
    if(previous.after!==current.current.revision){history.current=[];setUndoCount(0);setError('После действий с другого устройства отмена недоступна.');return;}
    writing.current=true;setBusy(true);
    try{const saved=await saveGame(current.current,{...previous.state,event:current.current.state.event+1});accept(saved);history.current.pop();const top=history.current.at(-1);if(top)top.after=saved.revision;setUndoCount(history.current.length);setError('');}
    catch(e){setError((e as Error).message);await refresh().catch(()=>{});}finally{writing.current=false;setBusy(false);}
  }
  async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{setError('Полный экран недоступен в этом браузере. Можно скрыть панели браузера вручную.');}}
  const q=pack?findQuestion(pack,state.activeQuestionId):undefined;
  const category=pack?.categories.find(c=>c.questions.some(item=>item.id===q?.id));
  const privateAnswer=q?answers[q.id]:null;
  const leader=[...state.players].sort((a,b)=>b.score-a.score);
  const winners=leader.filter(p=>p.score===leader[0]?.score);
  const inGame=state.phase!=='lobby';
  return <div className={`app ${host?'host':'display'} phase-${state.phase}`}>
    <header className="topbar"><a className="brand" href={location.pathname+location.search} aria-label="ВИКТОРИНА У АЛИНЫ ДОМА"><span className="brand-title">ВИКТОРИНА<span>У АЛИНЫ ДОМА</span></span></a>
      <div className="top-actions"><span className={`connection ${connection.includes('эфире')||demo?'live':''}`} role="status" aria-label={demo?'Соединение установлено':connection} title={demo?'Соединение установлено':connection}><i/>{!demo&&!connection.includes('эфире')&&<span>{connection}</span>}</span><button className="icon-button" onClick={()=>setHelp(true)} aria-label="Как играть">?</button>{!host&&<><button className={`icon-button ${audioOn?'selected':''}`} onClick={()=>void sound()} title="Музыка и звуки" aria-label={audioOn?'Выключить звук':'Включить звук'}>{audioOn?'♫':'♪'}</button><button className="icon-button fullscreen" onClick={()=>void fullscreen()} aria-label="Полный экран">⛶</button></>}<button className="mode-button" onClick={switchRole}>{host?'Экран ↗':'Пульт ↗'}</button></div>
    </header>
    {error&&<div className="error" role="alert"><span>{error}</span><button onClick={()=>setError('')} aria-label="Закрыть сообщение">×</button></div>}
    {host&&(!authorized||authLoading)?<Login loading={authLoading} onError={setError}/>:snapshot.revision<0||!pack?<main className="waiting"><span className="eyebrow">ВИКТОРИНА У АЛИНЫ ДОМА</span><h1>Собираем игру<span className="accent">.</span></h1><p>Подключаем экран к общему столу.</p><button onClick={()=>void refresh().then(()=>setError('')).catch(e=>setError(e.message))}>Повторить подключение</button>{import.meta.env.DEV&&!demo&&<a className="text-link" href="?mode=host&demo=1">Локальная репетиция без базы ↗</a>}</main>:<>
      {inGame&&<section className="scoreboard" aria-label="Очки игроков" style={{'--player-count':state.players.length,'--mobile-columns':state.players.length<=4?2:state.players.length<=6?3:4} as React.CSSProperties}>{state.players.map((p,i)=><div className={`player ${state.phase==='board'&&i===state.turnIndex?'choosing':''} ${state.winnerId===p.id?'scored':''}`} key={p.id} style={{'--player-color':colors[i]} as React.CSSProperties}><div className="player-name"><span>{p.name}</span></div><strong>{p.score.toLocaleString('ru-RU')}</strong></div>)}</section>}
      {state.phase==='lobby'&&(host?<Setup busy={busy} start={(names,limit)=>void act({type:'start',names,limit})}/>:<main className="lobby"><div className="lobby-copy"><h1>ВИКТОРИНА<br/><em>У АЛИНЫ ДОМА</em></h1><div className="lobby-pills"><span>20 тем</span><span>2 раунда</span><span>100 вопросов</span></div></div><div className="lobby-art" aria-hidden="true"><div className="orbit"/><div className="art-tile a">100</div><div className="art-tile b">?</div><div className="art-tile c">500</div><span className="spark">✳</span></div><div className="waiting-host"><span className="pulse"/> Ожидаем ведущего</div>{!audioOn&&<button className="sound-start" onClick={()=>void sound()}>♫ Включить звук</button>}</main>)}
      {state.phase==='board'&&<main className="board-main"><div className="board-heading"><h1>Раунд {state.roundIndex+1}<span className="round-total"> / 2</span></h1><div className="turn"><span>Выбирает</span><strong>{state.players[state.turnIndex]?.name}</strong></div></div><div className="board" aria-label="Категории и вопросы">{roundCategories(pack,state).map(c=>{const used=c.questions.filter(item=>state.completed.includes(item.id)).length;return <div className={`board-row ${used>=state.questionsPerCategory?'complete':''}`} key={c.id}><div className="category-title"><strong>{c.title}</strong>{state.questionsPerCategory===3&&<small>{used}/3</small>}</div>{c.questions.map(item=><button className={`price ${state.completed.includes(item.id)?'played':''}`} key={item.id} disabled={!host||busy||!available(pack,state,item.id)} onClick={()=>void act({type:'open',id:item.id})} aria-label={`${c.title}, ${item.value}${state.completed.includes(item.id)?', сыграно':''}`}>{state.completed.includes(item.id)?<span className="played-mark">—</span>:item.value}</button>)}</div>;})}</div><div className="board-bottom"><span>{roundCategories(pack,state).flatMap(c=>c.questions).filter(item=>state.completed.includes(item.id)).length} / {state.questionsPerCategory*10} сыграно</span></div></main>}
      {(state.phase==='question'||state.phase==='answer')&&q&&<main className={`question-main ${q.media?'with-media':''} ${state.phase==='answer'?'revealed':''}`} key={q.id}><div className="question-meta"><span className="eyebrow">{category?.title}</span><span className="question-value">{q.value} <small>БАЛЛОВ</small></span>{state.phase==='question'&&<Clock endsAt={state.questionEndsAt}/>}</div><div className="question-content"><div className="question-text"><h1>{q.prompt}</h1>{state.phase==='answer'&&state.revealed&&<div className="answer-copy"><h2>{state.revealed.answer}</h2><p>{state.revealed.explanation}</p><span className="award-label">{state.winnerId?`+${q.value} · ${state.players.find(p=>p.id===state.winnerId)?.name}`:'В этот раз без баллов'}</span></div>}</div>{q.media&&<QuestionImage question={q} reveal={state.phase==='answer'}/>}</div>
        {host&&state.phase==='question'&&<section className="host-answer"><span className="eyebrow">Правильный ответ</span><h2>{privateAnswer?.answer||'Ответ ещё не загружен'}</h2>{privateAnswer && privateAnswer.accepted_answers?.length>0&&<p>Принимаем: {privateAnswer.accepted_answers.join(' · ')}</p>}<p>{privateAnswer?.explanation}</p>{privateAnswer?.host_note&&<p className="host-note">{privateAnswer.host_note}</p>}<h3>Кто ответил правильно?</h3><div className="award-buttons">{state.players.map((p,i)=><button key={p.id} style={{'--player-color':colors[i]} as React.CSSProperties} disabled={busy||!privateAnswer} onClick={()=>privateAnswer&&void act({type:'award',playerId:p.id,answer:privateAnswer})}><span>{p.name}</span><strong>+{q.value}</strong></button>)}</div><button className="secondary" disabled={busy||!privateAnswer} onClick={()=>privateAnswer&&void act({type:'award',playerId:null,answer:privateAnswer})}>Никто не угадал · показать ответ</button><button className="text-link" disabled={busy} onClick={()=>void act({type:'cancel'})}>Вернуть вопрос на поле</button></section>}
        {host&&state.phase==='answer'&&<button className="primary continue" disabled={busy} onClick={()=>void act({type:'continue'})}>Продолжить игру <span>→</span></button>}
      </main>}
      {state.phase==='break'&&<main className="intermission"><span className="eyebrow">Раунд 1 завершён</span><div className="break-star" aria-hidden="true">✳</div><h1>Перерыв</h1><Clock endsAt={state.breakEndsAt} large/>{host&&<button className="primary" disabled={busy} onClick={()=>void act({type:'resume'})}>Все в сборе · второй раунд →</button>}</main>}
      {state.phase==='finished'&&<main className="finale"><div className="confetti" aria-hidden="true">{Array.from({length:22},(_,i)=><i key={i} style={{left:`${(i*47)%100}%`,background:colors[i%colors.length],animationDelay:`${i*.13}s`,transform:`rotate(${i*33}deg)`}}/>)}</div><span className="trophy" aria-hidden="true">✶</span><h1>{winners.length>1?'Победители':'Победитель'}</h1><h2>{winners.map(p=>p.name).join(' и ')}</h2><p className="winner-score">{leader[0]?.score.toLocaleString('ru-RU')} баллов</p><div className="standings">{leader.map((p,i)=><div key={p.id}><span>{i>0&&p.score===leader[i-1].score?leader.findIndex(item=>item.score===p.score)+1:i+1}</span><strong>{p.name}</strong><b>{p.score.toLocaleString('ru-RU')}</b></div>)}</div>{host&&<button className="secondary" onClick={()=>setConfirm('reset')}>Собрать новую игру ↗</button>}</main>}
      {host&&inGame&&<nav className="host-toolbar"><button disabled={busy||!undoCount} onClick={()=>void undo()}>↶ Отменить</button>{state.phase==='board'&&<button disabled={busy} onClick={()=>setConfirm('endRound')}>Закончить раунд</button>}<button onClick={()=>setConfirm('reset')}>Новая игра</button><span>{busy?'Сохраняем…':''}</span></nav>}
    </>}
    <footer className="site-footer"><button onClick={()=>setCredits(true)}>Фото и авторы ↗</button>{!host&&audioOn&&<label className="volume">♫ <input type="range" min="0" max="0.8" step=".02" aria-label="Громкость" value={volume} onChange={e=>{const v=Number(e.target.value);setVolume(v);audio.current?.volume(v);}}/></label>}</footer>
    {confirm&&<div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><span className="eyebrow">РЕШЕНИЕ ВЕДУЩЕГО</span><h2 id="confirm-title">{confirm==='reset'?'Начать с чистого счёта?':'Завершить раунд?'}</h2><p>{confirm==='reset'?'Имена, очки и сыгранные вопросы будут сброшены.':'Оставшиеся вопросы пропустим. Очки сохранятся.'}</p><button className="primary" disabled={busy} onClick={()=>{void act({type:confirm==='reset'?'reset':'endRound'});setConfirm(null);}}>{confirm==='reset'?'Да, новая игра':'Завершить раунд'} →</button><button className="secondary" onClick={()=>setConfirm(null)}>Вернуться</button></section></div>}
    {help&&<div className="modal-backdrop"><section className="modal help" role="dialog" aria-modal="true" aria-labelledby="help-title"><button className="close" onClick={()=>setHelp(false)} aria-label="Закрыть">×</button><h2 id="help-title">Правила игры</h2><ol><li>Выбирайте тему и стоимость по очереди.</li><li>Ответить может любой. Кто был первым — решает ведущий.</li><li>За верный ответ — стоимость вопроса. Штрафов нет.</li><li>Ведущий выбирает игрока, экран показывает ответ. Потом — «Продолжить».</li><li>После первого раунда — 10 минут перерыва. После второго — слава победителю.</li></ol><p>Телефон — пульт, телевизор — экран. Можно переключить режим кнопкой вверху. Звук включается на телевизоре отдельным нажатием.</p><button className="primary" onClick={()=>setHelp(false)}>Всё понятно, поехали →</button></section></div>}
    {credits&&<Credits close={()=>setCredits(false)}/>}
  </div>;
}
function historyWindow(url:URL){window.history.replaceState(null,'',url);}
function Login({loading,onError}:{loading:boolean;onError:(s:string)=>void}){
  const [pending,setPending]=useState(false);
  return <main className="setup login"><h1>Вход ведущего</h1><p>Войдите в аккаунт ведущего, созданный в Supabase.</p><form onSubmit={async e=>{e.preventDefault();if(!supabase){onError('Сначала настройте .env.local и перезапустите сборку.');return;}setPending(true);const form=new FormData(e.currentTarget);const {error}=await supabase.auth.signInWithPassword({email:String(form.get('email')).trim(),password:String(form.get('password'))});setPending(false);if(error)onError('Не получилось войти. Проверьте почту, пароль и подтверждение аккаунта в Supabase.');else onError('');}}><label>Почта<input name="email" type="email" autoComplete="username" placeholder="host@example.com" required/></label><label>Пароль<input name="password" type="password" autoComplete="current-password" placeholder="Ваш пароль" required/></label><button className="primary" disabled={pending||loading}>{pending||loading?'Проверяем доступ…':'Войти за пульт →'}</button></form>{import.meta.env.DEV&&<a className="text-link" href="?mode=host&demo=1">Локальная репетиция без базы ↗</a>}<p className="dim small">Нет аккаунта? README → «Один раз настроить Supabase». Секретный API-ключ для входа не нужен.</p></main>;
}
function Setup({busy,start}:{busy:boolean;start:(names:string[],limit:number)=>void}){
  const [names,setNames]=useState(['','','','','','']);const [limit,setLimit]=useState(5);
  return <main className="setup"><h1>Игроки</h1><p>Впишите имена в порядке выбора вопросов.<br/>Отвечать смогут все — вне очереди.</p><form onSubmit={e=>{e.preventDefault();start(names,limit);}}><div className="name-inputs">{names.map((name,i)=><label key={i}><span style={{color:colors[i]}}>{String(i+1).padStart(2,'0')}</span><input aria-label={`Имя игрока ${i+1}`} maxLength={24} value={name} placeholder={`Игрок ${i+1}`} autoComplete="off" onChange={e=>setNames(names.map((n,j)=>j===i?e.target.value:n))}/>{names.length>2&&<button type="button" onClick={()=>setNames(names.filter((_,j)=>i!==j))} aria-label={`Убрать игрока ${i+1}`}>×</button>}</label>)}</div>{names.length<10&&<button type="button" className="add-player" onClick={()=>setNames([...names,''])}>＋ Добавить игрока</button>}<fieldset className="game-length"><legend>Количество вопросов</legend><label className={limit===5?'active':''}><input type="radio" name="limit" checked={limit===5} onChange={()=>setLimit(5)}/><strong>100 вопросов</strong><span>Все пять вопросов в теме</span></label><label className={limit===3?'active':''}><input type="radio" name="limit" checked={limit===3} onChange={()=>setLimit(3)}/><strong>60 вопросов</strong><span>Три любых вопроса в теме</span></label></fieldset><button className="primary" disabled={busy||names.filter(n=>n.trim()).length<2}>Начать большую игру <span>→</span></button></form><p className="dim small">100 вопросов с обсуждениями могут занять больше полутора часов. Для короткого вечера выбирайте 60.</p></main>;
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
  return <div className="modal-backdrop"><section className="modal credits" role="dialog" aria-modal="true" aria-labelledby="credits-title"><button className="close" onClick={close} aria-label="Закрыть">×</button><h2 id="credits-title">Фото и авторы</h2><p>Фотографии Wikimedia Commons. Веб-копии уменьшены и перекодированы; в некоторых заданиях поверх стоят временные плашки. Авторские карточки и музыка созданы для игры.</p>{sources.map((s:any)=><article key={s.id}><a href={s.source_url||s.download_url} target="_blank" rel="noreferrer">{s.id} · {s.title||'Карточка'}</a><p>{plain(s.author_html||s.author||'')} · <a href={s.license_url||s.source_url} target="_blank" rel="noreferrer">{s.license||'Авторская карточка'}</a></p></article>)}</section></div>;
}
const root=import.meta.hot?.data.root??createRoot(document.getElementById('root')!);
if(import.meta.hot)import.meta.hot.data.root=root;
root.render(<App/>);
