import {afterEach,expect,it,vi} from 'vitest';
import {initialGame} from '../src/engine';

afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.resetModules();});
async function connection(fetcher:typeof fetch){
 vi.resetModules();vi.stubEnv('DEV',false);
 vi.stubEnv('VITE_SUPABASE_URL','https://quiz.test');vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY','public-test-key');
 vi.stubGlobal('location',{search:''});vi.stubGlobal('fetch',fetcher);
 return import('../src/connection');
}
it('новая игра использует свежую версию и общий RPC сброса без сохранения старой партии',async()=>{
 const before={id:'main',revision:17,state:{...initialGame(),phase:'board',event:32,players:[{id:'old',name:'Прошлый игрок',score:1000}]}};
 const requests:{url:string;method:string;body:any}[]=[];
 const api=await connection(async(input,init)=>{
  const url=String(input),body=init?.body?JSON.parse(String(init.body)):null;
  requests.push({url,method:init?.method||'GET',body});
  if(url.includes('/rpc/quiz_restore'))return new Response(JSON.stringify({id:'main',revision:18,state:body.desired_state}));
  return new Response(JSON.stringify(before));
 });
 const reset=await api.resetGame();
 expect(reset.state.phase).toBe('lobby');expect(reset.state.players).toEqual([]);expect(reset.state.event).toBe(33);
 expect(reset.state.completed).toEqual([]);expect(reset.state.categoryIds).toEqual([]);
 expect(requests.map(r=>r.method)).toEqual(['GET','POST']);
 expect(requests[1].body.expected_revision).toBe(17);expect(requests[1].body.desired_buzzer.accepting).toBe(false);
});
it('при конфликте версия читается заново, а неподтверждённый сброс не считается успешным',async()=>{
 let reads=0,writes=0;
 const api=await connection(async(input,init)=>{
  if(String(input).includes('/rpc/')){
   writes++;if(writes===1)return new Response(JSON.stringify({code:'P0001',message:'Игра уже изменилась. Отмена недоступна.'}),{status:400});
   const body=JSON.parse(String(init?.body));return new Response(JSON.stringify({id:'main',revision:body.expected_revision+1,state:body.desired_state}));
  }
  reads++;return new Response(JSON.stringify({id:'main',revision:reads,state:initialGame()}));
 });
 expect((await api.resetGame()).revision).toBe(3);expect(reads).toBe(2);expect(writes).toBe(2);
});
it('ошибка 21000 показывается с причиной, без ложной подсказки про права',async()=>{
 const api=await connection(async input=>String(input).includes('/rpc/')?
  new Response(JSON.stringify({code:'21000',message:'more than one row returned by a subquery used as an expression'}),{status:400}):
  new Response(JSON.stringify({id:'main',revision:1,state:initialGame()})));
 await expect(api.resetGame()).rejects.toThrow('21000');
 await expect(api.resetGame()).rejects.not.toThrow('права');
});
