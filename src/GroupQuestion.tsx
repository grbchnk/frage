import {CountdownFace,useRemaining} from './EstimateClock';
import {useEffect,useState} from 'react';
import {readInputs,submitInput} from './connection';
import {formatDelta} from './engine';
import {allSubmitted,questionTypes,validateInput} from './rounds';
import type {Answer,Game,InputRound,RoundInput,RoundResult,Snapshot} from './types';
import './group-question.css';

export const stageLabel=(stage:InputRound['stage'])=>
  stage==='wager'?'Финал · ставки':stage==='written'?'Финал · ответ':questionTypes[stage];

export function SharedProgress({round,players}:{round:InputRound;players:Game['players']}){
  if(round.stage==='turns'){
    const player=players.find(item=>item.id===round.queue?.[round.turn??0]);
    return <p className="shared-progress" role="status">Ход игрока <strong>{player?.name}</strong></p>;
  }
  return <ul className="shared-progress shared-players" aria-label="Кто уже ответил">
    {players.map(player=><li key={player.id} className={round.submitted.includes(player.id)?'submitted':''}>
      {round.submitted.includes(player.id)?'✓ ':''}{player.name}
    </li>)}
  </ul>;
}

export function SharedOptions({round}:{round:InputRound}){
  if(!round.options)return null;
  return <ul className="shared-options" aria-label="Варианты">
    {round.options.map(option=><li key={option.id} className={round.eliminated?.includes(option.id)?'eliminated':''}>{option.label}</li>)}
  </ul>;
}

export function RoundResults({results,players}:{results:RoundResult[];players:Game['players']}){
  if(!results.length)return <p className="shared-progress">Никто не ответил</p>;
  return <ul className="shared-results" aria-label="Результаты вопроса">
    {players.map(player=>{
      const result=results.find(item=>item.playerId===player.id);
      if(!result)return null;
      return <li key={player.id}>
        <strong>{player.name}</strong><span>{result.input??(result.timedOut?'Не успел ответить':'Без ответа')}</span>
        {result.wager!==undefined&&<span>Ставка {result.wager}</span>}
        <b className={result.delta>0?'positive':result.delta<0?'negative':''}>{formatDelta(result.delta)}</b>
      </li>;
    })}
  </ul>;
}

export function PlayerInput({round,playerId,prompt,unit,online,onAccept}:{
  round:InputRound;playerId:string;prompt?:string;unit?:string;online:boolean;onAccept:(value:Snapshot)=>void;
}){
  const [raw,setRaw]=useState('');
  const [order,setOrder]=useState(()=>round.options?.map(option=>option.id)??[]);
  const [recorded,setRecorded]=useState(false);
  const [pending,setPending]=useState(false);
  const [error,setError]=useState('');
  const done=recorded||round.submitted.includes(playerId);
  const waiting=round.stage==='turns'&&round.queue?.[round.turn??0]!==playerId;
  const remaining=useRemaining(round.deadline,round.closed);
  const expired=remaining===0;
  const disabled=pending||!online||expired;
  const numeric=round.stage==='estimate'||round.stage==='wager';
  const number=raw.trim()===''?NaN:Number(raw.trim().replace(',','.'));
  const max=round.limits?.[playerId]??0;
  const input=round.stage==='order'?order:numeric?number:raw.trim();
  async function send(value:RoundInput){
    if(disabled||waiting||done||!validateInput(round,playerId,value))return;
    setPending(true);setError('');
    try{onAccept(await submitInput(round.id,playerId,value));setRecorded(true);}
    catch(e){setError((e as Error).message);}
    finally{setPending(false);}
  }
  function move(index:number,direction:number){
    const next=[...order],to=index+direction;
    [next[index],next[to]]=[next[to],next[index]];
    setOrder(next);
  }
  return <section className="player-input">
    <span className="eyebrow">{stageLabel(round.stage)}</span>
    {prompt&&<h2>{prompt}</h2>}
    {remaining!==undefined&&!round.closed&&<CountdownFace remaining={remaining}/>}
    {done?<p role="status">Ответ принят</p>:(round.closed||expired)?<p role="status">{expired?'Время вышло':'Приём ответов завершён'}</p>:waiting?<p role="status">Ждите своей очереди</p>:
      round.stage==='choice'||round.stage==='turns'?<div className="player-options">
        {round.options?.map(option=><button key={option.id} className="secondary" disabled={disabled||round.eliminated?.includes(option.id)} onClick={()=>void send(option.id)}>{option.label}</button>)}
      </div>:<form onSubmit={event=>{event.preventDefault();void send(input);}}>
        {round.stage==='order'?<ol className="order-cards">
          {order.map((id,index)=>{
            const label=round.options?.find(option=>option.id===id)?.label;
            return <li key={id}><strong>{label}</strong>
              <button type="button" aria-label={`Поднять «${label}»`} disabled={disabled||index===0} onClick={()=>move(index,-1)}>↑</button>
              <button type="button" aria-label={`Опустить «${label}»`} disabled={disabled||index===order.length-1} onClick={()=>move(index,1)}>↓</button>
            </li>;
          })}
        </ol>:<label>{round.stage==='wager'?`Ставка от 0 до ${max}`:unit?`Ваш ответ · ${unit}`:'Ваш ответ'}
          <input aria-label="Ваш ответ" value={raw} onChange={event=>setRaw(event.target.value)} disabled={disabled} inputMode={round.stage==='estimate'?'decimal':round.stage==='wager'?'numeric':'text'} maxLength={numeric?30:300} autoComplete="off"/>
        </label>}
        <button className="primary" disabled={disabled||!validateInput(round,playerId,input)}>{round.stage==='wager'?'Зафиксировать ставку':'Отправить ответ'}</button>
      </form>}
    {error&&<p role="alert">{error}</p>}
  </section>;
}

