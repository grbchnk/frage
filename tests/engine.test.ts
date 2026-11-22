import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {available,chooseCategories,initialGame,rankPlayers,roundCategories,transition} from '../src/engine';
import type {Pack,Answer} from '../src/types';
const pack:Pack=JSON.parse(readFileSync('quiz-pack.json','utf8'));
const answer:Answer={answer:'Верно',explanation:'Почему верно',accepted_answers:['вариант'],host_note:'Секретная заметка'};
const start=(limit=5)=>transition(initialGame(),{type:'start',names:['Антон','Оля'],limit,categoryIds:pack.categories.slice(0,10).map(c=>c.id)},pack,0);
describe('Один вечер в кинокомнате',()=>{
 it.each([5,3])('%i вопросов на тему: 10 тем, один раунд, без перерыва',limit=>{
  let state=start(limit);
  for(const cat of roundCategories(pack,state))for(const q of cat.questions.slice(0,limit)){
   const before=state;
   state=transition(state,{type:'open',id:q.id},pack,1000);
   expect(state.questionOpenedAt).toBe(1000);expect(state.revealed).toBeNull();
   state=transition(state,{type:'award',playerId:'p2'},pack);
   expect(state.players[1].score).toBe(before.players[1].score+q.value);
   expect(state.revealed).toBeNull();expect(state.phase).toBe('question');
   expect(()=>transition(state,{type:'award',playerId:'p2'},pack)).toThrow();
   state=transition(state,{type:'reveal',answer},pack);expect(state.revealed?.host_note).toBe('');
   state=transition(state,{type:'continue'},pack);expect(state.turnIndex).toBe(1);expect(state.scoreChanges.p2).toBe(q.value);
  }
  expect(state.phase).toBe('finished');expect(state.completed).toHaveLength(10*limit);
 });
 it('сохраняет случайные темы и идентификаторы подключившихся участников',()=>{
  for(let i=0;i<20;i++){const ids=chooseCategories(pack);expect(ids).toHaveLength(10);expect(new Set(ids).size).toBe(10);expect(ids.every(id=>pack.categories.some(c=>c.id===id))).toBe(true);}
  const state=transition(initialGame(),{type:'start',names:['Антон','Оля'],limit:5,participants:[{id:'phone-a',name:'Антон'},{id:'phone-b',name:'Оля'}]},pack);
  expect(state.players.map(p=>p.id)).toEqual(['phone-a','phone-b']);
  expect(roundCategories(pack,JSON.parse(JSON.stringify(state))).map(c=>c.id)).toEqual(state.categoryIds);
  const outside=pack.categories.find(c=>!state.categoryIds.includes(c.id))!.questions[0];
  expect(()=>transition(state,{type:'open',id:outside.id},pack)).toThrow();
 });
 it('не тратит вопрос при возврате; без правильного ответа выбор сохраняется',()=>{
  let state=start();const q=roundCategories(pack,state)[0].questions[0];
  const cancelled=transition(transition(state,{type:'open',id:q.id},pack),{type:'cancel'},pack);
  expect(cancelled.completed).toEqual([]);expect(available(pack,cancelled,q.id)).toBe(true);
  state=transition(state,{type:'open',id:q.id},pack);
  state=transition(state,{type:'reveal',answer},pack);
  expect(state.phase).toBe('answer');expect(state.completed).toEqual([q.id]);expect(state.winnerId).toBeNull();
  expect(()=>transition(state,{type:'wrong',playerId:'p1'},pack)).toThrow();
  state=transition(state,{type:'continue'},pack);
  expect(state.completed).toEqual([q.id]);
  expect(state.turnIndex).toBe(0);expect(available(pack,state,q.id)).toBe(false);
  expect(transition(state,{type:'endRound'},pack).phase).toBe('finished');
  expect(transition(state,{type:'reset'},pack).categoryIds).toEqual([]);
 });
 it('проверяет имена и набор тем',()=>{
  expect(()=>transition(initialGame(),{type:'start',names:['Антон',' антон '],limit:5},pack)).toThrow();
  expect(()=>transition(initialGame(),{type:'start',names:['Один'],limit:5},pack)).toThrow();
  expect(()=>transition(initialGame(),{type:'start',names:['А','Б'],limit:5,categoryIds:Array(10).fill(1)},pack)).toThrow();
 });
 it('неправильный ответ снимает половину стоимости и сохраняет открытый вопрос',()=>{
  const state=start(),q=roundCategories(pack,state)[0].questions[2];
  const opened=transition(state,{type:'open',id:q.id},pack);
  const wrong=transition(opened,{type:'wrong',playerId:'p1'},pack);
  expect(wrong.players[0].score).toBe(-150);expect(wrong.scoreChanges.p1).toBe(-150);expect(wrong.phase).toBe('question');
  expect(wrong.activeQuestionId).toBe(q.id);expect(opened.players[0].score).toBe(0);
 });
 it('ручная корректировка не раскрывает ответ и проверяет сумму',()=>{
  const state=start(),q=roundCategories(pack,state)[0].questions[0],opened=transition(state,{type:'open',id:q.id},pack);
  const adjusted=transition(opened,{type:'adjustScore',playerId:'p1',delta:50},pack);
  expect(adjusted.players[0].score).toBe(50);expect(adjusted.revealed).toBeNull();expect(adjusted.phase).toBe('question');expect(adjusted.scoreChanges).toEqual({});
  expect(()=>transition(opened,{type:'adjustScore',playerId:'p1',delta:0.5},pack)).toThrow();
 });
 it('большая кнопка «Правильно» начисляет один раз и сразу раскрывает ответ',()=>{
  const state=start(),q=roundCategories(pack,state)[0].questions[2];
  const opened=transition(state,{type:'open',id:q.id},pack);
  const correct=transition(opened,{type:'correct',playerId:'p2',answer},pack);
  expect(correct.phase).toBe('answer');expect(correct.players[1].score).toBe(300);
  expect(correct.revealed).toEqual({...answer,accepted_answers:[],host_note:''});
  expect(correct.event).toBe(opened.event+1);
  expect(()=>transition(correct,{type:'correct',playerId:'p2',answer},pack)).toThrow();
 });
 it('ведущий может выбрать одну, пять, десять или весь банк тем',()=>{
  for(const count of [1,5,10,pack.categories.length]){
    const ids=chooseCategories(pack,Math.random,count);
    const state=transition(initialGame(),{type:'start',names:['А','Б'],limit:5,categoryIds:ids},pack);
    expect(roundCategories(pack,state).map(c=>c.id)).toEqual(ids);
    expect(new Set(ids).size).toBe(count);
    if(count>10){
      expect(transition(state,{type:'boardPage',page:1},pack).boardPage).toBe(1);
      expect(()=>transition(state,{type:'boardPage',page:Math.ceil(count/10)},pack)).toThrow();
    }
  }
  expect(()=>transition(initialGame(),{type:'start',names:['А','Б'],limit:5,categoryIds:[]},pack)).toThrow();
 });
 it('суммирует три штрафа и верный ответ с сохранением нулевого и чужого итога',()=>{
  let state=start();
  const q=roundCategories(pack,state)[0].questions[2];
  state=transition(state,{type:'open',id:q.id},pack);
  for(let i=0;i<3;i++)state=transition(state,{type:'wrong',playerId:'p1'},pack);
  state=transition(state,{type:'wrong',playerId:'p2'},pack);
  state=transition(state,{type:'correct',playerId:'p1',answer},pack);
  expect(state.feedback).toMatchObject({kind:'correct',playerId:'p1'});
  expect(state.scoreChanges).toEqual({p1:-q.value/2,p2:-q.value/2});
  state=transition(state,{type:'continue'},pack);
  expect(state.scoreChanges.p1).toBe(-q.value/2);
  state=transition(state,{type:'open',id:roundCategories(pack,state)[0].questions[1].id},pack);
  state=transition(state,{type:'wrong',playerId:'p1'},pack);
  state=transition(state,{type:'wrong',playerId:'p1'},pack);
  state=transition(state,{type:'correct',playerId:'p1',answer},pack);
  expect(state.scoreChanges).toEqual({p1:0});
 });
 it('одинаковые баллы дают общее место без изменения порядка ходов',()=>{
  const players=[{id:'1',name:'А',score:50},{id:'2',name:'Б',score:100},{id:'3',name:'В',score:100},{id:'4',name:'Г',score:0}];
  expect(rankPlayers(players).map(p=>[p.id,p.rank])).toEqual([['2',1],['3',1],['1',3],['4',4]]);
  expect(players[0].id).toBe('1');
 });
});
