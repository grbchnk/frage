import type { Answer, Game, Pack, Question, RoundInput, RoundResult } from './types';
import {newInputRound,openInputRound,prices,publishedAnswer,scoreGroup,validateInput} from './rounds';
export const initialGame = (): Game => ({phase:'lobby', players:[], turnIndex:0, roundIndex:0, completed:[], activeQuestionId:null, revealed:null, winnerId:null, event:0, questionsPerCategory:5, categoryIds:[], questionOpenedAt:null,activeQuestionValue:null,scoreChanges:{},feedback:null});
export const findQuestion = (pack: Pack, id: string | null): Question | undefined => pack.categories.flatMap(c=>c.questions).find(q=>q.id===id);
export const roundCategories = (pack: Pack, state: Game) => (state.categoryIds?.length ? state.categoryIds : pack.rounds[state.roundIndex]?.category_ids || []).map(id=>pack.categories.find(c=>c.id===id)!).filter(Boolean).map(category=>state.selectedQuestions?{...category,questions:prices.map(price=>category.questions.find(q=>q.value===price&&state.selectedQuestions!.includes(q.id))).filter((q):q is Question=>!!q)}:category);
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
export type Action = {type:'boardPage';page:number}|{type:'start'; names:string[]; limit:number; participants?:{id:string;name:string}[]; categoryIds?:number[]; selectedQuestions?:string[]; final?:boolean}|{type:'open'; id:string; answer?:Answer; roundId?:string}|{type:'award';playerId:string}|{type:'correct';playerId:string;answer:Answer}|{type:'reveal';answer:Answer}|{type:'adjustScore';playerId:string;delta:number}|{type:'wrong';playerId:string}|{type:'continue'}|{type:'cancel'}|{type:'endRound'}|{type:'reset'}
  |{type:'closeInputs'; roundId:string}
  |{type:'scoreRound'; inputs:Record<string,RoundInput>; answer:Answer}
  |{type:'chooseFinal'; playerId:string; categoryId:string; roundId:string}
  |{type:'openFinal'; questionId:string; prompt:string; roundId:string}
  |{type:'scoreFinal'; inputs:Record<string,RoundInput>; wagers:Record<string,RoundInput>; correct:string[]; answer:Answer}
  |{type:'finishFinal'};
