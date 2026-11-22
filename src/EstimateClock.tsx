import {useEffect,useState} from 'react';
import {ESTIMATE_SECONDS} from './rounds';

export function useRemaining(deadline:number|undefined,closed?:boolean){
  const [now,setNow]=useState(Date.now);
  useEffect(()=>{
    setNow(Date.now());
    if(deadline===undefined||closed)return;
    const refresh=()=>{
      const next=Date.now();
      setNow(next);
      if(next>=deadline)clearInterval(interval);
    };
    const interval=window.setInterval(refresh,100);
    return ()=>clearInterval(interval);
  },[deadline,closed]);
  if(deadline===undefined)return undefined;
  return closed?0:Math.min(ESTIMATE_SECONDS*1000,Math.max(0,deadline-now));
}

export function CountdownFace({remaining}:{remaining:number}){
  const seconds=Math.ceil(remaining/1000);
  return <div className={`estimate-clock ${seconds<=5?'urgent':''}`}>
    <div className="estimate-clock-time" aria-hidden="true"><strong>{String(seconds).padStart(2,'0')}</strong><span>сек</span></div>
    <progress max={ESTIMATE_SECONDS*1000} value={remaining} aria-label={`Осталось ${seconds} секунд`}/>
  </div>;
}

export function EstimateClock({deadline,closed,onSecond}:{
  deadline:number;closed?:boolean;onSecond?:(seconds:number)=>void;
}){
  const remaining=useRemaining(deadline,closed)??0;
  const seconds=Math.ceil(remaining/1000);
  useEffect(()=>{
    if(!closed&&seconds<=5)onSecond?.(seconds);
  },[seconds,closed,onSecond]);
  return closed?null:<CountdownFace remaining={remaining}/>;
}
