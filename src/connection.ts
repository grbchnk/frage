import {createClient} from '@supabase/supabase-js';
import type {Answer, Game, Snapshot} from './types';
import {initialGame} from './engine';
export const demo = import.meta.env.DEV && new URLSearchParams(location.search).get('demo')==='1';
const url=import.meta.env.VITE_SUPABASE_URL;
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase=url&&key?createClient(url,key):null;
const localKey='svoya-demo-v1';
const channel=demo?new BroadcastChannel(localKey):null;
export function readDemo():Snapshot {return JSON.parse(localStorage.getItem(localKey)||'null')||{id:'main',revision:0,state:initialGame()};}
export async function readGame():Promise<Snapshot>{
  if(demo)return readDemo();
  if(!supabase)throw new Error('Не настроено подключение. См. README → Supabase.');
  const {data,error}=await supabase.from('quiz_game').select('id,state,revision').eq('id','main').single();
  if(error)throw Object.assign(new Error(error.code==='PGRST205'?'База ещё не настроена. Выполните supabase/setup.sql в SQL Editor.':`Не удалось загрузить игру (${error.code}). Проверьте соединение и настройку Supabase.`),{code:error.code});
  return data as Snapshot;
}
export async function saveGame(previous:Snapshot,state:Game):Promise<Snapshot>{
  if(demo){
    // Web Locks serialize writes across local demo tabs, matching server CAS semantics.
    return navigator.locks.request(localKey,async()=>{
      if(readDemo().revision!==previous.revision)throw new Error('Игра уже изменилась в другой вкладке. Повторите действие.');
      const result={id:'main',revision:previous.revision+1,state};
      localStorage.setItem(localKey,JSON.stringify(result));channel!.postMessage(result);return result;
    });
  }
  if(!supabase)throw new Error('Нет подключения.');
  const {data,error}=await supabase.from('quiz_game').update({state,revision:previous.revision+1,updated_at:new Date().toISOString()}).eq('id','main').eq('revision',previous.revision).select('id,state,revision');
  if(error)throw new Error(`Не удалось сохранить (${error.code}). Проверьте сеть и права ведущего.`);
  if(!data?.length)throw new Error('Игра уже изменилась или нет прав ведущего. Обновляю состояние — повторите действие.');
  return data[0] as Snapshot;
}
export function subscribeGame(receive:(s:Snapshot)=>void,status:(s:string)=>void){
  if(demo){const fn=(e:MessageEvent)=>receive(e.data);channel!.addEventListener('message',fn);status('Демо · один браузер');return ()=>channel!.removeEventListener('message',fn);}
  if(!supabase){status('Нет настройки');return ()=>{};}
  const sub=supabase.channel('svoya-main').on('postgres_changes',{event:'UPDATE',schema:'public',table:'quiz_game',filter:'id=eq.main'},payload=>receive(payload.new as Snapshot)).subscribe(s=>status(s==='SUBSCRIBED'?'В эфире':s==='CHANNEL_ERROR'||s==='TIMED_OUT'?'Переподключение…':'Соединяем…'));
  return ()=>{void supabase.removeChannel(sub);};
}
export async function loadAnswers(revision:string):Promise<Record<string,Answer>>{
  if(demo){const response=await fetch(`${import.meta.env.BASE_URL}__demo_answers`);if(!response.ok)throw new Error('Демо работает через npm run dev.');return response.json();}
  const {data,error}=await supabase!.from('quiz_answers').select('question_id,data');
  if(error||data?.length!==100)throw new Error('Нет доступа к 100 ответам. Добавьте аккаунт в quiz_hosts и выполните setup.sql.');
  if(data.some(row=>row.data?.pack_revision!==revision))throw new Error('Вопросы обновлены. Выполните новый supabase/setup.sql, чтобы обновить ответы в базе, затем перезагрузите пульт.');
  return Object.fromEntries(data.map(row=>[row.question_id,row.data]));
}
