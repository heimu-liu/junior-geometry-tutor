/* Real authenticated Codex + local geometry/proof + browser. No plan fixtures. */
const {chromium}=require('playwright');const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'../..'),OUT=path.join(ROOT,'tests/verified/evidence-real'),WORK=path.join(ROOT,'.runtime/verified-v0.3/jobs');fs.mkdirSync(OUT,{recursive:true});
const cases=[
{id:'isosceles70',source:'https://www.ecsponline.com/yz/B10A6526763AD4825AB36B4D3C2271BBF000.pdf',reference:'作业7 等腰三角形的轴对称性(1)，第6(1)题；将填空改写为求角并展开角名',q:'在三角形ABC中，AB=AC，∠BAC=70°。求∠ABC和∠ACB的度数。',knowledge:['angle','isosceles'],status:'ready',answer:'55',rule:'isosceles_base_angles'},
{id:'isosceles90',source:'https://www.ecsponline.com/yz/B10A6526763AD4825AB36B4D3C2271BBF000.pdf',reference:'同一作业第6(2)题；未使用提示词示范的70度数值，验证新题参数与解题结果',q:'在三角形ABC中，AB=AC，∠BAC=90°。求∠ABC和∠ACB的度数。',knowledge:['angle','isosceles'],status:'ready',answer:'45',rule:'isosceles_base_angles'},
{id:'kiteSSS',source:'https://v3.ykt.cbern.com.cn/65/document/d726106ca51c11ec9c6bfa20200f090a/pdf.pdf',reference:'青岛版八上，第16页练习2；按题意将∠A、∠C写为∠BAD、∠BCD，证据为官方PDF搜索索引文本，未声称原图像素核验',q:'四边形ABCD中，AB=CB，AD=CD。求证∠BAD=∠BCD。',knowledge:['angle','congruence'],status:'ready',answer:'∠BAD = ∠BCD',rule:'SSS'},
{id:'equilateralSSS',source:'https://v3.ykt.cbern.com.cn/65/document/d726106ca51c11ec9c6bfa20200f090a/pdf.pdf',reference:'青岛版八上，第16页练习1(3)；给两个等边三角形及相等的一边命名，改为求证形式',q:'△ABC是等边三角形，△DEF是等边三角形，AB=DE。求证△ABC≌△DEF。',knowledge:['angle','isosceles','congruence'],status:'ready',answer:'△ABC ≌ △DEF',rule:'SSS'},
{id:'scopeBlocked',reference:'范围反例：与 kiteSSS 同题，取消全等知识',q:'四边形ABCD中，AB=CB，AD=CD。求证∠BAD=∠BCD。',knowledge:['angle'],status:'out_of_scope'},
{id:'ambiguous',reference:'语义边界：角的位置未提供；当前引擎不作分类讨论',q:'一个等腰三角形有一个角是55°。求另外两个角的度数。',knowledge:['angle','isosceles'],status:'needs_clarification'}
].filter(c=>!process.env.CASE||process.env.CASE.split(',').includes(c.id));
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});const results=[];
for(const c of cases){const out=path.join(OUT,c.id);fs.mkdirSync(out,{recursive:true});const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.tracing.start({screenshots:true,snapshots:true,sources:true});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));let job=null,result={...c,real_model_called:true,passed:false,errors};
try{
 await page.goto(process.env.VERIFIED_URL||'http://127.0.0.1:8768/');await page.locator('#settingsButton').click();await page.locator('#grade').selectOption('8');await page.locator('#edition').selectOption('pep');await page.locator('#chapter').fill('等腰三角形与全等三角形');
 const checks=page.locator('input[name=knowledge]');for(let n=0;n<await checks.count();n++)await checks.nth(n).setChecked(c.knowledge.includes(await checks.nth(n).getAttribute('value')));
 await page.locator('#settingsForm button[type=submit]').click();await page.locator('#newQuestion').click();await page.locator('#questionInput').fill(c.q);
 let finalResolve;const finalPromise=new Promise(resolve=>finalResolve=resolve);
 page.on('response',async response=>{if(!response.url().includes('/api/jobs/'))return;try{const j=await response.json();if(job&&j.id===job.id&&['ready','needs_clarification','out_of_scope','failed','canceled'].includes(j.status))finalResolve(j);}catch{}});
 const post=page.waitForResponse(r=>r.url().endsWith('/api/jobs')&&r.request().method()==='POST');await page.locator('#applyQuestion').click();job=await(await post).json();result.job=job.id;console.log('RUN',c.id,job.id);
 await page.locator('[data-tool=pen]').click();const bb=await page.locator('#drawingBoard').boundingBox();await page.mouse.move(bb.x+bb.width*.15,bb.y+bb.height*.85);await page.mouse.down();await page.mouse.move(bb.x+bb.width*.3,bb.y+bb.height*.8,{steps:8});await page.mouse.up();const draft=await page.locator('#userLayer').innerHTML();assert(draft.length>0);
 const final=await Promise.race([finalPromise,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Model timeout')),270000);timer.unref();})]);result.status=final.status;assert.equal(final.status,c.status,final.message);
 // Wait until the browser has applied the terminal response.
 if(c.status==='ready')await page.waitForFunction(()=>document.querySelector('#lessonNumber').textContent==='✦');else await page.waitForFunction(()=>!document.querySelector('#generationBox').hidden&&document.querySelector('#cancelGeneration').hidden);
 assert.equal(await page.locator('#userLayer').innerHTML(),draft,'generation preserves drawing');await page.locator('#undoButton').click();assert.equal(await page.locator('#userLayer').innerHTML(),'');await page.locator('#redoButton').click();assert.equal(await page.locator('#userLayer').innerHTML(),draft);
 assert(await page.locator('#hintPanel').isHidden(),'hints initially closed');if(c.status==='ready'){await page.locator('#parsedConditions summary').click();assert((await page.locator('#parsedConditionList li').count())>0);await page.locator('#parsedConditions summary').click();}await page.screenshot({path:path.join(out,'initial.png')});
 for(const name of ['request.json','plan.json','lesson.json','proof-report.json']){const from=path.join(WORK,job.id,name);if(fs.existsSync(from))fs.copyFileSync(from,path.join(out,name));}
 if(c.status==='ready'){
  const proof=JSON.parse(fs.readFileSync(path.join(out,'proof-report.json'),'utf8'));assert(proof.goal_reached);assert(proof.rules.includes(c.rule));result.proof_rules=proof.rules;
  if(c.id==='isosceles70'){assert(!(await page.locator('#lessonLayer').textContent()).includes('55'));assert(!(await page.locator('#questionGoal').innerText()).includes('55'));}
  const lesson=final.lesson;result.steps=[];
  for(let mi=0;mi<lesson.methods.length;mi++){
   if(mi===0)await page.locator('#openHints').click();else await page.locator('#methodSelect').selectOption(lesson.methods[mi].id);
   for(let i=0;i<lesson.methods[mi].steps.length;i++){
    const step=lesson.methods[mi].steps[i];for(const prim of step.reveal)assert.equal(await page.locator(`[data-primitive="${prim.id}"]`).count(),0,'current conclusion not revealed early');
    await page.locator('#revealStep').click();assert(await page.locator('#explanation').isHidden());for(const prim of step.reveal)assert.equal(await page.locator(`[data-primitive="${prim.id}"]`).count(),0);
    await page.locator('#revealStep').click();await page.waitForFunction(()=>[...document.querySelectorAll('#lessonLayer [data-aux]')].every(e=>getComputedStyle(e).opacity==='1'));const explanation=await page.locator('#explanation').innerText();assert(explanation.includes('本步依据'));for(const prim of step.reveal)assert((await page.locator(`[data-primitive="${prim.id}"]`).count())>0,'reveal linked to explanation');
    result.steps.push({method:lesson.methods[mi].id,index:i+1,text:explanation,revealed:step.reveal.length});await page.screenshot({path:path.join(out,`method${mi+1}-step${i+1}.png`)});
    if(i+1<lesson.methods[mi].steps.length)await page.locator('#nextStep').click();
   }
  }
  const proofText=JSON.stringify(proof);assert(proofText.includes(c.answer)||result.steps.some(x=>x.text.includes(c.answer)),c.answer+' missing');
  assert.equal(await page.locator('#userLayer').innerHTML(),draft);await page.locator('#nextStep').click();assert(await page.locator('#hintPanel').isHidden());
  // Save an independently reopenable page of the exact compiled model lesson.
  const {execFileSync}=require('node:child_process');execFileSync('python3',[path.join(ROOT,'scripts/build_page.py'),'--lesson',path.join(out,'lesson.json'),'--request',path.join(out,'request.json'),'--output',path.join(out,'learning.html')],{cwd:ROOT});
 }
 assert.deepEqual(errors,[]);result.passed=true;console.log('PASS',c.id,result.steps?.length||c.status);
}catch(error){result.error=error.stack;console.error('FAIL',c.id,error.message);await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});if(job){for(const attempt of ['attempt-1','attempt-2']){const fp=path.join(WORK,job.id,attempt,'validation-error.log');if(fs.existsSync(fp))result[attempt]=fs.readFileSync(fp,'utf8');}}process.exitCode=1;
}finally{result.date=new Date().toISOString();fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));await context.tracing.stop({path:path.join(out,'trace.zip')});await context.close();results.push(result);}}
await browser.close();fs.writeFileSync(path.join(OUT,process.env.CASE?'targeted-'+process.env.CASE+'.json':'results.json'),JSON.stringify({passed:results.every(x=>x.passed),results},null,2));})();
