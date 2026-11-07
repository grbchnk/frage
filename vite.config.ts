import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {readFileSync} from 'node:fs';
export default defineConfig({ plugins: [react(), {
  name:'local-demo-answers',
  configureServer(server){ server.middlewares.use((req,res,next)=>{
    if(req.url?.split('?')[0].endsWith('/__demo_answers')){
      const pack=JSON.parse(readFileSync('quiz-pack.json','utf8'));
      const data=Object.fromEntries(pack.categories.flatMap((c:any)=>c.questions.map((q:any)=>[q.id,{answer:q.answer,explanation:q.explanation,accepted_answers:q.accepted_answers,host_note:q.host_note}])));
      res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data));
    }else next();
  });}
}], base: './' });