export function transition(state:Game, action:Action, pack:Pack, now=Date.now()):Game {
  const next=structuredClone(state);
  const fail=()=>{throw new Error('Действие уже выполнено или сейчас недоступно.');};
  function applyResults(results:RoundResult[]){
    for(const result of results){
      const player=next.players.find(p=>p.id===result.playerId);
      if(!player||!Number.isSafeInteger(player.score+result.delta))return fail();
      player.score+=result.delta;
      next.scoreChanges[result.playerId]=(next.scoreChanges[result.playerId]??0)+result.delta;
    }
    next.results=[...(state.results??[]),...results];
  }
  function finishRound(){
    const leader=rankPlayers(next.players)[0];
    if(next.final?.enabled&&leader&&pack.finals?.length){
      next.phase='final';
      next.final={enabled:true,stage:'category',chooser:leader.id,categories:pack.finals.map(category=>category.id)};
      next.results=undefined;
      next.scoreChanges={};
    }else next.phase='finished';
  }
  switch(action.type){
    case 'start': {
      if(state.phase!=='lobby') return fail();
      const names=action.names.map(n=>n.trim()).filter(Boolean);
      if(names.length<2||names.length>10||new Set(names.map(n=>n.toLowerCase())).size!==names.length||names.some(n=>n.length>24)) throw new Error('Нужно 2–10 разных имён, до 24 символов.');
      if(![3,5].includes(action.limit)) return fail();
      const ids=action.categoryIds||chooseCategories(pack);
      if(!ids.length||new Set(ids).size!==ids.length||ids.some(id=>!pack.categories.some(c=>c.id===id)))return fail();
      next.categoryIds=ids;
      if(action.selectedQuestions){
        next.selectedQuestions=action.selectedQuestions;
        if(new Set(next.selectedQuestions).size!==ids.length*prices.length||
          next.selectedQuestions.length!==ids.length*prices.length||
          roundCategories(pack,next).some(category=>category.questions.length!==prices.length))return fail();
      }
      if(action.final&&pack.finals?.length)next.final={enabled:true};
      next.players=names.map((name,i)=>({id:action.participants?.find(p=>p.name.toLowerCase()===name.toLowerCase())?.id||`p${i+1}`,name,score:0})); next.phase='board';next.questionsPerCategory=action.limit;break;
    }
    case 'boardPage':
      if(state.phase!=='board'||!Number.isInteger(action.page)||action.page<0||action.page>=Math.ceil(roundCategories(pack,state).length/BOARD_PAGE_SIZE))return fail();
      next.boardPage=action.page;
      break;
    case 'open': {
      if(!available(pack,state,action.id)) return fail();
      const q=findQuestion(pack,action.id)!;
      next.phase='question';next.activeQuestionId=q.id;next.activeQuestionValue=q.value;next.questionOpenedAt=now;next.revealed=null;next.winnerId=null;next.scoreChanges={};next.feedback=null;next.hint=undefined;next.results=undefined;
      next.inputRound=openInputRound(q,action.answer,state,action.roundId??`${q.id}-${state.event+1}`);break;
    }
    case 'wrong': {
      if(state.phase!=='question'||state.winnerId!==null||state.inputRound)return fail();
      const q=findQuestion(pack,state.activeQuestionId),player=next.players.find(p=>p.id===action.playerId);
      if(!q||!player)return fail();
      const penalty=state.hint?q.value:q.value/2;
      if(!Number.isSafeInteger(player.score-penalty))return fail();
      player.score-=penalty;
      next.scoreChanges={...state.scoreChanges,[player.id]:(state.scoreChanges?.[player.id]??0)-penalty};
      next.feedback={kind:'wrong',playerId:player.id,event:state.event+1,at:now};
      break;
    }
    case 'award': {
      if(state.phase!=='question'||state.winnerId!==null||state.inputRound)return fail();
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
      if(state.phase!=='question'||!state.activeQuestionId||!action.answer?.answer||state.inputRound)return fail();
      if(state.winnerId&&state.feedback?.kind!=='correct')next.feedback={kind:'correct',playerId:state.winnerId,event:state.event+1,at:now};
      if(!next.completed.includes(state.activeQuestionId))next.completed.push(state.activeQuestionId);
      next.revealed={answer:action.answer.answer,explanation:action.answer.explanation,accepted_answers:[],host_note:''};next.phase='answer';break;
    }
    case 'adjustScore': {
      const player=next.players.find(p=>p.id===action.playerId);
      if(state.phase==='lobby'||!player||!Number.isSafeInteger(action.delta)||!action.delta||!Number.isSafeInteger(player.score+action.delta))return fail();
      player.score+=action.delta;break;
    }
    case 'continue': {
      if(state.phase!=='answer'||!state.activeQuestionId) return fail();
      // Games already showing an answer from an older build may not have recorded it yet.
      if(!next.completed.includes(state.activeQuestionId))next.completed.push(state.activeQuestionId);
      // The last correct respondent chooses next. With no winner, keep the chooser.
      if(state.winnerId!==null){
        const winnerIndex=state.players.findIndex(p=>p.id===state.winnerId);
        if(winnerIndex>=0)next.turnIndex=winnerIndex;
      }
      next.activeQuestionId=null;next.revealed=null;next.winnerId=null;next.feedback=null;
      next.inputRound=undefined;next.results=undefined;next.hint=undefined;
      const done=roundCategories(pack,next).every(c=>c.questions.filter(q=>next.completed.includes(q.id)).length>=next.questionsPerCategory);
      if(done)finishRound();else next.phase='board';
      break;
    }
    case 'cancel':
      if(state.phase!=='question'||state.winnerId!==null||state.inputRound?.submitted.length)return fail();
      next.phase='board';next.activeQuestionId=null;next.feedback=null;next.inputRound=undefined;next.hint=undefined;break;
    case 'endRound': if(state.phase!=='board')return fail();finishRound();break;
    case 'closeInputs':
      if(!next.inputRound||next.inputRound.id!==action.roundId||next.inputRound.stage==='turns'||
        next.inputRound.stage==='wager'||!['question','final'].includes(state.phase))return fail();
      next.inputRound.closed=true;break;
    case 'scoreRound': {
      const round=state.inputRound;
      const q=findQuestion(pack,state.activeQuestionId);
      if(state.phase!=='question'||!round||!q||!action.answer.answer||next.inputRound===undefined)return fail();
      const inputs=Object.fromEntries(Object.entries(action.inputs).filter(([id,input])=>
        round.submitted.includes(id)&&state.players.some(player=>player.id===id)&&validateInput(round,id,input)));
      if(round.stage==='turns'){
        const id=round.queue?.[round.turn??0];
        if(!id||inputs[id]===undefined)return fail();
        const result=scoreGroup(round,{[id]:inputs[id]},action.answer,q.value)[0];
        applyResults([result]);
        if(result.correct)next.winnerId=id;
        else{
          next.inputRound.eliminated=[...(round.eliminated??[]),Number(inputs[id])];
          next.inputRound.turn=(round.turn??0)+1;
          if(next.inputRound.turn<(round.queue?.length??0))break;
        }
      }else{
        if(!round.closed)return fail();
        const results=scoreGroup(round,inputs,action.answer,q.value);
        applyResults(results);
        const winners=results.filter(result=>result.delta===q.value);
        if(winners.length===1)next.winnerId=winners[0].playerId;
      }
      next.completed.push(q.id);
      next.revealed=publishedAnswer(action.answer);
      next.phase='answer';
      break;
    }
    case 'chooseFinal': {
      const category=pack.finals?.find(item=>item.id===action.categoryId);
      if(state.phase!=='final'||state.final?.stage!=='category'||state.final.chooser!==action.playerId||!next.final||!category?.questions.length)return fail();
      next.final={...next.final,stage:'wager',categoryId:category.id};
      // The question is determined when betting closes.
      next.inputRound={...newInputRound(action.roundId,'wager'),limits:Object.fromEntries(state.players.map(player=>[player.id,Math.max(0,player.score)]))};
      break;
    }
    case 'openFinal': {
      if(state.phase!=='final'||state.final?.stage!=='wager'||!next.final)return fail();
      const questions=pack.finals?.find(item=>item.id===state.final?.categoryId)?.questions;
      if(!questions?.some(q=>q.id===action.questionId))return fail();
      next.final={...next.final,stage:'written',questionId:action.questionId,prompt:action.prompt};
      next.inputRound=newInputRound(action.roundId,'written');
      next.finalWagerId=state.inputRound?.id;
      break;
    }
    case 'scoreFinal': {
      if(state.phase!=='final'||state.final?.stage!=='written'||!state.inputRound?.closed||!next.final)return fail();
      applyResults(state.players.map(({id,score})=>{
        const input=action.inputs[id];
        const wager=Number(action.wagers[id]??0);
        const correct=typeof input==='string'&&action.correct.includes(id);
        if(!Number.isSafeInteger(wager)||wager<0||wager>Math.max(0,score))return fail();
        return {playerId:id,input:typeof input==='string'?input:undefined,delta:correct?wager:-wager,correct,wager};
      }));
      next.final.stage='result';next.inputRound=undefined;next.finalWagerId=undefined;
      next.revealed=publishedAnswer(action.answer);
      break;
    }
    case 'finishFinal':
      if(state.phase!=='final'||state.final?.stage!=='result')return fail();
      next.phase='finished';break;
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
