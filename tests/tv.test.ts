import {readFileSync,existsSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {parse} from 'acorn';
import {expect,it} from 'vitest';
import sharp from 'sharp';
import {initialGame} from '../src/engine';

const boot=readFileSync('index.html','utf8').match(/<script>([\s\S]*?)<\/script>/)![1];

// Run the actual display in a small DOM/XHR harness with no modern browser APIs.
class Node {
  children:Node[]=[];style:Record<string,string>={};className='';id='';value='';src='';alt='';
  onclick:(()=>void)|null=null;
  constructor(public tag:string){}
  get firstChild(){return this.children[0]||null;}
  appendChild(node:Node){this.children.push(node);return node;}
  removeChild(node:Node){this.children.splice(this.children.indexOf(node),1);}
  get text():string{return this.value+this.children.map(c=>c.text).join(' ');}
  all():Node[]{return [this,...this.children.flatMap(c=>c.all())];}
}
function tv(){
  const pack=JSON.parse(readFileSync('public/content/questions.json','utf8'));
  const root=new Node('body');
  for(const id of ['tv-content','tv-players','tv-error','tv-status','tv-retry']){const node=new Node('div');node.id=id;root.appendChild(node);}
  const get=(id:string)=>root.all().find(n=>n.id===id)!;
  const timers=new Map<number,()=>void>();
  let current={id:'main',revision:1,state:initialGame()};
  let code=200;
  const requests:{url:string;method:string;headers:Record<string,string>;body:unknown}[]=[];
  class XHR {
    readyState=0;status=0;responseText='';url='';method='';headers:Record<string,string>={};
    onreadystatechange=()=>{};
    open(method:string,url:string){this.method=method;this.url=url;}
    setRequestHeader(name:string,value:string){this.headers[name]=value;}
    abort(){}
    send(body:unknown){
      requests.push({url:this.url,method:this.method,headers:this.headers,body});
      this.status=this.url.includes('/rest/')?code:200;
      this.responseText=JSON.stringify(this.url.includes('/rest/')?[current]:pack);
      this.readyState=4;this.onreadystatechange();
    }
  }
  runInNewContext(readFileSync('public/tv.js','utf8'),{
    window:{QUIZ_TV_CONFIG:{url:'https://example.supabase.co',key:'public-test-key'},innerHeight:720,scrollTo:()=>{},setTimeout:()=>1,clearTimeout:()=>{},setInterval:(fn:()=>void,ms:number)=>{timers.set(ms,fn);}},
    document:{documentElement:{clientWidth:1280,clientHeight:720},getElementById:get,createElement:(tag:string)=>new Node(tag),createTextNode:(value:string)=>{const n=new Node('#text');n.value=value;return n;}},
    XMLHttpRequest:XHR,
  });
  return {pack,root,get,requests,update:(patch:Partial<ReturnType<typeof initialGame>>)=>{current={...current,revision:current.revision+1,state:{...current.state,...patch}};timers.get(2000)!();},fail:()=>{code=503;timers.get(2000)!();},recover:()=>{code=200;timers.get(2000)!();}};
}
it('TV без современных API показывает все этапы и не запрашивает частные ответы',()=>{
  const app=tv();
  expect(app.get('tv-content').text).toContain('Ожидаем ведущего');
  const players=[{id:'p1',name:'Стас <img src=x>',score:100},{id:'p2',name:'Алина',score:0}];
  app.update({phase:'board',players});
  expect(app.get('tv-content').all().filter(n=>n.tag==='tr')).toHaveLength(10);
  expect(app.get('tv-players').text).toContain('Стас <img src=x>');
  expect(app.get('tv-players').all().some(n=>n.tag==='img')).toBe(false);
  const question=app.pack.categories.flatMap((c:any)=>c.questions).find((q:any)=>q.media?.question_masks_normalized?.length);
  app.update({phase:'question',activeQuestionId:question.id,questionEndsAt:Date.now()+60000});
  expect(app.get('tv-content').text).toContain(question.prompt);
  expect(app.get('tv-clock').text).toMatch(/^00:(59|60)|01:00$/);
  expect(app.get('tv-content').all().filter(n=>n.className==='tv-mask')).toHaveLength(question.media.question_masks_normalized.length);
  expect(app.get('tv-content').all().find(n=>n.tag==='img')?.src).toMatch(/\.jpg$/);
  app.update({phase:'answer',revealed:{answer:'Тестовый ответ',explanation:'Объяснение',accepted_answers:[],host_note:''},winnerId:'p1'});
  expect(app.get('tv-content').text).toContain('Тестовый ответ');
  expect(app.get('tv-content').all().filter(n=>n.className==='tv-mask')).toHaveLength(0);
  const rebus=app.pack.categories.flatMap((c:any)=>c.questions).find((q:any)=>q.media?.kind==='photo_rebus');
  app.update({phase:'question',activeQuestionId:rebus.id});
  expect(app.get('tv-content').all().filter(n=>n.className==='tv-rebus-panel')).toHaveLength(rebus.media.panels.length);
  app.update({phase:'break',breakEndsAt:Date.now()+600000});
  expect(app.get('tv-content').text).toContain('Перерыв');
  app.update({phase:'finished'});
  expect(app.get('tv-content').text).toContain('Победитель');
  app.fail();
  expect(app.get('tv-error').text).toContain('503');
  expect(app.get('tv-content').text).toContain('Победитель');
  app.recover();
  expect(app.get('tv-error').style.display).toBe('none');
  for(const request of app.requests){
    expect(request.method).toBe('GET');
    expect(request.body).toBe(null);
    expect(request.url).toMatch(/content\/questions\.json|\/rest\/v1\/quiz_game\?/);
    if(request.url.includes('/rest/'))expect(request.headers.apikey).toBe('public-test-key');
  }
});
it('экран телевизора и выбор режима используют синтаксис ES5',()=>{
  expect(()=>parse(boot,{ecmaVersion:5})).not.toThrow();
  expect(()=>parse(readFileSync('public/tv.js','utf8'),{ecmaVersion:5})).not.toThrow();
});
it('браузер без модулей переходит на TV-экран с сохранением параметров',()=>{
  let destination='';
  runInNewContext(boot,{
    document:{createElement:()=>({})},
    window:{setTimeout:()=>{}},
    location:{search:'?mode=display',hash:'#screen',replace:(url:string)=>{destination=url;}},
  });
  expect(destination).toBe('tv.html?mode=display#screen');
});
it('современный браузер сохраняет основной интерфейс; compat=1 включает TV-режим',()=>{
  for(const query of ['', '?compat=1']){
    let destination='';
    const css={supports:()=>true};
    runInNewContext(boot,{
      document:{createElement:()=>({noModule:true})},
      window:{fetch:()=>{},URL,ResizeObserver:()=>{},structuredClone,CSS:css,setTimeout:()=>{}},
      CSS:css,
      location:{search:query,hash:'',replace:(url:string)=>{destination=url;}},
    });
    expect(destination).toBe(query?'tv.html?compat=1':'');
  }
});
it('у каждой публичной фотографии есть JPEG с теми же размерами для плашек',async()=>{
  const pack=JSON.parse(readFileSync('public/content/questions.json','utf8'));
  const paths=new Set<string>();
  for(const cat of pack.categories)for(const q of cat.questions)if(q.media){
    if(q.media.panels)for(const panel of q.media.panels)paths.add(panel.path);
    else paths.add(q.media.path);
  }
  for(const path of paths){
    const jpg='public/'+path.replace(/\.webp$/,'.jpg');
    expect(existsSync(jpg)).toBe(true);
    const [modern,legacy]=await Promise.all([sharp('public/'+path).metadata(),sharp(jpg).metadata()]);
    expect(legacy.format).toBe('jpeg');
    expect([legacy.width,legacy.height]).toEqual([modern.width,modern.height]);
  }
});
