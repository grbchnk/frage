import {useEffect} from 'react';

/** Only the shared display asks to keep its screen awake. */
export function useScreenWakeLock(enabled:boolean){
  useEffect(()=>{
    if(!enabled||!navigator.wakeLock)return;
    let active=true;
    let requesting=false;
    let lock:WakeLockSentinel|null=null;

    async function acquire(){
      if(!active||document.hidden||requesting||(lock&&!lock.released))return;
      requesting=true;
      try{
        const acquired=await navigator.wakeLock.request('screen');
        if(active&&!document.hidden)lock=acquired;
        else await acquired.release();
      }catch{
        // The browser or the TV can deny the request. The game still works.
      }finally{requesting=false;}
    }

    const retry=()=>{void acquire();};
    retry();
    document.addEventListener('visibilitychange',retry);
    document.addEventListener('fullscreenchange',retry);
    document.addEventListener('pointerdown',retry);
    return ()=>{
      active=false;
      document.removeEventListener('visibilitychange',retry);
      document.removeEventListener('fullscreenchange',retry);
      document.removeEventListener('pointerdown',retry);
      if(lock&&!lock.released)void lock.release().catch(()=>{});
    };
  },[enabled]);
}
