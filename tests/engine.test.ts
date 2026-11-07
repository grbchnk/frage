import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {available,initialGame,roundCategories,transition} from '../src/engine';
import type {Pack,Answer} from '../src/types';
const pack:Pack=JSON.parse(readFileSync('quiz-pack.json','utf8'));
const answer:Answer={answer:'Верно',explanation:'Почему верно',accepted_answers:['вариант'],host_note:'Секретная заметка'};
const start=(limit=5)=>transition(initialGame(),{type:'start',names:['Антон','Игорь','Серёжа','Дима','Стас','Оля','Ася'],limit},pack,0);
describe('Полный вечер',()=>{
  it('неверный ответ снимает стоимость вопроса, оставляет его открытым и даёт ответить другому',()=>{
    const original=start();
    for(const q of roundCategories(pack,original)[0].questions){
      const opened=transition(original,{type:'open',id:q.id},pack,1000);
      const wrong=transition(opened,{type:'penalize',playerId:'p1',questionId:q.id},pack);
      expect(wrong.players[0].score).toBe(-q.value);
      expect(wrong.players.slice(1)).toEqual(opened.players.slice(1));
      expect({...wrong,players:opened.players,event:opened.event}).toEqual(opened);
      expect(opened.players[0].score).toBe(0);
      const correct=transition(wrong,{type:'award',playerId:'p2',answer},pack);
      expect(correct.players[0].score).toBe(-q.value);expect(correct.players[1].score).toBe(q.value);
      expect(correct.phase).toBe('answer');expect(correct.revealed?.answer).toBe(answer.answer);
      const continued=transition(correct,{type:'continue'},pack);
      expect(continued.turnIndex).toBe(1);expect(continued.completed).toContain(q.id);
    }
  });
  it('штраф за вопрос отклоняется вне вопроса, для другого вопроса и неизвестного игрока',()=>{
    const state=start();
    const [q,other]=roundCategories(pack,state)[0].questions;
    expect(()=>transition(state,{type:'penalize',playerId:'p1',questionId:q.id},pack)).toThrow();
    const opened=transition(state,{type:'open',id:q.id},pack);
    expect(()=>transition(opened,{type:'penalize',playerId:'missing',questionId:q.id},pack)).toThrow();
    expect(()=>transition(opened,{type:'penalize',playerId:'p1',questionId:other.id},pack)).toThrow();
    const revealed=transition(opened,{type:'award',playerId:null,answer},pack);
    expect(()=>transition(revealed,{type:'penalize',playerId:'p1',questionId:q.id},pack)).toThrow();
  });
  it('бонусы и штрафы: ±50, своя сумма, отрицательный счёт и сохранение остальной игры',()=>{
    const original=start();
    const plus=transition(original,{type:'adjustScore',playerId:'p1',delta:50},pack);
    expect(plus.players[0].score).toBe(50);expect(original.players[0].score).toBe(0);
    const minus=transition(plus,{type:'adjustScore',playerId:'p2',delta:-50},pack);
    expect(minus.players[1].score).toBe(-50);
    const custom=transition(minus,{type:'adjustScore',playerId:'p1',delta:137},pack);
    expect(custom.players[0].score).toBe(187);
    const result=transition(custom,{type:'adjustScore',playerId:'p1',delta:-289},pack);
    expect(result.players[0].score).toBe(-102);
    const {players,event,...unchanged}=result;
    expect(unchanged).toEqual((({players,event,...rest})=>rest)(original));
    expect(event).toBe(original.event+4);
    expect(players.slice(2)).toEqual(original.players.slice(2));
  });
  it('ручные баллы доступны во время вопроса, ответа, перерыва и после финала',()=>{
    const original=start();
    const q=roundCategories(pack,original)[0].questions[0];
    const opened=transition(original,{type:'open',id:q.id},pack,1000);
    const bonus=transition(opened,{type:'adjustScore',playerId:'p2',delta:50},pack);
    expect(bonus.questionEndsAt).toBe(opened.questionEndsAt);expect(bonus.revealed).toBeNull();
    const awarded=transition(bonus,{type:'award',playerId:'p1',answer},pack);
    expect(awarded.players[0].score).toBe(q.value);expect(awarded.players[1].score).toBe(50);
    for(const phase of ['answer','break','finished'] as const){
      const state={...awarded,phase};
      const adjusted=transition(state,{type:'adjustScore',playerId:'p2',delta:-125},pack);
      expect(adjusted.players[1].score).toBe(-75);expect(adjusted.phase).toBe(phase);
      expect(adjusted.revealed).toEqual(state.revealed);expect(adjusted.winnerId).toBe(state.winnerId);
    }
    const continued=transition(awarded,{type:'continue'},pack);
    expect(continued.turnIndex).toBe(0);expect(continued.completed).toContain(q.id);
  });
  it('отклоняет неверного игрока, нецелые суммы и переполнение без изменения игры',()=>{
    const state=start();
    for(const delta of [0,.5,NaN,Infinity,-Infinity,Number.MAX_SAFE_INTEGER+1]){
      expect(()=>transition(state,{type:'adjustScore',playerId:'p1',delta},pack)).toThrow();
    }
    expect(()=>transition(state,{type:'adjustScore',playerId:'missing',delta:50},pack)).toThrow();
    expect(()=>transition(initialGame(),{type:'adjustScore',playerId:'p1',delta:50},pack)).toThrow();
    const high=transition(state,{type:'adjustScore',playerId:'p1',delta:Number.MAX_SAFE_INTEGER},pack);
    expect(()=>transition(high,{type:'adjustScore',playerId:'p1',delta:1},pack)).toThrow();
    const q=roundCategories(pack,high)[0].questions[0];
    const opened=transition(high,{type:'open',id:q.id},pack);
    expect(()=>transition(opened,{type:'award',playerId:'p1',answer},pack)).toThrow();
    expect(state.players.every(p=>p.score===0)).toBe(true);
  });
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
