import {createClient} from '@supabase/supabase-js';
import type {Answer, Game, Snapshot, Participant, Buzzer, Pack} from './types';
import {initialGame,transition} from './engine';
export const demo = import.meta.env.DEV && new URLSearchParams(location.search).get('demo')==='1';
const url=import.meta.env.VITE_SUPABASE_URL;
const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase=url&&key?createClient(url,key):null;
const localKey='pasha-demo-v2';
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
      if(state.phase==='question'&&(previous.state.phase!=='question'||state.activeQuestionId!==previous.state.activeQuestionId||state.questionOpenedAt!==previous.state.questionOpenedAt)){localStorage.setItem(buzzerKey,JSON.stringify({...emptyBuzzer(),question_id:state.activeQuestionId,accepting:true}));}
      else if(state.phase==='question'&&state.winnerId!==null){const b=await readBuzzer();b.accepting=false;localStorage.setItem(buzzerKey,JSON.stringify(b));}
      else if(state.phase!=='question')localStorage.setItem(buzzerKey,JSON.stringify(emptyBuzzer()));
      if(state.phase==='lobby'&&previous.state.phase!=='lobby')localStorage.removeItem(rosterKey);
      localStorage.setItem(localKey,JSON.stringify(result));channel!.postMessage(result);return result;
    });
  }
  if(!supabase)throw new Error('Нет подключения.');
  const {data,error}=await supabase.from('quiz_game').update({state,revision:previous.revision+1,updated_at:new Date().toISOString()}).eq('id','main').eq('revision',previous.revision).select('id,state,revision');
  if(error)throw Object.assign(new Error(`Не удалось сохранить (${error.code}): ${error.message}`),{code:error.code});
  if(!data?.length)throw new Error('Игра уже изменилась или нет прав ведущего. Обновляю состояние — повторите действие.');
  return data[0] as Snapshot;
}
export function subscribeGame(receive:(s:Snapshot)=>void,status:(s:string)=>void){
  if(demo){const fn=(e:MessageEvent)=>{if(!e.data.aux)receive(e.data);};channel!.addEventListener('message',fn);status('Демо · один браузер');return ()=>channel!.removeEventListener('message',fn);}
  if(!supabase){status('Нет настройки');return ()=>{};}
  const sub=supabase.channel('svoya-main').on('postgres_changes',{event:'UPDATE',schema:'public',table:'quiz_game',filter:'id=eq.main'},payload=>receive(payload.new as Snapshot)).subscribe(s=>status(s==='SUBSCRIBED'?'В эфире':s==='CHANNEL_ERROR'||s==='TIMED_OUT'?'Переподключение…':'Соединяем…'));
  return ()=>{void supabase.removeChannel(sub);};
}
export async function loadAnswers(revision:string,count:number):Promise<Record<string,Answer>>{
  if(demo){const response=await fetch(`${import.meta.env.BASE_URL}__demo_answers`);if(!response.ok)throw new Error('Демо работает через npm run dev.');return response.json();}
  const {data,error}=await supabase!.from('quiz_answers').select('question_id,data');
  if(error||data?.length!==count)throw new Error(`Нет доступа к ${count} ответам. Добавьте аккаунт в quiz_hosts и выполните setup.sql.`);
  if(data.some(row=>row.data?.pack_revision!==revision))throw new Error('Вопросы обновлены. Выполните новый supabase/setup.sql, чтобы обновить ответы в базе, затем перезагрузите пульт.');
  return Object.fromEntries(data.map(row=>[row.question_id,row.data]));
}

