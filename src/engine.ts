import type { Answer, Game, Pack, Question } from './types';
export const initialGame = (): Game => ({phase:'lobby', players:[], turnIndex:0, roundIndex:0, completed:[], activeQuestionId:null, revealed:null, winnerId:null, questionEndsAt:null, breakEndsAt:null, event:0, questionsPerCategory:5, categoryIds:[], questionOpenedAt:null,activeQuestionValue:null,scoreChanges:{},feedback:null});
export const findQuestion = (pack: Pack, id: string | null): Question | undefined => pack.categories.flatMap(c=>c.questions).find(q=>q.id===id);
export const roundCategories = (pack: Pack, state: Game) => (state.categoryIds?.length ? state.categoryIds : pack.rounds[state.roundIndex]?.category_ids || []).map(id=>pack.categories.find(c=>c.id===id)!).filter(Boolean);
export function chooseCategories(pack:Pack, random=Math.random, count=10):number[]{
  const ids=pack.categories.map(c=>c.id);
  for(let i=ids.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]];}
  return ids.slice(0,count);
}
export function available(pack: Pack, state: Game, id: string) {
  if (state.phase!=='board') return false;
  const cat=roundCategories(pack,state).find(c=>c.questions.some(q=>q.id===id));
  return !!cat && !state.completed.includes(id) && cat.questions.filter(q=>state.completed.includes(q.id)).length<state.questionsPerCategory;
}
export const BOARD_PAGE_SIZE=10;
export type Action = {type:'boardPage';page:number}|{type:'start'; names:string[]; limit:number; participants?:{id:string;name:string}[]; categoryIds?:number[]}|{type:'open'; id:string}|{type:'award';playerId:string}|{type:'correct';playerId:string;answer:Answer}|{type:'reveal';answer:Answer}|{type:'adjustScore';playerId:string;delta:number}|{type:'wrong';playerId:string}|{type:'continue'}|{type:'cancel'}|{type:'endRound'}|{type:'reset'};
export function transition(state:Game, action:Action, pack:Pack, now=Date.now()):Game {
  const next=structuredClone(state);
  const fail=()=>{throw new Error('Действие уже выполнено или сейчас недоступно.');};
  switch(action.type){
    case 'start': {
      if(state.phase!=='lobby') return fail();
      const names=action.names.map(n=>n.trim()).filter(Boolean);
      if(names.length<2||names.length>10||new Set(names.map(n=>n.toLowerCase())).size!==names.length||names.some(n=>n.length>24)) throw new Error('Нужно 2–10 разных имён, до 24 символов.');
      if(![3,5].includes(action.limit)) return fail();
      const ids=action.categoryIds||chooseCategories(pack);
      if(!ids.length||new Set(ids).size!==ids.length||ids.some(id=>!pack.categories.some(c=>c.id===id)))return fail();
      next.categoryIds=ids;
      next.players=names.map((name,i)=>({id:action.participants?.find(p=>p.name.toLowerCase()===name.toLowerCase())?.id||`p${i+1}`,name,score:0})); next.phase='board';next.questionsPerCategory=action.limit;break;
    }
    case 'boardPage':
      if(state.phase!=='board'||!Number.isInteger(action.page)||action.page<0||action.page>=Math.ceil(roundCategories(pack,state).length/BOARD_PAGE_SIZE))return fail();
      next.boardPage=action.page;
      break;
    case 'open': {
      if(!available(pack,state,action.id)) return fail();
      const q=findQuestion(pack,action.id)!;
      next.phase='question';next.activeQuestionId=q.id;next.activeQuestionValue=q.value;next.questionOpenedAt=now;next.questionEndsAt=now+q.time_seconds*1000;next.revealed=null;next.winnerId=null;next.scoreChanges={};next.feedback=null;break;
    }
    case 'wrong': {
      if(state.phase!=='question'||state.winnerId!==null)return fail();
      const q=findQuestion(pack,state.activeQuestionId),player=next.players.find(p=>p.id===action.playerId);
      if(!q||!player||!Number.isSafeInteger(player.score-q.value/2))return fail();
      player.score-=q.value/2;
      next.scoreChanges={...state.scoreChanges,[player.id]:(state.scoreChanges?.[player.id]??0)-q.value/2};
      next.feedback={kind:'wrong',playerId:player.id,event:state.event+1,at:now};
      break;
    }
    case 'award': {
      if(state.phase!=='question'||state.winnerId!==null)return fail();
      const q=findQuestion(pack,state.activeQuestionId),player=next.players.find(p=>p.id===action.playerId);
      if(!q||!player||!Number.isSafeInteger(player.score+q.value))return fail();
      player.score+=q.value;next.winnerId=player.id;next.scoreChanges={...state.scoreChanges,[player.id]:(state.scoreChanges?.[player.id]??0)+q.value};break;
    }
    case 'correct': {
      if(!action.answer?.answer)return fail();
      const awarded=transition(state,{type:'award',playerId:action.playerId},pack,now);
      return {...transition(awarded,{type:'reveal',answer:action.answer},pack,now),
        event:state.event+1,feedback:{kind:'correct',playerId:action.playerId,event:state.event+1,at:now}};
    }
    case 'reveal': {
      if(state.phase!=='question'||!action.answer?.answer)return fail();
      if(state.winnerId&&state.feedback?.kind!=='correct')next.feedback={kind:'correct',playerId:state.winnerId,event:state.event+1,at:now};
      next.revealed={answer:action.answer.answer,explanation:action.answer.explanation,accepted_answers:[],host_note:''};next.phase='answer';break;
    }
    case 'adjustScore': {
      const player=next.players.find(p=>p.id===action.playerId);
      if(state.phase==='lobby'||!player||!Number.isSafeInteger(action.delta)||!action.delta||!Number.isSafeInteger(player.score+action.delta))return fail();
      player.score+=action.delta;break;
    }
    case 'continue': {
      if(state.phase!=='answer'||!state.activeQuestionId) return fail();
      next.completed.push(state.activeQuestionId);
      // The last correct respondent chooses next. With no winner, keep the chooser.
      if(state.winnerId!==null){
        const winnerIndex=state.players.findIndex(p=>p.id===state.winnerId);
        if(winnerIndex>=0)next.turnIndex=winnerIndex;
      }
      next.activeQuestionId=null;next.revealed=null;next.winnerId=null;next.questionEndsAt=null;next.feedback=null;
      const done=roundCategories(pack,next).every(c=>c.questions.filter(q=>next.completed.includes(q.id)).length>=next.questionsPerCategory);
      next.phase=done?'finished':'board';
      break;
    }
    case 'cancel': if(state.phase!=='question'||state.winnerId!==null)return fail();next.phase='board';next.activeQuestionId=null;next.questionEndsAt=null;next.feedback=null;break;
    case 'endRound': if(state.phase!=='board')return fail();next.phase='finished';break;
    case 'reset': return {...initialGame(),event:state.event+1};
  }
  next.event=state.event+1; return next;
}

export function rankPlayers(players:Game['players']) {
  const sorted=[...players].sort((a,b)=>b.score-a.score);
  let rank=0;
  return sorted.map((player,index)=>{
    if(index===0||player.score!==sorted[index-1].score)rank=index+1;
    return {...player,rank};
  });
}

export const formatDelta=(delta:number)=>delta>0?`+${delta.toLocaleString('ru-RU')}`:delta<0?`−${Math.abs(delta).toLocaleString('ru-RU')}`:'0';
