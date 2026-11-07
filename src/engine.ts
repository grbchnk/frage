import type { Answer, Game, Pack, Question } from './types';
export const initialGame = (): Game => ({phase:'lobby', players:[], turnIndex:0, roundIndex:0, completed:[], activeQuestionId:null, revealed:null, winnerId:null, questionEndsAt:null, breakEndsAt:null, event:0, questionsPerCategory:5});
export const findQuestion = (pack: Pack, id: string | null): Question | undefined => pack.categories.flatMap(c=>c.questions).find(q=>q.id===id);
export const roundCategories = (pack: Pack, state: Game) => pack.rounds[state.roundIndex].category_ids.map(id=>pack.categories.find(c=>c.id===id)!);
export function available(pack: Pack, state: Game, id: string) {
  if (state.phase!=='board') return false;
  const cat=roundCategories(pack,state).find(c=>c.questions.some(q=>q.id===id));
  return !!cat && !state.completed.includes(id) && cat.questions.filter(q=>state.completed.includes(q.id)).length<state.questionsPerCategory;
}
export type Action = {type:'start'; names:string[]; limit:number}|{type:'open'; id:string}|{type:'award'; playerId:string|null; answer:Answer}|{type:'continue'}|{type:'cancel'}|{type:'resume'}|{type:'endRound'}|{type:'reset'};
export function transition(state:Game, action:Action, pack:Pack, now=Date.now()):Game {
  const next=structuredClone(state);
  const fail=()=>{throw new Error('Действие уже выполнено или сейчас недоступно.');};
  switch(action.type){
    case 'start': {
      if(state.phase!=='lobby') return fail();
      const names=action.names.map(n=>n.trim()).filter(Boolean);
      if(names.length<2||names.length>10||new Set(names.map(n=>n.toLowerCase())).size!==names.length||names.some(n=>n.length>24)) throw new Error('Нужно 2–10 разных имён, до 24 символов.');
      if(![3,5].includes(action.limit)) return fail();
      next.players=names.map((name,i)=>({id:`p${i+1}`,name,score:0})); next.phase='board';next.questionsPerCategory=action.limit;break;
    }
    case 'open': {
      if(!available(pack,state,action.id)) return fail();
      const q=findQuestion(pack,action.id)!;
      next.phase='question';next.activeQuestionId=q.id;next.questionEndsAt=now+q.time_seconds*1000;next.revealed=null;next.winnerId=null;break;
    }
    case 'award': {
      if(state.phase!=='question') return fail();
      const q=findQuestion(pack,state.activeQuestionId); if(!q||!action.answer?.answer) return fail();
      if(action.playerId!==null){const player=next.players.find(p=>p.id===action.playerId);if(!player)return fail();player.score+=q.value;}
      next.winnerId=action.playerId;next.revealed={answer:action.answer.answer,explanation:action.answer.explanation,accepted_answers:[],host_note:''};next.phase='answer';break;
    }
    case 'continue': {
      if(state.phase!=='answer'||!state.activeQuestionId) return fail();
      next.completed.push(state.activeQuestionId);next.turnIndex=(state.turnIndex+1)%state.players.length;
      next.activeQuestionId=null;next.revealed=null;next.winnerId=null;next.questionEndsAt=null;
      const done=roundCategories(pack,next).every(c=>c.questions.filter(q=>next.completed.includes(q.id)).length>=next.questionsPerCategory);
      next.phase=done?(state.roundIndex===0?'break':'finished'):'board';
      if(next.phase==='break')next.breakEndsAt=now+600000;break;
    }
    case 'cancel': if(state.phase!=='question')return fail();next.phase='board';next.activeQuestionId=null;next.questionEndsAt=null;break;
    case 'resume': if(state.phase!=='break')return fail();next.roundIndex=1;next.phase='board';next.breakEndsAt=null;break;
    case 'endRound': if(state.phase!=='board')return fail();next.phase=state.roundIndex===0?'break':'finished';if(next.phase==='break')next.breakEndsAt=now+600000;break;
    case 'reset': return {...initialGame(),event:state.event+1};
  }
  next.event=state.event+1; return next;
}
