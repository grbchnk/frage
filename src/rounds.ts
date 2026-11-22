import type {Answer, Category, Game, InputRound, InputStage, Question, QuestionType, RoundInput, RoundResult} from './types';

export const questionTypes:Record<QuestionType,string>={
  buzzer:'Кто первый?',estimate:'Кто ближе?',turns:'Варианты по очереди',choice:'Варианты для всех',order:'Расставь по порядку',
};
export const prices=[100,200,300,400,500];
export const questionType=(question:Question):QuestionType=>question.type??'buzzer';

export function filterCategories(categories:Category[],types:QuestionType[]){
  return categories.map(category=>({...category,questions:category.questions.filter(q=>types.includes(questionType(q)))}));
}
export function missingPrices(category:Category){
  return prices.filter(price=>!category.questions.some(q=>q.value===price));
}
export function drawQuestions(categories:Category[],ids:number[],random=Math.random){
  return ids.flatMap(id=>{
    const category=categories.find(item=>item.id===id);
    if(!category||missingPrices(category).length)throw new Error('В выбранной категории не хватает вопросов.');
    return prices.map(price=>{
      const options=category.questions.filter(q=>q.value===price);
      return options[Math.floor(random()*options.length)].id;
    });
  });
}

function shuffled<T>(values:T[],random:()=>number){
  const result=[...values];
  for(let i=result.length-1;i>0;i--){
    const j=Math.floor(random()*(i+1));
    [result[i],result[j]]=[result[j],result[i]];
  }
  return result;
}

export function openInputRound(question:Question,answer:Answer|undefined,state:Game,id:string,random=Math.random):InputRound|undefined{
  const stage=questionType(question);
  if(stage==='buzzer')return undefined;
  const round:InputRound={id,stage,submitted:[]};
  const options=(question.options??[]).map((label,id)=>({id,label}));
  if(stage==='turns'){
    const correct=options.find(option=>option.id===answer?.correctOption);
    if(!correct||options.length<state.players.length+1)throw new Error('В вопросе не хватает вариантов.');
    round.options=shuffled([correct,...shuffled(options.filter(option=>option!==correct),random).slice(0,state.players.length)],random);
    const chooser=state.players[state.turnIndex];
    round.queue=[chooser,...state.players.filter(player=>player.id!==chooser.id).sort((a,b)=>b.score-a.score)].map(player=>player.id);
    round.eliminated=[];
    round.turn=0;
  }
  if(stage==='choice')round.options=shuffled(options,random);
  if(stage==='order'){
    round.options=shuffled(options,random);
    if(round.options.every((option,index)=>option.id===answer?.correctOrder?.[index]))round.options.push(round.options.shift()!);
  }
  return round;
}

export function validateInput(round:InputRound,playerId:string,input:RoundInput){
  const available=round.options?.filter(option=>!round.eliminated?.includes(option.id)).map(option=>option.id)??[];
  switch(round.stage){
    case 'estimate': return typeof input==='number'&&Number.isFinite(input)&&Math.abs(input)<=1e12;
    case 'wager': return typeof input==='number'&&Number.isSafeInteger(input)&&input>=0&&input<=(round.limits?.[playerId]??0);
    case 'written': return typeof input==='string'&&input.trim().length>0&&input.length<=300;
    case 'turns': return round.queue?.[round.turn??0]===playerId&&typeof input==='number'&&available.includes(input);
    case 'choice': return typeof input==='number'&&available.includes(input);
    case 'order': return Array.isArray(input)&&input.length===available.length&&new Set(input).size===input.length&&input.every(id=>available.includes(id));
  }
}

export function submittedPlayers(round:InputRound,players:Game['players']){
  return round.stage==='turns'?[round.queue?.[round.turn??0]??'']:players.map(player=>player.id);
}
export const allSubmitted=(round:InputRound,players:Game['players'])=>submittedPlayers(round,players).every(id=>round.submitted.includes(id));

export function scoreGroup(round:InputRound,inputs:Record<string,RoundInput>,answer:Answer,value:number):RoundResult[]{
  const entries=Object.entries(inputs);
  const distances=entries.map(([,input])=>Math.abs(Number(input)-(answer.target??0)));
  const closest=Math.min(...distances),furthest=Math.max(...distances);
  return entries.map(([playerId,input],index)=>{
    if(round.stage==='estimate'){
      const distance=distances[index];
      // When everyone is equally close, nobody is singled out for a penalty.
      const equal=(a:number,b:number)=>Math.abs(a-b)<=Number.EPSILON*Math.max(1,a,b,Math.abs(answer.target??0))*4;
      const delta=equal(distance,closest)?value:equal(distance,furthest)?-value/2:0;
      return {playerId,input:String(input),delta};
    }
    const correct=round.stage==='order'
      ?Array.isArray(input)&&input.every((id,i)=>id===answer.correctOrder?.[i])
      :input===answer.correctOption;
    const label=Array.isArray(input)?input.map(id=>round.options?.find(option=>option.id===id)?.label).join(' → ')
      :round.options?.find(option=>option.id===input)?.label;
    return {playerId,input:label,delta:correct?value:-value/2,correct};
  });
}

export function newInputRound(id:string,stage:InputStage):InputRound{
  return {id,stage,submitted:[]};
}

export function publishedAnswer(answer:Answer):Answer{
  return {answer:answer.answer,explanation:answer.explanation,accepted_answers:[],host_note:''};
}
