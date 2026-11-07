import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {available,initialGame,roundCategories,transition} from '../src/engine';
import type {Pack,Answer} from '../src/types';
const pack:Pack=JSON.parse(readFileSync('quiz-pack.json','utf8'));
const answer:Answer={answer:'Верно',explanation:'Почему верно',accepted_answers:['вариант'],host_note:'Секретная заметка'};
const start=(limit=5)=>transition(initialGame(),{type:'start',names:['Антон','Игорь','Серёжа','Дима','Стас','Оля','Ася'],limit},pack,0);
describe('Полный вечер',()=>{
  it('100 вопросов, два раунда, перерыв, выбор последним ответившим и итоговый счёт',()=>{
    let state=start();let played=0;
    for(let round=0;round<2;round++){
      const cats=roundCategories(pack,state);
      for(const cat of cats)for(const q of cat.questions){
        const chooser=state.turnIndex;
        state=transition(state,{type:'open',id:q.id},pack,1000);
        expect(state.revealed).toBeNull();expect(state.questionEndsAt).toBe(1000+q.time_seconds*1000);
        state=transition(state,{type:'award',playerId:'p2',answer},pack);
        expect(state.turnIndex).toBe(chooser);expect(state.revealed?.host_note).toBe('');
        state=transition(state,{type:'continue'},pack,2000);played++;
        expect(state.turnIndex).toBe(1);
      }
      if(round===0){expect(state.phase).toBe('break');expect(state.breakEndsAt).toBe(602000);state=transition(state,{type:'resume'},pack);}
    }
    expect(state.phase).toBe('finished');expect(state.completed).toHaveLength(100);
    expect(state.players[1].score).toBe(30000);expect(state.players[0].score).toBe(0);
  });
  it('не даёт дважды начислить, открыть сыгранный вопрос или вопрос из другого раунда',()=>{
    let state=start();const q=roundCategories(pack,state)[0].questions[0];
    const nextRound=pack.categories.find(c=>c.id===pack.rounds[1].category_ids[0])!.questions[0];
    expect(()=>transition(state,{type:'open',id:nextRound.id},pack)).toThrow();
    state=transition(state,{type:'open',id:q.id},pack);
    state=transition(state,{type:'award',playerId:'p1',answer},pack);
    expect(()=>transition(state,{type:'award',playerId:'p1',answer},pack)).toThrow();
    state=transition(state,{type:'continue'},pack);expect(available(pack,state,q.id)).toBe(false);
    expect(()=>transition(state,{type:'open',id:q.id},pack)).toThrow();
  });
  it('60 вопросов: три любых в теме, остальные автоматически закрыты',()=>{
    let state=start(3);
    for(const cat of roundCategories(pack,state)){
      for(const q of [cat.questions[0],cat.questions[2],cat.questions[4]]){
        state=transition(state,{type:'open',id:q.id},pack);
        state=transition(state,{type:'award',playerId:null,answer},pack);
        state=transition(state,{type:'continue'},pack);
      }
      expect(available(pack,state,cat.questions[1].id)).toBe(false);
    }
    expect(state.phase).toBe('break');expect(state.completed).toHaveLength(30);expect(state.players.every(p=>p.score===0)).toBe(true);expect(state.turnIndex).toBe(0);
  });
  it('отмена открытия не тратит вопрос или очередь; сброс убирает игру',()=>{
    const state=start(),q=roundCategories(pack,state)[0].questions[0];
    const opened=transition(state,{type:'open',id:q.id},pack);
    const cancelled=transition(opened,{type:'cancel'},pack);
    expect(cancelled.phase).toBe('board');expect(cancelled.turnIndex).toBe(0);expect(cancelled.completed).toEqual([]);
    const reset=transition(opened,{type:'reset'},pack);expect(reset.players).toEqual([]);expect(reset.phase).toBe('lobby');
    expect(state.phase).toBe('board'); // transition does not mutate the original snapshot
  });
  it('проверяет имена и игрока, которому начисляют баллы',()=>{
    expect(()=>transition(initialGame(),{type:'start',names:['Антон',' антон '],limit:5},pack)).toThrow();
    expect(()=>transition(initialGame(),{type:'start',names:['Один'],limit:5},pack)).toThrow();
    const state=start(),q=roundCategories(pack,state)[0].questions[0];
    expect(()=>transition(transition(state,{type:'open',id:q.id},pack),{type:'award',playerId:'x',answer},pack)).toThrow();
  });
});
