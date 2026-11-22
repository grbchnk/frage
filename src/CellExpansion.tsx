import {useLayoutEffect,useRef,useState,type ReactNode} from 'react';

type OpenQuestion={id:string;value:number;openedAt:number|null};
const DURATION=420;
const EASING='cubic-bezier(.25,.72,.24,1)';

export function CellExpansion({question,render}:{question:OpenQuestion|null;render:(openedAt:number|null)=>ReactNode}){
  const surface=useRef<HTMLDivElement>(null);
  const neutral=useRef<HTMLDivElement>(null);
  const previous=useRef(question);
  const [visible,setVisible]=useState(question!==null);
  const [typingStart,setTypingStart]=useState<number|null>(question?.openedAt??null);
  const id=question?.id??null;
  const value=question?.value??null;
  const openedAt=question?.openedAt??null;

  useLayoutEffect(()=>{
    const layer=surface.current;
    const gray=neutral.current;
    const stage=layer?.parentElement;
    if(!layer||!gray||!stage)return;

    const departing=previous.current;
    previous.current=id===null||value===null?null:{id,value,openedAt};
    const opening=id!==null&&departing===null;
    const closing=id===null&&departing!==null;
    const activeId=id??departing?.id;
    const tile=activeId?stage.querySelector<HTMLElement>(`.price[data-question-id="${CSS.escape(activeId)}"]`):null;
    const field=stage.getBoundingClientRect();
    const cell=tile?.getBoundingClientRect();
    const animate=tile&&cell&&field.width>0&&field.height>0&&cell.width>0&&cell.height>0&&
      cell.top>=field.top-1&&cell.bottom<=field.bottom+1&&
      typeof layer.animate==='function'&&!document.hidden&&!matchMedia('(prefers-reduced-motion: reduce)').matches;

    layer.dataset.value=String(value??departing?.value??'');
    layer.hidden=id===null;
    setVisible(id!==null);
    setTypingStart(openedAt);
    if((!opening&&!closing)||!animate)return;

    const small=`translate(${cell.left-field.left}px,${cell.top-field.top}px) scale(${cell.width/field.width},${cell.height/field.height})`;
    layer.hidden=false;
    setVisible(false);
    const movement=layer.animate(
      opening?[{transform:small},{transform:'none'}]:[{transform:'none'},{transform:small}],
      {duration:DURATION,easing:EASING,fill:'both'}
    );
    const tone=closing&&tile.classList.contains('played')?
      gray.animate([{opacity:0},{opacity:1}],{duration:DURATION,easing:EASING,fill:'both'}):null;
    const surrounding=stage.querySelector('.board')?.animate(
      opening?[{opacity:1},{opacity:.55}]:[{opacity:.55},{opacity:1}],
      {duration:DURATION,easing:EASING,fill:'both'}
    );
    let active=true;

    function settle(){
      if(!active)return;
      active=false;
      if(layer)layer.hidden=closing;
      movement.cancel();
      tone?.cancel();
      surrounding?.cancel();
      if(opening){
        setTypingStart(Date.now());
        setVisible(true);
      }
    }

    void movement.finished.then(settle,()=>{});
    window.addEventListener('resize',settle);
    return ()=>{
      active=false;
      movement.cancel();
      tone?.cancel();
      surrounding?.cancel();
      window.removeEventListener('resize',settle);
    };
  },[id,value,openedAt]);

  return <>
    <div className="cell-surface tile-palette" ref={surface} hidden aria-hidden="true">
      <div className="cell-neutral" ref={neutral}/>
    </div>
    {question&&<div className="cell-question" data-waiting={!visible} aria-hidden={!visible||undefined}>
      {render(typingStart)}
    </div>}
  </>;
}
