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
      const data=Object.fromEntries(pack.categories.flatMap((c:any)=>c.questions.map((q:any)=>[q.id,{answer:q.answer,explanation:q.explanation,accepted_answers:q.accepted_answers,host_note:q.host_note}])));
      res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data));
    }else next();
  });}
}], base: './', build:{rollupOptions:{input:{main:'index.html',tv:'tv.html'}}} };
});
