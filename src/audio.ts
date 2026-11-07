// Original procedural soundtrack. No external recordings or autoplay dependency.
export class QuizAudio {
  private context: AudioContext | null=null;
  private master: GainNode | null=null;
  private timer: ReturnType<typeof setInterval> | null=null;
  private step=0;
  private phase='lobby';
  async enable(){
    const Audio=window.AudioContext||(window as unknown as {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
    if(!Audio)throw new Error('Звук не поддерживается этим браузером.');
    this.context??=new Audio();
    if(!this.master){this.master=this.context.createGain();this.master.gain.value=.35;this.master.connect(this.context.destination);}
    if(this.context.resume)await this.context.resume();this.start();
  }
  volume(value:number){if(this.master&&this.context)this.master.gain.setTargetAtTime(value,this.context.currentTime,.05);}
  private note(freq:number,offset=0,duration=.35,volume=.12,type:OscillatorType='sine'){
    if(!this.context||!this.master)return;
    const time=this.context.currentTime+offset,osc=this.context.createOscillator(),gain=this.context.createGain();
    osc.type=type;osc.frequency.value=freq;gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(volume,time+.015);gain.gain.exponentialRampToValueAtTime(.0001,time+duration);
    osc.connect(gain);gain.connect(this.master);osc.start(time);osc.stop(time+duration+.03);
  }
  setPhase(phase:string){this.phase=phase;this.step=0;}
  private start(){if(this.timer)return;this.timer=setInterval(()=>{
    const i=this.step++;
    if(this.phase==='board'||this.phase==='lobby'){
      const bass=[110,110,130.81,98][Math.floor(i/8)%4];
      if(i%2===0)this.note(bass,0,.6,.08,'triangle');
      const notes=[440,523.25,659.25,523.25,392,523.25,587.33,0];
      if(notes[i%8])this.note(notes[i%8],0,.32,.025);
    }else if(this.phase==='question'){
      this.note(i%4===0?146.83:293.66,0,.24,i%4===0?.045:.018,'sine');
      if(i%8===0){this.note(220,0,2.2,.018);this.note(329.63,0,2.2,.012);}
    }
  },500);}
  effect(kind:string){
    const tune=kind==='question'?[220,329.63,440]:kind==='answer'?[523.25,659.25,783.99,1046.5]:kind==='finished'?[392,523.25,659.25,783.99,659.25,1046.5]:kind==='break'?[440,329.63,261.63]:[];
    tune.forEach((f,i)=>this.note(f,i*.11,.6,.12,'triangle'));
  }
  stop(){if(this.timer)clearInterval(this.timer);this.timer=null;void this.context?.close();}
}
