// Original procedural soundtrack. No external recordings or autoplay dependency.
export class QuizAudio {
  private context: AudioContext | null=null;
  private master: GainNode | null=null;
  private timer: ReturnType<typeof setInterval> | null=null;
  private step=0;
  private phase='lobby';
  private noiseBuffer:AudioBuffer|null=null;
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
  private percussion(volume:number,duration:number,frequency:number){
    if(!this.context||!this.master)return;
    if(!this.noiseBuffer){this.noiseBuffer=this.context.createBuffer(1,this.context.sampleRate,this.context.sampleRate);const samples=this.noiseBuffer.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=Math.random()*2-1;}
    const time=this.context.currentTime,source=this.context.createBufferSource(),filter=this.context.createBiquadFilter(),gain=this.context.createGain();
    source.buffer=this.noiseBuffer;filter.type='highpass';filter.frequency.value=frequency;
    gain.gain.setValueAtTime(volume,time);gain.gain.exponentialRampToValueAtTime(.0001,time+duration);
    source.connect(filter);filter.connect(gain);gain.connect(this.master);source.start(time);source.stop(time+duration+.02);
  }
  setPhase(phase:string){if(this.phase!==phase){this.phase=phase;this.step=0;}}
  private start(){if(this.timer)return;this.timer=setInterval(()=>{
    const i=this.step++;
    if(this.phase==='board'||this.phase==='lobby'){
      // Four 16-second sections: theme, answer phrase, airy bridge, full-band return.
      const section=Math.floor(i/64)%4,beat=i%16,bar=Math.floor(i/16)%8;
      const roots=[130.81,110,87.31,98,130.81,164.81,87.31,98];
      const root=roots[bar],minor=bar===1||bar===5,third=minor?1.1892:1.2599;
      if(beat===0||beat===6||beat===10){this.note(root/2,0,.29,.075,'triangle');this.note(55,0,.08,.065);}
      if(beat===4||beat===12){this.percussion(.032,.11,1200);this.note(174.61,0,.07,.015,'triangle');}
      if(section!==2||beat%2===0)this.percussion(beat%2===0?.012:.006,beat===14?.11:.035,6500);
      if(beat===8||beat===14)this.note(root*.75,0,.18,.045,'triangle');
      if(beat===0||beat===7){this.note(root*2,0,.85,.014);this.note(root*2*third,.025,.8,.012);this.note(root*3,.055,.75,.009);}
      const themes=[
        [523.25,0,659.25,783.99,0,659.25,587.33,0,440,523.25,0,659.25,587.33,493.88,0,392],
        [783.99,659.25,0,587.33,659.25,0,523.25,440,0,493.88,587.33,659.25,0,783.99,659.25,0],
        [659.25,0,0,523.25,0,0,440,0,587.33,0,0,493.88,0,523.25,0,0],
        [523.25,659.25,783.99,0,880,783.99,659.25,587.33,0,659.25,523.25,440,493.88,587.33,659.25,0]
      ];
      const melody=themes[section][i%16];
      if(melody)this.note(melody*(bar>=4?1.0:.5),0,section===2?.8:.23,section===2?.025:.033,'triangle');
      if(section===3&&beat%4===2)this.note(root*4*third,0,.13,.009);
      if(bar%4===3&&beat>=13){this.percussion(.015,.045,2500);this.note([392,440,493.88][beat-13],0,.12,.012);}
    }else if(this.phase==='question'){
      // A separate suspense bed: low heartbeat, drifting minor pads and sparse high notes.
      const root=[73.42,77.78,65.41,69.3][Math.floor(i/16)%4];
      if(i%3===0){this.note(root,0,.19,.065);this.note(root,.19,.13,.033);}
      if(i%16===0){this.note(root*2,0,3.8,.018);this.note(root*2.3784,0,3.8,.01);this.note(root*3,0,3.8,.008);}
      if(i%8===6)this.note(root*8,0,.65,.011);
    }
  },250);}
  effect(kind:string){
    const tune=kind==='wrong'?[293.66,220,146.83]:kind==='buzz'?[880,1174.66]:kind==='question'?[220,329.63,440]:kind==='answer'?[523.25,659.25,783.99,1046.5]:kind==='finished'?[392,523.25,659.25,783.99,659.25,1046.5]:kind==='break'?[440,329.63,261.63]:[];
    tune.forEach((f,i)=>this.note(f,i*.11,.6,.12,'triangle'));
  }
  stop(){if(this.timer)clearInterval(this.timer);this.timer=null;void this.context?.close();}
}
