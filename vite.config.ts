import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import {readFileSync} from 'node:fs';
export default defineConfig(({mode})=>{
const env={...loadEnv(mode,process.cwd(),'VITE_'),...process.env};
return { plugins: [react(), {
  name:'tv-public-config',
  transformIndexHtml(html){
    // Only the same public credentials used by the main client; never host answers.
    const config=JSON.stringify({url:env.VITE_SUPABASE_URL||'',key:env.VITE_SUPABASE_PUBLISHABLE_KEY||''}).replace(/</g,'\\u003c');
    return html.replace('/* TV_PUBLIC_CONFIG */',`window.QUIZ_TV_CONFIG=${config};`);
  }
}, {
  name:'local-demo-answers',
  configureServer(server){ server.middlewares.use((req,res,next)=>{
    if(req.url?.split('?')[0].endsWith('/__demo_answers')){
      const pack=JSON.parse(readFileSync('quiz-pack.json','utf8'));
      const ownAnswer=(q:any)=>[q.id,{answer:q.answer,explanation:q.explanation??'',accepted_answers:q.accepted_answers??[],host_note:q.host_note??'',
        hint:q.hint,correctOption:q.correctOption,target:q.target,correctOrder:q.correctOrder}];
      const id=new URL(req.url,'http://localhost').searchParams.get('id');
      const regular=pack.categories.flatMap((category:any)=>category.questions).find((q:any)=>q.id===id);
      const final=regular?null:(pack.finals??[]).flatMap((category:any)=>category.questions).find((q:any)=>q.id===id);
      const question=regular??final;
      res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
      if(!question){res.statusCode=404;res.end('{}');return;}
      res.end(JSON.stringify({...ownAnswer(question)[1] as object,...(final?{finalPrompt:final.prompt}:{})}));
    }else next();
  });}
}], base: './', build:{rollupOptions:{input:{main:'index.html',tv:'tv.html'}}} };
});
