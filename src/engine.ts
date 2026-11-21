import type { Answer, Game, Pack, Question } from './types';
export const initialGame = (): Game => ({phase:'lobby', players:[], turnIndex:0, roundIndex:0, completed:[], activeQuestionId:null, revealed:null, winnerId:null, questionEndsAt:null, breakEndsAt:null, event:0, questionsPerCategory:5, categoryIds:[], questionOpenedAt:null,activeQuestionValue:null,scoreChanges:{}});
export const findQuestion = (pack: Pack, id: string | null): Question | undefined => pack.categories.flatMap(c=>c.questions).find(q=>q.id===id);
export const roundCategories = (pack: Pack, state: Game) => (state.categoryIds?.length ? state.categoryIds : pack.rounds[state.roundIndex]?.category_ids || []).map(id=>pack.categories.find(c=>c.id===id)!).filter(Boolean);
export function chooseCategories(pack:Pack, random= Math.random):number[]{
  const ids=pack.categories.map(c=>c.id);
  for(let i=ids.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]];}
  return ids.slice(0,10);
}
export function available(pack: Pack, state: Game, id: string) {
  if (state.phase!=='board') return false;
  const cat=roundCategories(pack,state).find(c=>c.questions.some(q=>q.id===id));
  return !!cat && !state.completed.includes(id) && cat.questions.filter(q=>state.completed.includes(q.id)).length<state.questionsPerCategory;
}
export type Action = {type:'start'; names:string[]; limit:number; participants?:{id:string;name:string}[]; categoryIds?:number[]}|{type:'open'; id:string}|{type:'award'; playerId:string|null; answer:Answer}|{type:'wrong';playerId:string}|{type:'continue'}|{type:'cancel'}|{type:'endRound'}|{type:'reset'};
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
      if(ids.length!==10||new Set(ids).size!==10||ids.some(id=>!pack.categories.some(c=>c.id===id)))return fail();
      next.categoryIds=ids;
      next.players=names.map((name,i)=>({id:action.participants?.find(p=>p.name.toLowerCase()===name.toLowerCase())?.id||`p${i+1}`,name,score:0})); next.phase='board';next.questionsPerCategory=action.limit;break;
    }
    case 'open': {
      if(!available(pack,state,action.id)) return fail();
      const q=findQuestion(pack,action.id)!;
      next.phase='question';next.activeQuestionId=q.id;next.activeQuestionValue=q.value;next.questionOpenedAt=now;next.questionEndsAt=now+q.time_seconds*1000;next.revealed=null;next.winnerId=null;next.scoreChanges={};break;
    }
    case 'wrong': {
      if(state.phase!=='question')return fail();
      const q=findQuestion(pack,state.activeQuestionId),player=next.players.find(p=>p.id===action.playerId);
      if(!q||!player)return fail();player.score-=q.value/2;next.scoreChanges={...next.scoreChanges,[player.id]:-q.value/2};break;
    }
    case 'award': {
      if(state.phase!=='question') return fail();
      const q=findQuestion(pack,state.activeQuestionId); if(!q||!action.answer?.answer) return fail();
      if(action.playerId!==null){const player=next.players.find(p=>p.id===action.playerId);if(!player)return fail();player.score+=q.value;next.scoreChanges={...next.scoreChanges,[player.id]:q.value};}
      next.winnerId=action.playerId;next.revealed={answer:action.answer.answer,explanation:action.answer.explanation,accepted_answers:[],host_note:''};next.phase='answer';break;
    }
    case 'continue': {
      if(state.phase!=='answer'||!state.activeQuestionId) return fail();
      next.completed.push(state.activeQuestionId);
      // The last correct respondent chooses next. With no winner, keep the chooser.
      if(state.winnerId!==null){
        const winnerIndex=state.players.findIndex(p=>p.id===state.winnerId);
        if(winnerIndex>=0)next.turnIndex=winnerIndex;
      }
      next.activeQuestionId=null;next.revealed=null;next.winnerId=null;next.questionEndsAt=null;
      const done=roundCategories(pack,next).every(c=>c.questions.filter(q=>next.completed.includes(q.id)).length>=next.questionsPerCategory);
      next.phase=done?'finished':'board';
      break;
    }
    case 'cancel': if(state.phase!=='question')return fail();next.phase='board';next.activeQuestionId=null;next.questionEndsAt=null;break;
    case 'endRound': if(state.phase!=='board')return fail();next.phase='finished';break;
    case 'reset': return {...initialGame(),event:state.event+1};
  }
  next.event=state.event+1; return next;
}
