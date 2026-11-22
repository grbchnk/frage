import {useEffect,useRef,useState} from 'react';
import {buzz,chooseFinalCategory,joinGame,showHint} from './connection';
import {findQuestion,formatDelta} from './engine';
import {PlayerInput} from './GroupQuestion';
import type {Buzzer,Game,Pack,Participant,Snapshot} from './types';
import {AnswerFlash,GAME_NAME,ScoreDelta,useAnswerFeedback} from './GameViews';

export function JoinLink(){
  const url=new URL(location.href);
  url.searchParams.set('mode','player');
  const link=url.href;
  const [qr,setQr]=useState('');
  const [copy,setCopy]=useState<'idle'|'copied'|'failed'>('idle');
  useEffect(()=>{
    let active=true;
    void import('qrcode')
      .then(({default:QRCode})=>QRCode.toDataURL(link,{width:512,margin:4,errorCorrectionLevel:'M',color:{dark:'#241544',light:'#faf5ff'}}))
      .then(value=>{if(active)setQr(value);})
      .catch(()=>{});
    return ()=>{active=false;};
  },[link]);
  async function copyLink(){
    try{await navigator.clipboard.writeText(link);setCopy('copied');}
    catch{setCopy('failed');}
  }
  return <section className="qr-card">
    <a className="qr-link" href={link} target="_blank" rel="noreferrer" aria-label="Открыть ссылку для игроков">
      {qr?<img src={qr} alt="QR-код для входа в игру"/>:<span>Ссылка для игроков ↗</span>}
    </a>
    <strong>Сканируйте, чтобы войти</strong>
    <button className="text-link" onClick={()=>void copyLink()}>{copy==='copied'?'Ссылка скопирована':'Скопировать ссылку'}</button>
    {copy==='failed'&&<a className="qr-url" href={link}>{link}</a>}
  </section>;
}

export function LobbyRoster({roster}:{roster:Participant[]}){
  return <section className="lobby-roster" aria-labelledby="lobby-roster-title">
    <h2 id="lobby-roster-title">Игроки <span>{roster.length}</span></h2>
    <div aria-live="polite">
      {roster.length?<ul className="lobby-players">{roster.map(p=>
        <li key={p.id}><span aria-hidden="true"/><strong>{p.name}</strong></li>)}</ul>:<p>Ждём игроков…</p>}
    </div>
  </section>;
}

const hostLink=new URL(location.href);
hostLink.searchParams.set('mode','host');

const buzzerLabels={idle:'Ожидаем',ready:'Можно нажать',locked:'Кнопка закрыта',won:'Вы отвечаете'};

function BuzzerIcon({mode}:{mode:keyof typeof buzzerLabels}){
  return <svg aria-hidden="true" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
    {mode==='idle'&&<><circle cx="32" cy="32" r="20"/><path d="M32 21v12l8 5"/></>}
    {mode==='ready'&&<path d="m35 9-17 26h13l-2 20 17-26H33z"/>}
    {mode==='locked'&&<><rect x="19" y="29" width="26" height="22" rx="4"/><path d="M24 29v-7a8 8 0 1 1 16 0v7m-8 10v3"/></>}
    {mode==='won'&&<path d="m17 33 10 10 21-23"/>}
  </svg>;
}

