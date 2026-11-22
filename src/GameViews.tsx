import {useEffect,useState} from 'react';
import {formatDelta,rankPlayers} from './engine';
import type {Category,Game} from './types';

export const GAME_NAME='Кто первый?';

export function VisualCategory({category}:{category:Category}){
  if(!category.questions.some(question=>question.media))return null;
  return <svg className="visual-category" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Категория с картинками"><title>Категория с картинками</title><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="9" r="1.3"/><path d="m4 17 4-4 3 3 4.5-5L21 16"/></svg>;
}

export function Place({rank}:{rank:number}){
  const title=['','Золото','Серебро','Бронза'][rank];
  if(!title)return <span className="place place-other" aria-label={`Место ${rank}`}>{rank}</span>;
  return <span className={`place place-${rank}`} title={title} aria-label={`Место ${rank}, ${title}`}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 1h5l2 5 2-5h5l-4 9H9z" opacity=".6"/><circle cx="12" cy="15" r="7.5" fill="currentColor"/></svg>
    <b aria-hidden="true">{rank}</b>
  </span>;
}

export function BoardCrown({rank}:{rank:number}){
  return <svg className="board-crown" data-rank={rank} viewBox="0 0 32 28" role="img" aria-label={`Место ${rank}`}>
    <path d="M3 7 9 13 16 3 23 13 29 7 26 22H6Z" fill="var(--crown-fill)" stroke="var(--crown-edge)" strokeWidth="1.3" strokeLinejoin="round"/>
    <path d="M7 25h18" stroke="var(--crown-light)" strokeWidth="2.4" strokeLinecap="round"/>
    <path d="m9 13 2 8h4l1-17z" fill="var(--crown-light)"/>
    <circle cx="3" cy="7" r="2" fill="var(--crown-light)"/>
    <circle cx="16" cy="3" r="2.5" fill="var(--crown-light)"/>
    <circle cx="29" cy="7" r="2" fill="var(--crown-light)"/>
  </svg>;
}

export function ScoreDelta({delta}:{delta:number}){
  return <span className={`score-change ${delta>0?'positive':delta<0?'negative':'neutral'}`} aria-label={`За последний вопрос: ${formatDelta(delta)}`}>{formatDelta(delta)}</span>;
}

export function useAnswerFeedback(feedback:Game['feedback']){
  const [visible,setVisible]=useState(false);
  useEffect(()=>{
    const remaining=1750-Math.max(0,Date.now()-(feedback?.at??0));
    setVisible(remaining>0);
    if(remaining<=0)return;
    const timer=window.setTimeout(()=>setVisible(false),remaining);
    return ()=>window.clearTimeout(timer);
  },[feedback?.event,feedback?.at]);
  return visible?feedback:null;
}

export function AnswerFlash({kind}:{kind:'correct'|'wrong'}){
  return <div className={`answer-flash ${kind}`} aria-hidden="true"/>;
}

export function Finale({players,reset}:{players:Game['players'];reset?:()=>void}){
  const ranked=rankPlayers(players);
  const winners=ranked.filter(p=>p.rank===1);
  return <main className="results">
    <section className="results-winner">
      <svg className="results-cup" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 12h24v13a12 12 0 0 1-24 0V12Zm0 5H11v5a9 9 0 0 0 9 9m24-14h9v5a9 9 0 0 1-9 9M32 37v11m-10 5h20m-22 4h24"/><path d="M32 18v11m-5-5.5h10" opacity=".65"/></svg>
      <h1>{winners.length===1?'Победитель':'Победители'}</h1>
      <p className="winner-names">{winners.map(p=><span key={p.id}>{p.name}</span>)}</p>
      {winners.length>0&&<p className="results-points">{winners[0].score.toLocaleString('ru-RU')} <span>баллов</span></p>}
      {reset&&<button className="primary" onClick={reset}>Новая игра <span aria-hidden="true">→</span></button>}
    </section>
    <section className="results-table">
      <h2>Итоговый счёт</h2>
      <ol>{ranked.map(p=><li key={p.id} className={p.rank===1?'first':''}><Place rank={p.rank}/><strong>{p.name}</strong><span>{p.score.toLocaleString('ru-RU')}</span></li>)}</ol>
    </section>
  </main>;
}
