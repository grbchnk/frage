import {useEffect,useState} from 'react';
import QRCode from 'qrcode';
import {buzz,joinGame} from './connection';
import type {Buzzer,Game,Participant} from './types';

export function JoinLink(){
  const url=new URL(location.href);url.searchParams.set('mode','player');
  const link=url.href;
  const [qr,setQr]=useState(''),[copied,setCopied]=useState(false);
  useEffect(()=>{void QRCode.toDataURL(link,{width:200,margin:1,color:{dark:'#211b16',light:'#fff4dc'}}).then(setQr);},[link]);
  return <section className="join-link">{qr&&<img src={qr} alt="QR-код для подключения участников"/>}<div><strong>Телефон — ваша кнопка</strong><p>Сканируйте код и введите имя</p><a href={link} target="_blank" rel="noreferrer">{link}</a><button className="text-link" onClick={()=>{void navigator.clipboard.writeText(link).then(()=>setCopied(true)).catch(()=>setCopied(false));}}>{copied?'Ссылка скопирована':'Скопировать ссылку'}</button></div></section>;
}

export function ParticipantScreen({state,roster,buzzer,online,onUpdate}:{state:Game;roster:Participant[];buzzer:Buzzer;online:boolean;onUpdate:()=>Promise<void>}){
  const [self,setSelf]=useState<Participant|null>(()=>{try{return JSON.parse(sessionStorage.getItem('quiz-self-v2')||'null');}catch{return null;}});
  const [name,setName]=useState(self?.name||''),[pending,setPending]=useState(false),[error,setError]=useState(''),[pulse,setPulse]=useState(false);
  const joined=self&&(state.phase==='lobby'?roster:state.players).some(p=>p.id===self.id);
  const active=!!(joined&&online&&state.phase==='question'&&buzzer.question_id===state.activeQuestionId&&buzzer.accepting&&!buzzer.claimant&&!buzzer.excluded.includes(self!.id));
  const won=joined&&state.phase==='question'&&buzzer.claimant===self!.id;
  async function press(){
    if(!active||pending||!self)return;
    setPending(true);setPulse(true);setError('');navigator.vibrate?.(35);
    try{await buzz(self.id,buzzer.window_id);await onUpdate();}
    catch(e){setError((e as Error).message);await onUpdate().catch(()=>{});}
    finally{setPending(false);setTimeout(()=>setPulse(false),200);}
  }
  return <main className="participant-screen">{!joined?<form className="participant-join" onSubmit={async e=>{e.preventDefault();setPending(true);setError('');try{const p=await joinGame(name);sessionStorage.setItem('quiz-self-v2',JSON.stringify(p));setSelf(p);await onUpdate();}catch(e){setError((e as Error).message);}finally{setPending(false);}}}><span className="eyebrow">В КИНОКОМНАТЕ У ПАШИ</span><h1>Как тебя зовут?</h1><input aria-label="Ваше имя" placeholder="Имя" maxLength={24} autoComplete="given-name" required value={name} onChange={e=>setName(e.target.value)}/><button className="primary" disabled={pending||!name.trim()}>{pending?'Подключаем…':'В игру →'}</button></form>:<><span className="participant-name">{self!.name}</span><button className={`buzzer-button ${active?'ready':''} ${won?'won':''} ${pulse?'pressed':''}`} disabled={!active||pending} onPointerDown={e=>{if(e.pointerType!=='mouse'||e.button===0){e.preventDefault();void press();}}} onClick={()=>void press()} aria-label={won?'Вы отвечаете':active?'Нажать первым':'Кнопка недоступна'}><span aria-hidden="true">{won?'✓':'✳'}</span></button></>}{error&&<p className="participant-error" role="alert">{error}</p>}{joined&&!online&&<p className="participant-error" role="status">Восстанавливаем соединение…</p>}</main>;
}