export function ParticipantScreen({state,pack,roster,buzzer,online,onUpdate,onAccept}:{state:Game;pack:Pack|null;roster:Participant[];buzzer:Buzzer;online:boolean;onUpdate:()=>Promise<void>;onAccept:(value:Snapshot)=>void}){
  const [self,setSelf]=useState<Participant|null>(()=>{try{return JSON.parse(sessionStorage.getItem('quiz-self-v2')||'null');}catch{return null;}});
  const [name,setName]=useState(self?.name||'');
  const [pending,setPending]=useState(false);
  const [error,setError]=useState('');
  const [claim,setClaim]=useState<Buzzer|null>(null);
  const pressing=useRef(false);
  const [depressed,setDepressed]=useState(false);
  const releaseTimer=useRef<number|null>(null);
  useEffect(()=>()=>{if(releaseTimer.current!==null)window.clearTimeout(releaseTimer.current);},[]);
  const player=state.players.find(p=>p.id===self?.id);
  const joined=state.phase==='lobby'?roster.some(p=>p.id===self?.id):!!player;
  const visibleBuzzer=claim?.window_id===buzzer.window_id?claim:buzzer;
  const question=state.phase==='question';
  const activeQuestion=pack?findQuestion(pack,state.activeQuestionId):undefined;
  const inputRound=question||state.phase==='final'?state.inputRound:undefined;
  const result=state.results?.find(item=>item.playerId===self?.id);
  const finalCategory=state.phase==='final'&&state.final?.stage==='category';
  const currentWindow=question&&visibleBuzzer.question_id===state.activeQuestionId;
  const respondent=currentWindow?state.players.find(p=>p.id===visibleBuzzer.claimant):undefined;
  const mode=!question?'idle':respondent&&respondent.id===self?.id?'won':
    online&&currentWindow&&visibleBuzzer.accepting&&!respondent?'ready':'locked';
  const feedback=useAnswerFeedback(state.feedback);
  const feedbackName=state.players.find(p=>p.id===feedback?.playerId)?.name;
  const status=!online?'Восстанавливаем соединение…':
    feedback?.kind==='correct'?(feedback.playerId===self?.id?'Вы ответили верно':`${feedbackName} · верный ответ`):
    feedback?.kind==='wrong'&&!respondent?(feedback.playerId===self?.id?'Неверно. Можно нажать снова':`${feedbackName} · неверный ответ`):
    mode==='won'?'Ведущий ждёт ваш ответ':respondent?`Отвечает ${respondent.name}`:
    inputRound?'Ответьте на телефоне':
    question?(mode==='ready'?'Вопрос открыт':'Ожидаем открытия кнопок'):
    state.phase==='board'?`Тему выбирает ${state.players[state.turnIndex]?.name??'ведущий'}`:
    state.phase==='answer'?'Ответ открыт':state.phase==='final'?'Финальный вопрос':state.phase==='finished'?'Игра окончена':'Ожидаем начала игры';
  const delta=player&&state.scoreChanges?.[player.id];

  async function press(){
    if(mode!=='ready'||inputRound||pressing.current||!self)return;
    pressing.current=true;
    setPending(true);setDepressed(true);setError('');navigator.vibrate?.(35);
    if(releaseTimer.current!==null)window.clearTimeout(releaseTimer.current);
    releaseTimer.current=window.setTimeout(()=>{setDepressed(false);releaseTimer.current=null;},170);
    try{setClaim(await buzz(self.id,visibleBuzzer.window_id));await onUpdate();}
    catch(e){setError((e as Error).message);await onUpdate().catch(()=>{});}
    finally{pressing.current=false;setPending(false);}
  }
  async function hint(){
    if(!self||pending||mode!=='won'||state.hint)return;
    setPending(true);setError('');
    try{onAccept(await showHint(self.id,visibleBuzzer.window_id));}
    catch(e){setError((e as Error).message);}
    finally{setPending(false);}
  }
  async function chooseTopic(id:string){
    if(!self||!pack||!online||pending)return;
    setPending(true);setError('');
    try{onAccept(await chooseFinalCategory(self.id,id,pack));}
    catch(e){setError((e as Error).message);}
    finally{setPending(false);}
  }
  async function join(){
    setPending(true);setError('');
    try{const participant=await joinGame(name);sessionStorage.setItem('quiz-self-v2',JSON.stringify(participant));setSelf(participant);await onUpdate();}
    catch(e){setError((e as Error).message);}
    finally{setPending(false);}
  }
  return <main className={`participant-screen participant-${mode} ${joined?'participant-joined':''}`}>
    {!joined?<form className="participant-join" onSubmit={e=>{e.preventDefault();void join();}}>
      <span className="eyebrow">{GAME_NAME}</span><h1>Как тебя зовут?</h1>
      <input aria-label="Ваше имя" placeholder="Имя" maxLength={24} autoComplete="given-name" required value={name} onChange={e=>setName(e.target.value)}/>
      <button className="primary" disabled={pending||!name.trim()}>{pending?'Подключаем…':'В игру →'}</button>
      <a className="text-link" href={hostLink.href}>Открыть пульт ведущего</a>
    </form>:<>
      {feedback&&<AnswerFlash key={feedback.event} kind={feedback.kind}/>}
      <header className="participant-header"><h1>{self?.name}</h1><div><strong>{(player?.score??0).toLocaleString('ru-RU')}</strong><span>баллов</span>{delta!==undefined&&<ScoreDelta delta={delta}/>}</div></header>
      {inputRound?<PlayerInput key={inputRound.id} round={inputRound} playerId={self!.id} online={online} onAccept={onAccept}
        prompt={question?activeQuestion?.prompt:state.final?.prompt} unit={activeQuestion?.unit}/>:finalCategory?
        <section className="player-input"><h2>Финальная категория</h2>
          {state.final?.chooser===self?.id?<div className="player-options">{pack?.finals?.map(topic=>
            <button key={topic.id} className="secondary" disabled={!online||pending} onClick={()=>void chooseTopic(topic.id)}>{topic.title}</button>)}</div>:
            <p>Выбирает {state.players.find(player=>player.id===state.final?.chooser)?.name}</p>}
        </section>:result&&(state.phase==='answer'||state.final?.stage==='result')?
        <section className="player-input"><h2>{formatDelta(result.delta)}</h2><p>{state.revealed?.answer}</p></section>:
        <div className="buzzer-stage">
        <button className={`buzzer-button ${mode} ${depressed?'pressed':''}`} disabled={mode!=='ready'||pending}
          onPointerDown={e=>{if(e.button===0){e.preventDefault();void press();}}}
          onClick={()=>void press()} aria-label={buzzerLabels[mode]}>
          <BuzzerIcon mode={mode}/><span>{buzzerLabels[mode]}</span>
        </button>
        {question&&activeQuestion?.hasHint&&<button className="text-link hint-button" disabled={mode!=='won'||pending||!online||!!state.hint}
          onClick={()=>void hint()}>{state.hint?'Подсказка открыта':'Подсказка'}</button>}
      </div>}
      {(!inputRound||!online)&&!finalCategory&&<footer className="participant-status" role="status">{status}</footer>}
    </>}
    {error&&<p className="participant-error" role="alert">{error}</p>}
  </main>;
}
