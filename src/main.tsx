import React, {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BOARD_PAGE_SIZE,activeQuestion,chooseCategories,findQuestion,initialGame,rankPlayers,roundCategories,transition,type Action} from './engine';
import {demo,loadAnswer,readGame,saveGame,subscribeGame,readParticipants,readBuzzer,subscribeParticipants,emptyBuzzer,rearm,restoreGame,resetGame,readInputs} from './connection';
import type {Answer,Game,Pack,Snapshot,Participant,Buzzer} from './types';
import {QuizAudio} from './audio';
import './style.css';
import './board.css';
import './theme.css';
import {useScreenWakeLock} from './use-screen-wake-lock';
import {JoinLink,LobbyRoster,ParticipantScreen} from './Participant';
import {allSubmitted,drawQuestions,filterCategories,hasEnoughQuestions,questionFilters,prices,type QuestionFilter} from './rounds';
import {FinalReview,GroupControls,RoundResults,SharedOptions,SharedProgress,stageLabel} from './GroupQuestion';
import {AnswerFlash,BoardCrown,Finale,GAME_NAME,ScoreDelta,VisualCategory,useAnswerFeedback} from './GameViews';

const params=new URLSearchParams(location.search);
const initialRole=params.get('mode')||(matchMedia('(max-width: 760px) and (pointer: coarse)').matches?'player':'display');
function App(){
  const [role,setRole]=useState(initialRole);
  const host=role==='host';
  const [pack,setPack]=useState<Pack|null>(null);
  const [snapshot,setSnapshot]=useState<Snapshot>({id:'main',revision:-1,state:initialGame()});
  const current=useRef(snapshot);
  const [connection,setConnection]=useState('Соединяем…');
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);const writing=useRef(false);
  const [answers,setAnswers]=useState<Record<string,Answer>>({});
  const [answersLoading,setAnswersLoading]=useState(false);
  const [answerRetry,setAnswerRetry]=useState(0);
  const history=useRef<{state:Game;after:number;buzzer:Buzzer}[]>([]);const [undoCount,setUndoCount]=useState(0);
  const [confirm,setConfirm]=useState<'reset'|'endRound'|null>(null);
  const [scoresOpen,setScoresOpen]=useState(false);
  const [help,setHelp]=useState(false);const [credits,setCredits]=useState(false);
  const [audioOn,setAudioOn]=useState(false);const [volume,setVolume]=useState(.35);const audio=useRef<QuizAudio|null>(null);const lastEvent=useRef<number|null>(null);
  const state=snapshot.state;
  const inputRound=state.inputRound;
  const q=pack?activeQuestion(pack,state):undefined;
  const privateAnswer=q?answers[q.id]:undefined;
  const finalAnswer=state.final?.questionId?answers[state.final.questionId]:undefined;
  const processedTurn=useRef('');
  useScreenWakeLock(role==='display'&&state.phase!=='finished');
  useEffect(()=>{if(state.phase==='lobby'||!host)setScoresOpen(false);},[state.phase,host]);
  const [roster,setRoster]=useState<Participant[]>([]),[buzzer,setBuzzer]=useState<Buzzer>(emptyBuzzer),[buttonsOnline,setButtonsOnline]=useState(false);
  const lastButtonRead=useRef(0);
  const syncButtons=useCallback(async()=>{
    const read=++lastButtonRead.current;
    try{
      const [participants,buttonState]=await Promise.all([readParticipants(),readBuzzer()]);
      if(read!==lastButtonRead.current)return;
      setRoster(participants);setBuzzer(buttonState);setButtonsOnline(true);
    }catch(e){
      if(read===lastButtonRead.current)setButtonsOnline(false);
      throw e;
    }
  },[]);
  useEffect(()=>{const sync=()=>{void syncButtons().catch(()=>{});};sync();const stop=subscribeParticipants(sync);const timer=setInterval(sync,3000);window.addEventListener('focus',sync);window.addEventListener('online',sync);return ()=>{stop();clearInterval(timer);window.removeEventListener('focus',sync);window.removeEventListener('online',sync);};},[syncButtons]);
  useEffect(()=>{void syncButtons().catch(()=>{});},[snapshot.revision,syncButtons]);
  useLayoutEffect(()=>{window.scrollTo(0,0);},[state.phase,state.activeQuestionId]);
  const accept=useCallback((incoming:Snapshot)=>{
    if(incoming.revision<=current.current.revision)return;
    current.current=incoming;
    setSnapshot(incoming);
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
  const activeAnswerId=state.final?.questionId??state.activeQuestionId;
  const activeAnswer=activeAnswerId?answers[activeAnswerId]:undefined;
  useEffect(()=>{
    if(!host||!pack||!activeAnswerId||activeAnswer){setAnswersLoading(false);return;}
    let alive=true;
    setAnswersLoading(true);
    void loadAnswer(pack.revision,activeAnswerId)
      .then(answer=>{if(alive)setAnswers(previous=>({...previous,[activeAnswerId]:answer}));})
      .catch(e=>{if(alive)setError((e as Error).message);})
      .finally(()=>{if(alive)setAnswersLoading(false);});
    return ()=>{alive=false;};
  },[host,pack,activeAnswerId,activeAnswer,answerRetry]);
  const feedback=useAnswerFeedback(state.feedback);
  useEffect(()=>{
    audio.current?.setPhase(state.phase);
    if(lastEvent.current!==null&&state.event!==lastEvent.current)audio.current?.effect(state.feedback?.event===state.event&&state.feedback.kind==='wrong'?'wrong':state.phase);
    lastEvent.current=state.event;
  },[state.event,state.phase,state.feedback]);
  useEffect(()=>()=>audio.current?.stop(),[]);
  const previousClaim=useRef<string|null>(null);
  useEffect(()=>{
    const key=buzzer.claimant?`${buzzer.window_id}:${buzzer.claimant}`:null;
    if(key&&key!==previousClaim.current)audio.current?.effect('buzz');
    previousClaim.current=key;
  },[buzzer.claimant,buzzer.window_id]);
  function openScoreAdjustment(){setError('');setScoresOpen(true);}
  function switchRole(){const next=host?'display':'host';setRole(next);const url=new URL(location.href);url.searchParams.set('mode',next);historyWindow(url);}
  async function sound(){try{if(!audio.current){audio.current=new QuizAudio();await audio.current.enable();audio.current.setPhase(state.phase);}const value=!audioOn;audio.current.volume(value?volume:0);setAudioOn(value);}catch{setError('Нажмите ещё раз, чтобы браузер включил звук.');}}
  async function act(action:Action,revision?:number){
    if(!pack||writing.current)return false;
    writing.current=true;setBusy(true);setError('');
    const before=current.current;
    try{
      if(revision!==undefined&&before.revision!==revision)throw new Error('Поступили новые ответы. Повторите действие.');
      if(action.type==='open'||action.type==='openFinal'){
        const id=action.type==='open'?action.id:action.questionId;
        const answer=answers[id]??await loadAnswer(pack.revision,id);
        setAnswers(previous=>({...previous,[id]:answer}));
        if(action.type==='openFinal'&&!answer.finalPrompt)throw new Error('Не найден текст финального вопроса.');
        action=action.type==='open'?{...action,answer}:{...action,prompt:answer.finalPrompt!};
      }
      const next=transition(before.state,action,pack);
      const saved=await saveGame(before,next,action.type==='correct'?buzzer.window_id:undefined);
      accept(saved);
      history.current.push({state:before.state,after:saved.revision,buzzer:structuredClone(buzzer)});
      if(history.current.length>30)history.current.shift();
      setUndoCount(history.current.length);
      return true;
    }
    catch(e){setError((e as Error).message);await refresh().catch(()=>{});return false;}
    finally{writing.current=false;setBusy(false);}
  }
  async function newGame(){
    if(writing.current)return;writing.current=true;setBusy(true);setError('');
    try{const fresh=await resetGame();accept(fresh);history.current=[];setUndoCount(0);setScoresOpen(false);setConfirm(null);await syncButtons();}
    catch(e){setError((e as Error).message);await refresh().catch(()=>{});}
    finally{writing.current=false;setBusy(false);}
  }
  async function undo(){
    if(writing.current)return;
    const previous=history.current.at(-1);if(!previous)return;
    if(previous.after!==current.current.revision){history.current=[];setUndoCount(0);setError('После действий с другого устройства отмена недоступна.');return;}
    writing.current=true;setBusy(true);
    try{const saved=await restoreGame(current.current,{...previous.state,event:current.current.state.event+1,feedback:null},previous.buzzer);accept(saved);history.current.pop();const top=history.current.at(-1);if(top)top.after=saved.revision;setUndoCount(history.current.length);setError('');}
    catch(e){setError((e as Error).message);await refresh().catch(()=>{});}finally{writing.current=false;setBusy(false);}
  }
  async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{setError('Полный экран недоступен в этом браузере. Можно скрыть панели браузера вручную.');}}
  async function scoreRound(){
    let before=current.current;
    let round=before.state.inputRound;
    if(!round||!privateAnswer||busy)return;
    try{
      if(round.stage!=='turns'&&!round.closed){
        if(!await act({type:'closeInputs',roundId:round.id},before.revision))return;
        before=current.current;
        round=before.state.inputRound;
        if(!round)return;
      }
      const inputs=await readInputs(round.id);
      if(before.state.activeQuestionId!==q?.id||round.id!==current.current.state.inputRound?.id)return;
      await act({type:'scoreRound',inputs,answer:privateAnswer},before.revision);
    }catch(e){setError((e as Error).message);}
  }
  useEffect(()=>{
    if(!host||!privateAnswer||busy||state.phase!=='question'||inputRound?.stage!=='turns'||!allSubmitted(inputRound,state.players))return;
    const key=`${inputRound.id}:${inputRound.turn}:${snapshot.revision}`;
    if(processedTurn.current===key)return;
    processedTurn.current=key;
    void scoreRound();
  },[host,privateAnswer,busy,state.phase,inputRound,state.players,snapshot.revision]);
  if(role==='player')return <ParticipantScreen state={state} pack={pack} roster={roster} buzzer={buzzer} online={buttonsOnline&&snapshot.revision>=0} onUpdate={syncButtons} onAccept={accept}/>;
  const ranked=rankPlayers(state.players);
  const choosingId=state.players[state.turnIndex]?.id;
  const categories=pack?roundCategories(pack,state):[];
  const categoryIndex=categories.findIndex(c=>c.questions.some(item=>item.id===q?.id));
  const category=categories[categoryIndex];
  const isRound=state.phase==='board'||state.phase==='question'||state.phase==='answer';
  const inGame=state.phase!=='lobby';
  const legacy=inGame&&!state.categoryIds?.length;
  const respondent=state.phase==='question'&&!inputRound&&buzzer.question_id===state.activeQuestionId?state.players.find(p=>p.id===buzzer.claimant):undefined;
  async function reopenBuzzer(penalize:boolean){
    if(writing.current||!pack||!respondent)return;writing.current=true;setBusy(true);
    const before=current.current,beforeBuzzer=structuredClone(buzzer);
    try{const result=await rearm(buzzer.window_id,before,pack,penalize);lastButtonRead.current++;setBuzzer(result.buzzer);accept(result.snapshot);history.current.push({state:before.state,after:result.snapshot.revision,buzzer:beforeBuzzer});if(history.current.length>30)history.current.shift();setUndoCount(history.current.length);setError('');}
    catch(e){setError((e as Error).message);await Promise.all([syncButtons().catch(()=>{}),refresh().catch(()=>{})]);}
    finally{writing.current=false;setBusy(false);}
  }
  return <div className={`app ${host?'host':'display'} phase-${state.phase} ${isRound?'quiz-round':''}`}>
    {!host&&feedback&&<AnswerFlash key={feedback.event} kind={feedback.kind}/>}

    <header className="topbar"><a className="brand" href={location.pathname+location.search} aria-label={GAME_NAME}><span className="brand-title">{GAME_NAME}</span></a>
      <div className="top-actions"><span className={`connection ${connection.includes('эфире')||demo?'live':''}`} role="status" aria-label={demo?'Соединение установлено':connection} title={demo?'Соединение установлено':connection}><i/>{!demo&&!connection.includes('эфире')&&<span>{connection}</span>}</span><button className="icon-button" onClick={()=>setHelp(true)} aria-label="Как играть">?</button>{!host&&<><button className={`icon-button ${audioOn?'selected':''}`} onClick={()=>void sound()} title="Музыка и звуки" aria-label={audioOn?'Выключить звук':'Включить звук'}>{audioOn?'♫':'♪'}</button></>}<button className="icon-button fullscreen" onClick={()=>void fullscreen()} aria-label="Полный экран">⛶</button><button className="mode-button" onClick={switchRole}>{host?'Экран ↗':'Пульт ↗'}</button></div>
    </header>
    {host&&activeAnswerId&&!activeAnswer&&<div className="setup-status">
      {answersLoading?'Загружаем ответ…':<button onClick={()=>{setError('');setAnswerRetry(value=>value+1);}}>Повторить загрузку ответа</button>}
    </div>}
    {error&&!scoresOpen&&<div className="error" role="alert"><span>{error}</span><button onClick={()=>setError('')} aria-label="Закрыть сообщение">×</button></div>}
    {snapshot.revision<0||!pack?<main className="waiting"><span className="eyebrow">{GAME_NAME}</span><h1>Собираем игру<span className="accent">.</span></h1><p>Подключаем экран к общему столу.</p><button disabled={host&&answersLoading} onClick={()=>{setError('');if(host)setAnswerRetry(value=>value+1);void refresh().catch(e=>setError(e.message));}}>Повторить подключение</button>{import.meta.env.DEV&&!demo&&<a className="text-link" href="?mode=host&demo=1">Локальная репетиция без базы ↗</a>}</main>:legacy?<main className="waiting"><h1>Новая игра</h1><p>Обновились правила и банк вопросов. Ведущий может начать новую партию с кнопками участников.</p>{host&&<button onClick={()=>setConfirm('reset')}>Начать новую игру</button>}</main>:<>
      {inGame&&state.phase!=='finished'&&<section className={`scoreboard ${ranked.length>4?'many-players':''}`} aria-label="Очки игроков" style={{'--player-count':ranked.length,'--mobile-columns':ranked.length<=4?2:ranked.length<=6?3:ranked.length<=8?4:5} as React.CSSProperties}>
        {ranked.map(p=><div className={`player ${state.phase==='board'&&p.id===choosingId?'choosing':''} ${state.winnerId===p.id?'scored':''}`} key={p.id}>
          {p.rank<=3&&<BoardCrown rank={p.rank}/>}
          <div className="player-name"><span title={p.name}>{p.name}</span></div>
          <strong>{p.score.toLocaleString('ru-RU')}</strong>
          <div className="score-delta-slot">{state.scoreChanges?.[p.id]!==undefined&&<ScoreDelta delta={state.scoreChanges[p.id]}/>}</div>
        </div>)}
      </section>}
      {state.phase==='lobby'&&(host?
        <Setup pack={pack} categories={pack.categories} busy={busy} roster={roster} online={buttonsOnline} start={(names,limit,categoryIds,selectedQuestions,final)=>void act({type:'start',names,limit,participants:roster,categoryIds,selectedQuestions,final})}/>:
        <main className="display-lobby">
          <JoinLink/>
          <div className="lobby-room">
            <h1>{GAME_NAME}</h1>
            <LobbyRoster roster={roster}/>
          </div>
        </main>
      )}
      {state.phase==='board'&&<Board categories={categories} state={state} pack={pack} host={host} busy={busy} open={id=>void act({type:'open',id,roundId:crypto.randomUUID()})} openPage={page=>void act({type:'boardPage',page})}/>}
      {(state.phase==='question'||state.phase==='answer')&&q&&<main className={`question-main ${q.media?'with-media':''} ${state.phase==='answer'?'revealed':''}`} key={q.id}><div className="question-meta">
        {category&&<span className="question-category" data-accent={categoryAccent(categoryIndex+1)}>
          <span className="category-number" aria-label={`Категория ${categoryIndex+1}`}>{categoryIndex+1}</span>
          <strong>{category.title}</strong>
        </span>}
        <span className="question-value" data-value={q.value} aria-label={`${q.value} баллов`}>{q.value}</span>
      </div><div className="question-content">
        <div className="question-words">
          {state.phase==='answer'&&state.revealed?<FittedCopy contentKey={`${q.id}-answer-${role}`} kind="answer">
            <div className="answer-copy">
              <h2>{state.revealed.answer}</h2><p>{state.revealed.explanation}</p>
              {!state.results&&<span className="award-label">{state.winnerId?`+${q.value} · ${state.players.find(p=>p.id===state.winnerId)?.name}`:'Без верного ответа'}</span>}
            </div>
          </FittedCopy>:<FittedCopy contentKey={`${q.id}-prompt-${role}`} kind="prompt">
            <h1><TypedQuestion text={q.prompt} openedAt={state.questionOpenedAt} instant={host}/></h1>
          </FittedCopy>}
        </div>
        {q.media&&<QuestionImage question={q} reveal={host||state.phase==='answer'}/>}
      </div>
        {state.phase==='question'&&state.hint&&<p className="question-hint"><strong>Подсказка · </strong>{state.hint}</p>}
        {state.phase==='question'&&inputRound&&<>
          <p className="shared-progress">{stageLabel(inputRound.stage)}</p>
          <SharedOptions round={inputRound}/>
          {host?<GroupControls key={inputRound.id} round={inputRound} players={state.players} busy={busy} onReveal={()=>void scoreRound()}/>
            :<SharedProgress round={inputRound} players={state.players}/>}
          {host&&error&&inputRound.stage==='turns'&&allSubmitted(inputRound,state.players)&&<button className="secondary" disabled={busy} onClick={()=>void scoreRound()}>Повторить проверку ответа</button>}
        </>}
        {state.phase==='answer'&&state.results&&<RoundResults results={state.results} players={state.players}/>}
        {!host&&!inputRound&&<div className={`respondent ${respondent?'has-respondent':''}${state.phase==='answer'?' respondent-closed':''}`} role="status">{state.phase==='question'&&(respondent?`Отвечает ${respondent.name}`:'Кто первый?')}</div>}
        {host&&state.phase==='question'&&!inputRound&&<section className="host-answer">
          <div className="private-answer"><span className="eyebrow">Ответ для ведущего</span><h2>{privateAnswer?.answer||'Ответ ещё не загружен'}</h2>{privateAnswer&&privateAnswer.accepted_answers?.length>0&&<p className="accepted-answers">Принимаем: {privateAnswer.accepted_answers.join(' · ')}</p>}
          {(privateAnswer?.explanation||privateAnswer?.host_note)&&<details className="answer-notes"><summary>Пояснение и заметки</summary><p>{privateAnswer.explanation}</p>{privateAnswer.host_note&&<p className="host-note">{privateAnswer.host_note}</p>}</details>}</div>
          {respondent&&state.winnerId===null?<div className="judgement-panel"><h3>Отвечает {respondent.name}</h3><div className="judgement-buttons"><button className="judge-correct" disabled={busy||!privateAnswer} onClick={()=>privateAnswer&&void act({type:'correct',playerId:respondent.id,answer:privateAnswer})}><span>Правильно</span><strong>+{q.value}</strong></button><button className="judge-wrong" disabled={busy} onClick={()=>void reopenBuzzer(true)}><span>Неправильно</span><strong>−{state.hint?q.value:q.value/2}</strong></button></div><button className="secondary release-buzzer" disabled={busy} onClick={()=>void reopenBuzzer(false)}>Снять нажатие без штрафа</button></div>:
          state.winnerId!==null?<button className="primary" disabled={busy||!privateAnswer} onClick={()=>privateAnswer&&void act({type:'reveal',answer:privateAnswer})}>Показать правильный ответ</button>:<div className="awaiting-response"><p>Ждём нажатия</p><button className="secondary" disabled={busy||!privateAnswer} onClick={()=>privateAnswer&&void act({type:'reveal',answer:privateAnswer})}>Никто не ответил · раскрыть ответ</button></div>}
          <button className="secondary score-adjustment" disabled={busy} onClick={openScoreAdjustment}>± Баллы</button>
        </section>}
        {host&&state.phase==='answer'&&<button className="primary continue" disabled={busy} onClick={()=>void act({type:'continue'})}>Продолжить игру <span>→</span></button>}
      </main>}

      {state.phase==='final'&&state.final&&<main className="final-round">
        <h1>Финальный вопрос</h1>
        {state.final.stage==='category'&&<><p>Категорию выбирает <strong>{state.players.find(player=>player.id===state.final?.chooser)?.name}</strong></p>
          <div className="final-category-buttons">{pack.finals?.map(topic=><span className="secondary" key={topic.id}>{topic.title}</span>)}</div>
        </>}
        {state.final.stage!=='category'&&<h2>{pack.finals?.find(topic=>topic.id===state.final?.categoryId)?.title}</h2>}
        {state.final.stage==='wager'&&inputRound&&<GroupControls key={inputRound.id} round={inputRound} players={state.players}
          busy={busy||!host} onReveal={()=>{
            const questions=pack.finals?.find(topic=>topic.id===state.final?.categoryId)?.questions??[];
            const picked=questions[Math.floor(Math.random()*questions.length)];
            if(picked)void act({type:'openFinal',questionId:picked.id,prompt:'',roundId:crypto.randomUUID()});
          }} displayOnly={!host} actionLabel="Открыть вопрос"/>}
        {state.final.stage==='written'&&inputRound&&<>
          <h2>{state.final.prompt}</h2>
          {host&&finalAnswer&&state.finalWagerId?<FinalReview key={inputRound.id} round={inputRound}
            wagerId={state.finalWagerId} answer={finalAnswer} players={state.players} busy={busy}
            onReview={()=>void act({type:'closeInputs',roundId:inputRound.id},snapshot.revision)}
            onScore={(inputs,wagers,correct)=>{
              if(inputRound.submitted.some(id=>typeof inputs[id]!=='string')){
                setError('Поступили новые ответы. Отметьте их перед подсчётом.');return;
              }
              void act({type:'scoreFinal',inputs,wagers,correct,answer:finalAnswer},snapshot.revision);
            }}/>:<SharedProgress round={inputRound} players={state.players}/>}
        </>}
        {state.final.stage==='result'&&state.revealed&&<>
          <h2>{state.revealed.answer}</h2><p>{state.revealed.explanation}</p>
          <RoundResults results={state.results??[]} players={state.players}/>
          {host&&<button className="primary" disabled={busy} onClick={()=>void act({type:'finishFinal'})}>Показать победителей</button>}
        </>}
      </main>}
      {state.phase==='finished'&&<Finale players={state.players} reset={host?()=>setConfirm('reset'):undefined}/>}
      {host&&inGame&&<nav className="host-toolbar" aria-label="Управление игрой">
        <button disabled={busy||!undoCount} onClick={()=>void undo()}>↶ Отменить</button>
        {state.phase!=='question'&&state.phase!=='final'&&<button disabled={busy} onClick={openScoreAdjustment}>± Баллы</button>}
        {state.phase==='question'&&state.winnerId===null&&<button disabled={busy||!!inputRound?.submitted.length} onClick={()=>void act({type:'cancel'})}>Вернуть вопрос</button>}
        {state.phase==='board'&&<button disabled={busy} onClick={()=>setConfirm('endRound')}>{state.final?.enabled?'Перейти к финалу':'Закончить игру'}</button>}
        {state.phase!=='finished'&&<button disabled={busy} onClick={()=>setConfirm('reset')}>Новая игра</button>}
        {busy&&<span role="status">Сохраняем…</span>}
      </nav>}

    </>}
    <footer className="site-footer"><button onClick={()=>setCredits(true)}>Фото и авторы ↗</button>{!host&&audioOn&&<label className="volume">♫ <input type="range" min="0" max="0.8" step=".02" aria-label="Громкость" value={volume} onChange={e=>{const v=Number(e.target.value);setVolume(v);audio.current?.volume(v);}}/></label>}</footer>
    {confirm&&<div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><span className="eyebrow">РЕШЕНИЕ ВЕДУЩЕГО</span><h2 id="confirm-title">{confirm==='reset'?'Начать с чистого счёта?':state.final?.enabled?'Перейти к финалу?':'Завершить игру?'}</h2><p>{confirm==='reset'?'Имена, очки и сыгранные вопросы будут сброшены.':'Оставшиеся вопросы пропустим. Очки сохранятся.'}</p><button className="primary" disabled={busy} onClick={()=>{if(confirm==='reset')void newGame();else void act({type:'endRound'}).then(saved=>{if(saved)setConfirm(null);});}}>{confirm==='reset'?'Да, новая игра':state.final?.enabled?'Перейти к финалу':'Завершить игру'} →</button><button className="secondary" onClick={()=>setConfirm(null)}>Вернуться</button></section></div>}
    {host&&inGame&&scoresOpen&&<ScoreAdjustment players={ranked} busy={busy} error={error} close={()=>{setScoresOpen(false);setError('');}} apply={(playerId,delta)=>act({type:'adjustScore',playerId,delta})}/>}
    {help&&<div className="modal-backdrop"><section className="modal help" role="dialog" aria-modal="true" aria-labelledby="help-title"><button className="close" onClick={()=>setHelp(false)} aria-label="Закрыть">×</button><h2 id="help-title">Правила игры</h2><ol><li>Следующую тему и стоимость выбирает тот, кто ответил правильно. Если никто не угадал, выбирает прежний игрок.</li><li>Ответить может любой. Право ответа получает тот, чьё нажатие первым приняла база.</li><li>За верный ответ — стоимость вопроса. За неверный — минус половина стоимости и можно снова нажать на том же вопросе.</li><li>У ведущего две кнопки: «Правильно» начисляет баллы и сразу показывает ответ; «Неправильно» открывает кнопки всем. Случайное нажатие можно снять без штрафа.</li><li>В общих вопросах следуйте инструкции на телефоне. В финале игроки делают ставки и отправляют письменные ответы.</li></ol><p>Телефон — пульт, телевизор — экран. Можно переключить режим кнопкой вверху. Звук включается на телевизоре отдельным нажатием.</p><button className="primary" onClick={()=>setHelp(false)}>Всё понятно, поехали →</button></section></div>}
    {credits&&<Credits close={()=>setCredits(false)}/>}
  </div>;
}
function historyWindow(url:URL){window.history.replaceState(null,'',url);}
function ScoreAdjustment({players,busy,error,close,apply}:{players:Game['players'];busy:boolean;error:string;close:()=>void;apply:(id:string,delta:number)=>Promise<boolean>}){
  const [playerId,setPlayerId]=useState(players[0]?.id);
  const [amount,setAmount]=useState('');
  const player=players.find(p=>p.id===playerId);
  const value=Number(amount);
  const valid=Number.isSafeInteger(value)&&value>0;
  async function submit(delta:number){
    if(!busy&&player&&await apply(player.id,delta))setAmount('');
  }
  return <div className="modal-backdrop"><section className="modal score-modal" role="dialog" aria-modal="true" aria-labelledby="score-title">
    <button className="close" disabled={busy} onClick={close} aria-label="Закрыть">×</button>
    <h2 id="score-title">Изменить счёт</h2>
    <label htmlFor="score-player">Игрок</label>
    <select id="score-player" value={playerId} autoFocus disabled={busy} onChange={e=>setPlayerId(e.target.value)}>
      {players.map(p=><option key={p.id} value={p.id}>{p.name} · {p.score.toLocaleString('ru-RU')}</option>)}
    </select>
    <div className="score-presets">
      {([1,-1] as const).map(sign=><div className={sign>0?'bonus':'penalty'} key={sign}>
        <h3>{sign>0?'Добавить':'Отнять'}</h3>
        {[50,100,200,300,500].map(points=><button key={points} disabled={busy||!player} onClick={()=>void submit(points*sign)}>{sign>0?'+':'−'}{points}</button>)}
      </div>)}
    </div>
    <form onSubmit={e=>{e.preventDefault();if(valid)void submit(value);}}>
      <label htmlFor="score-amount">Другая сумма</label>
      <input id="score-amount" type="number" inputMode="numeric" min="1" step="1" value={amount} disabled={busy} onChange={e=>setAmount(e.target.value)}/>
      <div className="score-modal-actions"><button type="button" className="secondary" disabled={busy||!valid} onClick={()=>void submit(-value)}>Отнять</button><button type="submit" className="primary" disabled={busy||!valid}>Добавить</button></div>
    </form>
    {error&&<p className="score-error" role="alert">{error}</p>}
    <button className="text-link" disabled={busy} onClick={close}>Готово</button>
  </section></div>;
}

