import type {Game} from './types';

export interface QuestionMotion {
  transition: ViewTransition;
  clear(): void;
}

/** Measure the cell on the shared display before it switches to the question. */
export function playQuestionMotion(before:Game,after:Game,commit:()=>boolean):QuestionMotion|null {
  if(!document.startViewTransition||document.hidden||matchMedia('(prefers-reduced-motion: reduce)').matches)return null;
  const opening=before.phase==='board'&&after.phase==='question';
  const returning=(before.phase==='answer'||before.phase==='question')&&after.phase==='board';
  if(!opening&&!returning)return null;
  const id=opening?after.activeQuestionId:before.activeQuestionId;
  if(!id)return null;

  const display=document.querySelector('.app.display.quiz-round');
  if(!display)return null;
  const cell=`.board .price[data-question-id="${CSS.escape(id)}"]`;
  const question='.question-main';
  const source=display.querySelector<HTMLElement>(opening?cell:question);
  if(!source)return null;
  const bounds=source.getBoundingClientRect();
  const board=opening?source.closest('.board')?.getBoundingClientRect():null;
  if(bounds.bottom<=(board?.top??0)||bounds.top>=(board?.bottom??window.innerHeight))return null;

  const root=document.documentElement;
  const direction=opening?'opening':'returning';
  const scores=display.querySelector<HTMLElement>('.scoreboard');
  const name='frage-question';
  let target:HTMLElement|null=null;
  let cleared=false;
  root.dataset.questionMotion=direction;
  source.style.viewTransitionName=name;
  if(scores)scores.style.viewTransitionName='frage-scores';

  function clear(){
    if(cleared)return;
    cleared=true;
    delete root.dataset.questionMotion;
    source?.style.removeProperty('view-transition-name');
    target?.style.removeProperty('view-transition-name');
    scores?.style.removeProperty('view-transition-name');
  }

  const transition=document.startViewTransition(()=>{
    if(!commit()||cleared)return;
    target=display.querySelector<HTMLElement>(opening?question:cell);
    if(!target){transition.skipTransition();return;}
    if(returning)target.scrollIntoView({block:'nearest',inline:'nearest'});
    target.style.viewTransitionName=name;
  });
  void transition.ready.catch(()=>{});
  void transition.finished.then(clear,clear);
  return {transition,clear};
}