const rosterKey='quiz-roster-v2', buzzerKey='quiz-buzzer-v2';
export const emptyBuzzer=():Buzzer=>({id:'main',question_id:null,window_id:crypto.randomUUID(),claimant:null,accepting:false,excluded:[]});
export async function readParticipants():Promise<Participant[]>{
  if(demo)return JSON.parse(localStorage.getItem(rosterKey)||'[]');
  const {data,error}=await supabase!.from('quiz_participants').select('id,name').order('joined_at').order('id');
  if(error)throw new Error('Обновите базу: выполните свежий supabase/setup.sql.');
  return data;
}
export async function readBuzzer():Promise<Buzzer>{
  if(demo)return JSON.parse(localStorage.getItem(buzzerKey)||'null')||emptyBuzzer();
  const {data,error}=await supabase!.from('quiz_buzzer').select('*').eq('id','main').single();
  if(error)throw new Error('Кнопки не подключены. Выполните свежий supabase/setup.sql.');
  return data;
}
async function rpc<T>(name:string,args:Record<string,unknown>):Promise<T>{
  if(!supabase)throw new Error('Нет подключения.');
  const {data,error}=await supabase.rpc(name,args);
  if(error)throw Object.assign(new Error(`${error.message} (${error.code})`),{code:error.code});
  const row=Array.isArray(data)?data[0]:data;
  if(!row)throw new Error('База не вернула результат. Повторите действие.');
  return row as T;
}
export async function joinGame(name:string):Promise<Participant>{
  if(!demo)return rpc('quiz_join',{player_name:name});
  return navigator.locks.request(localKey,async()=>{
    const clean=name.trim();if(!clean||clean.length>24)throw new Error('Имя: от 1 до 24 символов.');
    const state=readDemo().state;
    if(state.phase!=='lobby'){
      const p=state.players.find(p=>p.name.toLowerCase()===clean.toLowerCase());
      if(!p)throw new Error('Игра уже началась. Попросите ведущего начать новую партию.');return {id:p.id,name:p.name};
    }
    const rows=await readParticipants(),existing=rows.find(p=>p.name.toLowerCase()===clean.toLowerCase());
    if(existing)return existing;if(rows.length>=10)throw new Error('Уже подключились 10 игроков.');
    const p={id:crypto.randomUUID(),name:clean};localStorage.setItem(rosterKey,JSON.stringify([...rows,p]));channel!.postMessage({aux:true});return p;
  });
}
export async function buzz(playerId:string,windowId:string):Promise<Buzzer>{
  if(!demo)return rpc('quiz_buzz',{player_id:playerId,expected_window:windowId});
  return navigator.locks.request(localKey,async()=>{
    const b=await readBuzzer(),g=readDemo().state;
    if(g.phase!=='question'||g.winnerId!==null||!g.players.some(p=>p.id===playerId))throw new Error('Сейчас нажать нельзя.');
    if(b.window_id===windowId&&b.accepting&&!b.claimant&&!b.excluded.includes(playerId)){
      b.claimant=playerId;b.accepting=false;localStorage.setItem(buzzerKey,JSON.stringify(b));channel!.postMessage({aux:true});
    }
    return b;
  });
}
export async function rearm(windowId:string,previous:Snapshot,pack:Pack):Promise<{buzzer:Buzzer;snapshot:Snapshot}>{
  if(!demo)return rpc('quiz_rearm',{expected_window:windowId,expected_revision:previous.revision});
  return navigator.locks.request(localKey,async()=>{
    const b=await readBuzzer(),current=readDemo();
    if(current.revision!==previous.revision||current.state.phase!=='question'||current.state.winnerId!==null||b.window_id!==windowId||!b.claimant)throw new Error('Нажатие уже обработано.');
    const snapshot={id:'main',revision:current.revision+1,state:transition(current.state,{type:'wrong',playerId:b.claimant},pack)};
    b.excluded.push(b.claimant);b.claimant=null;b.accepting=true;b.window_id=crypto.randomUUID();
    localStorage.setItem(buzzerKey,JSON.stringify(b));localStorage.setItem(localKey,JSON.stringify(snapshot));channel!.postMessage(snapshot);channel!.postMessage({aux:true});return {buzzer:b,snapshot};
  });
}
export async function restoreGame(previous:Snapshot,state:Game,buzzer:Buzzer):Promise<Snapshot>{
  if(!demo)return rpc('quiz_restore',{expected_revision:previous.revision,desired_state:state,desired_buzzer:buzzer});
  return navigator.locks.request(localKey,async()=>{
    if(readDemo().revision!==previous.revision)throw new Error('Игра уже изменилась. Отмена недоступна.');
    const result={id:'main',revision:previous.revision+1,state};
    const restored=state.phase==='question'&&buzzer.question_id===state.activeQuestionId?{...buzzer,window_id:crypto.randomUUID()}:emptyBuzzer();
    localStorage.setItem(localKey,JSON.stringify(result));localStorage.setItem(buzzerKey,JSON.stringify(restored));channel!.postMessage(result);channel!.postMessage({aux:true});return result;
  });
}
export async function resetGame():Promise<Snapshot>{
  // Start from the database's current revision, not a potentially stale remote.
  // The existing host RPC applies the empty lobby atomically and triggers guest cleanup.
  for(let attempt=0;attempt<2;attempt++){
    const previous=await readGame();
    const state={...initialGame(),event:previous.state.event+1};
    try{
      const result=await restoreGame(previous,state,emptyBuzzer());
      if(demo){localStorage.removeItem(rosterKey);channel!.postMessage({aux:true});}
      return result;
    }catch(e){
      if(attempt===0&&(e as Error).message.includes('Игра уже изменилась'))continue;
      throw new Error(`Не удалось начать новую игру: ${(e as Error).message}`);
    }
  }
  throw new Error('Игра изменилась на другом пульте. Повторите новую игру.');
}
export function subscribeParticipants(changed:()=>void){
  if(demo){const fn=(e:MessageEvent)=>{if(e.data.aux)changed();};channel!.addEventListener('message',fn);return ()=>channel!.removeEventListener('message',fn);}
  if(!supabase)return ()=>{};
  const c=supabase.channel(`quiz-buttons-${crypto.randomUUID()}`).on('postgres_changes',{event:'*',schema:'public',table:'quiz_buzzer'},changed).on('postgres_changes',{event:'*',schema:'public',table:'quiz_participants'},changed).subscribe();
  return ()=>{void supabase.removeChannel(c);};
}