const categoryAccent=(number:number)=>((number-1)%5)+1;

function Board({categories,state,pack,host,busy,open,openPage}:{categories:Pack['categories'];state:Game;pack:Pack;host:boolean;busy:boolean;open:(id:string)=>void;openPage:(page:number)=>void}){
  const pages=Math.ceil(categories.length/BOARD_PAGE_SIZE);
  const page=Math.min(pages-1,Math.max(0,state.boardPage??0));
  const visible=categories.slice(page*BOARD_PAGE_SIZE,(page+1)*BOARD_PAGE_SIZE);
  const chooser=state.players[state.turnIndex];
  const used=categories.reduce((sum,c)=>sum+c.questions.filter(item=>state.completed.includes(item.id)).length,0);
  return <main className="board-main">
    <div className="board-chooser">
      <h1><span>Выбирает</span> <strong>{chooser?.name}</strong></h1>
    </div>
    {pages>1&&<nav className="board-pages" aria-label="Страницы категорий">
      {host&&<button disabled={busy||page===0} onClick={()=>openPage(page-1)}>← Предыдущие</button>}
      <span>Страница {page+1} из {pages}</span>
      {host&&<button disabled={busy||page===pages-1} onClick={()=>openPage(page+1)}>Следующие →</button>}
    </nav>}
    <div className={`board ${visible.length>6?'board-dense':''}`} aria-label="Категории и вопросы" style={{'--board-rows':visible.length} as React.CSSProperties}>
      {visible.map((c,row)=>{
        const played=c.questions.filter(item=>state.completed.includes(item.id)).length;
        const complete=played>=state.questionsPerCategory;
        const number=page*BOARD_PAGE_SIZE+row+1;
        return <div className="board-row" data-accent={categoryAccent(number)} style={{'--row':row} as React.CSSProperties} key={c.id}>
          <div className="category-title">
            <span className="category-number" aria-hidden="true">{number}</span>
            <strong title={c.title}>{c.title}</strong>
            <VisualCategory category={pack.categories.find(category=>category.id===c.id)??c}/>
          </div>
          {c.questions.map(item=>{
            const wasPlayed=state.completed.includes(item.id);
            const blank=wasPlayed||complete;
            return <button className={`price ${blank?'played':''}`} data-question-id={item.id} data-value={item.value} key={item.id} disabled={blank||!host||busy} onClick={()=>open(item.id)} aria-label={`${c.title}, ${item.value}${wasPlayed?', сыграно':complete?', категория закрыта':''}`}>{!blank&&item.value}</button>;
          })}
        </div>;
      })}
    </div>
    {host&&<p className="board-progress">{used} / {state.questionsPerCategory*categories.length} сыграно</p>}
  </main>;
}
function FittedCopy({contentKey,kind,children}:{contentKey:string;kind:'prompt'|'answer';children:React.ReactNode}){
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
  return <div className={`question-text question-${kind}`} ref={frame}><div className="question-copy" ref={copy}>{children}</div></div>;
}
function Setup({busy,roster,online,start,categories,pack}:{
  categories:Pack['categories'];pack:Pack;busy:boolean;roster:Participant[];online:boolean;
  start:(names:string[],limit:number,categoryIds:number[],selectedQuestions:string[],final:boolean)=>void;
}){
  const [limit,setLimit]=useState(5);
  const [selection,setSelection]=useState<'random'|'manual'>('random');
  const [randomCount,setRandomCount]=useState('10');
  const [selected,setSelected]=useState<number[]>([]);
  const [types,setTypes]=useState(()=>Object.keys(questionFilters) as QuestionFilter[]);
  const [final,setFinal]=useState(false);
  const [search,setSearch]=useState('');
  const [sort,setSort]=useState<'bank'|'name'>('bank');
  const filtered=filterCategories(categories,types);
  const eligible=filtered.filter(hasEnoughQuestions);
  const manual=eligible.filter(category=>selected.includes(category.id));
  const count=selection==='random'?Number(randomCount):manual.length;
  const valid=Number.isInteger(count)&&count>=1&&count<=eligible.length;
  const matches=filtered.filter(category=>category.title.toLocaleLowerCase('ru').includes(search.trim().toLocaleLowerCase('ru')));
  if(sort==='name')matches.sort((a,b)=>a.title.localeCompare(b.title,'ru'));
  function launch(){
    if(!valid)return;
    const ids=selection==='manual'?manual.map(c=>c.id):chooseCategories({...pack,categories:eligible},Math.random,count);
    start(roster.map(p=>p.name),limit,ids,drawQuestions(eligible,ids),final);
  }
  return <main className="setup host-setup">
    <section className="setup-players">
      <h1>Лобби</h1>
      <div className="host-lobby-connect"><JoinLink/><LobbyRoster roster={roster}/></div>
    </section>
    <section className="setup-rules">
      <fieldset className="question-type-filters"><legend>Типы вопросов</legend>
        {(Object.keys(questionFilters) as QuestionFilter[]).map(type=><label key={type}>
          <input type="checkbox" checked={types.includes(type)} onChange={e=>setTypes(previous=>e.target.checked?[...previous,type]:previous.filter(item=>item!==type))}/>
          {questionFilters[type]}
        </label>)}
      </fieldset>
      <fieldset className="category-mode"><legend>Категории</legend>
        <label><input type="radio" name="category-mode" checked={selection==='random'} onChange={()=>setSelection('random')}/>Случайные</label>
        <label><input type="radio" name="category-mode" checked={selection==='manual'} onChange={()=>setSelection('manual')}/>Выбрать вручную</label>
      </fieldset>
      {selection==='random'?<label className="category-count">Количество тем <input type="number" inputMode="numeric" min="1" max={eligible.length} value={randomCount} onChange={e=>setRandomCount(e.target.value)}/><span>из {eligible.length}</span></label>:
        <section className="category-picker">
          <div className="category-picker-heading"><strong aria-live="polite">Выбрано {manual.length}</strong><button type="button" disabled={busy||!selected.length} onClick={()=>setSelected([])}>Снять все</button></div>
          <div className="category-search"><input type="search" placeholder="Найти категорию" aria-label="Найти категорию" value={search} onChange={e=>setSearch(e.target.value)}/>
            <select aria-label="Порядок категорий" value={sort} onChange={e=>setSort(e.target.value==='name'?'name':'bank')}>
              <option value="bank">Как в банке</option><option value="name">По алфавиту</option>
            </select>
          </div>
          <div className="category-checklist">{matches.map(c=>{
            const missing=prices.length-c.questions.length;
            return <label key={c.id} className={selected.includes(c.id)&&missing<=0?'checked':''}>
              <input type="checkbox" checked={selected.includes(c.id)&&missing<=0} disabled={busy||missing>0} onChange={e=>setSelected(ids=>e.target.checked?[...ids,c.id]:ids.filter(id=>id!==c.id))}/>
              <span>{c.title}{missing>0&&<small className="category-missing">Доступно {c.questions.length} из {prices.length}</small>}</span><VisualCategory category={pack.categories.find(category=>category.id===c.id)??c}/>
            </label>;
          })}</div>
        </section>}
      {selection==='manual'&&selected.length>manual.length&&<p className="setup-status">Выбрано {manual.length} доступных тем. Остальные не подходят под текущие фильтры.</p>}
      {!eligible.length&&<p className="setup-status">С этими фильтрами ни в одной категории нет пяти подходящих вопросов.</p>}
      <fieldset className="game-length"><legend>Вопросов в каждой теме</legend>{[3,5].map(value=><label key={value} className={limit===value?'active':''}><input type="radio" name="limit" checked={limit===value} onChange={()=>setLimit(value)}/><strong>{value}</strong></label>)}</fieldset>
      {!!pack.finals?.length&&<label className="final-toggle"><input type="checkbox" checked={final} onChange={e=>setFinal(e.target.checked)}/>Финальный вопрос со ставкой</label>}
      <button className="primary" disabled={busy||!online||roster.length<2||!valid} onClick={launch}>Начать игру {valid&&<span>{count*limit} вопросов</span>}</button>
      {!online?<p className="setup-status">Подключаем кнопки…</p>:roster.length<2&&<p className="setup-status">Для старта нужны два игрока</p>}
    </section>
  </main>;
}
const TYPEWRITER_INTERVAL=75;
function TypedQuestion({text,openedAt,instant}:{text:string;openedAt:number|null;instant:boolean}){
  const glyphs=useMemo(()=>{
    if(typeof Intl.Segmenter!=='function')return Array.from(text);
    return Array.from(new Intl.Segmenter('ru').segment(text),part=>part.segment);
  },[text]);
  const immediate=instant||openedAt===null||matchMedia('(prefers-reduced-motion: reduce)').matches;
  const length=()=>immediate?glyphs.length:Math.min(glyphs.length,Math.max(0,Math.floor((Date.now()-openedAt!)/TYPEWRITER_INTERVAL)));
  const [count,setCount]=useState(length);
  useEffect(()=>{
    const current=length();
    setCount(current);
    if(current>=glyphs.length)return;
    const timer=window.setInterval(()=>{
      const next=length();
      setCount(next);
      if(next>=glyphs.length)window.clearInterval(timer);
    },TYPEWRITER_INTERVAL);
    return ()=>window.clearInterval(timer);
  },[glyphs,openedAt,immediate]);

  const cursor=count<glyphs.length?count-1:-1;
  return <span className="typed-question" aria-label={text}>
    <span aria-hidden="true">{glyphs.map((glyph,index)=>
      <span className="typed-glyph" key={index} data-hidden={index>=count||undefined} data-caret={index===cursor&&!/^\s+$/.test(glyph)||undefined}>{glyph}</span>
    )}</span>
  </span>;
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
  render(){return this.state.failed?<main style={{padding:'8%',fontFamily:'Arial,sans-serif',fontSize:24,lineHeight:1.5}}><h1>Этот браузер не смог открыть обычный экран</h1><p><a href={`./tv.html${location.search}`} style={{color:'#f4bd62'}}>Открыть экран для старого телевизора →</a></p><p>Ведущий продолжает управлять игрой с телефона.</p></main>:this.props.children;}
}
const root=import.meta.hot?.data.root??createRoot(document.getElementById('root')!);
if(import.meta.hot)import.meta.hot.data.root=root;
root.render(<ScreenBoundary><App/></ScreenBoundary>);