export function GroupControls({round,players,busy,onReveal,displayOnly=false,actionLabel='Показать результаты'}:{
  round:InputRound;players:Game['players'];busy:boolean;onReveal:()=>void;displayOnly?:boolean;actionLabel?:string;
}){
  const [confirm,setConfirm]=useState(false);
  const complete=round.closed||allSubmitted(round,players);
  if(displayOnly)return <SharedProgress round={round} players={players}/>;
  return <section className="host-answer group-controls">
    <SharedProgress round={round} players={players}/>
    {round.deadline!==undefined&&!round.closed?<p>Результаты откроются, когда все ответят или время выйдет.</p>:round.stage==='turns'?<p>После выбора ход проверяется автоматически.</p>:
      <><button className="primary" disabled={busy} onClick={()=>complete||confirm?onReveal():setConfirm(true)}>
        {confirm&&!complete?(round.stage==='wager'?'Открыть вопрос без остальных ставок':'Подтвердить завершение без остальных'):actionLabel}
      </button>
      {confirm&&!complete&&<button className="text-link" onClick={()=>setConfirm(false)}>Продолжить приём ответов</button>}</>}
  </section>;
}

export function FinalReview({round,wagerId,answer,players,busy,onReview,onScore}:{
  round:InputRound;wagerId:string;answer:Answer;players:Game['players'];busy:boolean;
  onReview:()=>void;
  onScore:(inputs:Record<string,RoundInput>,wagers:Record<string,RoundInput>,correct:string[])=>void;
}){
  const [data,setData]=useState<{inputs:Record<string,RoundInput>;wagers:Record<string,RoundInput>}|null>(null);
  const [correct,setCorrect]=useState<string[]>([]);
  const [error,setError]=useState('');
  const complete=allSubmitted(round,players);
  const reviewing=!!round.closed;
  const [confirm,setConfirm]=useState(false);
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    if(!reviewing)return;
    let active=true;
    void Promise.all([readInputs(round.id),readInputs(wagerId)]).then(([inputs,wagers])=>{
      if(!active)return;
      setData({inputs,wagers});
    }).catch(e=>{if(active)setError(e.message);});
    return ()=>{active=false;};
  },[reviewing,round.id,wagerId,retry]);
  return <section className="host-answer group-controls">
    <SharedProgress round={round} players={players}/>
    {!reviewing&&<button className="primary" disabled={busy} onClick={()=>complete||confirm?onReview():setConfirm(true)}>
      {complete?'Проверить ответы':confirm?'Закрыть приём без остальных ответов':'Перейти к проверке'}
    </button>}
    {reviewing&&!data&&!error&&<p>Загружаем ответы…</p>}
    {reviewing&&error&&<button className="secondary" onClick={()=>{setError('');setRetry(value=>value+1);}}>Загрузить ответы снова</button>}
    {reviewing&&data&&<>
      <h2>{answer.answer}</h2>
      {!!answer.accepted_answers.length&&<p>Принимаем: {answer.accepted_answers.join(' · ')}</p>}
      <div className="final-review">
        {players.map(player=><label key={player.id}>
          <input type="checkbox" checked={correct.includes(player.id)} disabled={typeof data.inputs[player.id]!=='string'}
            onChange={event=>setCorrect(ids=>event.target.checked?[...ids,player.id]:ids.filter(id=>id!==player.id))}/>
          <strong>{player.name}</strong><span>{String(data.inputs[player.id]??'Без ответа')}</span>
          <span>Ставка {String(data.wagers[player.id]??0)}</span>
        </label>)}
      </div>
      <button className="primary" disabled={busy} onClick={()=>onScore(data.inputs,data.wagers,correct)}>
        {complete?'Подвести итоги':'Закончить без остальных ответов'}
      </button>
    </>}
    {error&&<p role="alert">{error}</p>}
  </section>;
}
