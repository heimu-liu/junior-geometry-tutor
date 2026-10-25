/* Full local lesson flow with the user's opt-in local photo fixture. No model call. */
const {chromium}=require('playwright');
const {spawn,execFileSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'../..'),DIR=process.env.DOORFRAME_DIR;
if(!DIR)throw Error('Set DOORFRAME_DIR to the local doorframe lesson directory containing original.png, plan/request/presentation.json.');
const OUT=path.join(DIR,'acceptance-photo'),WORK=path.join(OUT,'workspace');fs.mkdirSync(OUT,{recursive:true});
const lesson=JSON.parse(fs.readFileSync(path.join(DIR,'lesson.json'),'utf8')),photo=fs.readFileSync(path.join(DIR,'original.png'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{
 const server=spawn('python3',['scripts/serve.py','--workspace',WORK,'--port','0','--no-open','--plan',path.join(DIR,'plan.json'),'--request',path.join(DIR,'request.json'),'--presentation',path.join(DIR,'presentation.json')],{cwd:ROOT,stdio:['ignore','pipe','pipe']});
 let logs='',browser,context,page;const checks=[],errors=[];server.stderr.on('data',d=>logs+=d);
 const passed=(name,details={})=>checks.push({name,passed:true,...details});
 try{
  const info=await new Promise((resolve,reject)=>{let b='';server.stdout.on('data',d=>{b+=d;if(b.includes('\n'))resolve(JSON.parse(b.split('\n')[0]));});server.on('exit',()=>reject(Error(logs)));});
  browser=await chromium.launch({channel:'chrome',headless:true});context=await browser.newContext({viewport:{width:1550,height:1050}});await context.tracing.start({screenshots:true,snapshots:true,sources:true});page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(info.url);await page.locator('#photoLayer image').waitFor();
  const src=await page.locator('#photoLayer image').getAttribute('href');assert.equal(hash(Buffer.from(src.split(',')[1],'base64')),hash(photo));
  assert(await page.locator('#photoLayer image').evaluate(async e=>{const i=new Image();i.src=e.getAttribute('href');await i.decode();return i.naturalWidth>1000&&i.naturalHeight>1000;}));
  assert.equal(await page.locator('#questionTitle').innerText(),lesson.title);assert(await page.locator('#hintPanel').isHidden());
  assert.equal(await page.locator('#contextLayer [data-context]').count(),3);assert.equal(await page.locator('#contextLayer [data-context=conclusion]').count(),0);
  const pts=lesson.scene.points;const cord=await page.locator('[data-context=string]').evaluate(e=>({x1:+e.getAttribute('x1'),x2:+e.getAttribute('x2'),y1:+e.getAttribute('y1'),y2:+e.getAttribute('y2')}));
  assert.equal(cord.x1,pts.A[0]);assert.equal(cord.x2,pts.C[0]);assert.equal(cord.y1,pts.A[1]);assert(cord.y2>pts.C[1]);assert(pts.C[1]-pts.E[1]>pts.E[1]-pts.A[1]);
  passed('embedded-original-and-aligned-context',{photo_sha256:hash(photo)});await page.screenshot({path:path.join(OUT,'01-compare.png')});
  for(const view of ['photo','redraw','compare']){await page.locator(`[data-board-view=${view}]`).click();assert.equal(await page.locator(`[data-board-view=${view}]`).getAttribute('aria-pressed'),'true');await page.screenshot({path:path.join(OUT,'view-'+view+'.png')});}passed('three-board-views');
  await page.locator('[data-board-view=redraw]').click();const bb=await page.locator('#drawingBoard').boundingBox();await page.mouse.move(bb.x+bb.width*.25,bb.y+bb.height*.2);await page.mouse.down();await page.mouse.move(bb.x+bb.width*.35,bb.y+bb.height*.24,{steps:8});await page.mouse.up();const ink=await page.locator('#userLayer').innerHTML();assert(ink.length);await page.locator('#undoButton').click();assert.equal(await page.locator('#userLayer').innerHTML(),'');await page.locator('#redoButton').click();assert.equal(await page.locator('#userLayer').innerHTML(),ink);
  await page.locator('#openHints').click();const steps=lesson.methods[0].steps;
  for(let i=0;i<steps.length;i++){
   const step=steps[i];assert.equal(await page.locator('[data-context=conclusion]').count(),0);assert(!(await page.locator('#lessonLayer').textContent()).includes('90°'));assert(!(await page.locator('#stepTitle').innerText()).includes('90°'));
   for(const shape of step.reveal)assert.equal(await page.locator(`[data-primitive="${shape.id}"]`).count(),0);
   await page.locator('#revealStep').click();assert(await page.locator('#explanation').isHidden());for(const shape of step.reveal)assert.equal(await page.locator(`[data-primitive="${shape.id}"]`).count(),0);
   await page.locator('#revealStep').click();await page.waitForFunction(()=>[...document.querySelectorAll('#lessonLayer [data-aux]')].every(e=>getComputedStyle(e).opacity==='1'));
   for(const shape of step.reveal)assert.equal(await page.locator(`[data-primitive="${shape.id}"]`).count(),1);
   assert((await page.locator('#explanation').innerText()).includes('本步依据'));if(i===1||i===3)assert(step.reveal.some(p=>p.kind==='angleArc'));
   assert.equal(await page.locator('#userLayer').innerHTML(),ink);assert.equal(await page.locator('#photoLayer image').getAttribute('href'),src);
   await page.screenshot({path:path.join(OUT,`step-${i+1}.png`)});passed('step-'+(i+1)+'-linked-reveal');if(i<steps.length-1)await page.locator('#nextStep').click();
  }
  assert((await page.locator('#explanation').innerText()).includes('门框是水平的'));assert((await page.locator('#lessonLayer').textContent()).includes('90°'));assert.equal(await page.locator('[data-context=conclusion]').textContent(),'水平');passed('physical-conclusion-after-proof');
  await page.locator('#previousStep').click();assert.equal(await page.locator('[data-context=conclusion]').count(),0);assert(!(await page.locator('#lessonLayer').textContent()).includes('90°'));
  await page.locator('#closeHints').click();assert.equal(await page.locator('[data-angle-arc]').count(),0);assert.equal(await page.locator('#userLayer').innerHTML(),ink);passed('back-close-and-ink-undo');
  // Attaching a photo to an existing checked lesson must keep that lesson and its ink.
  await page.locator('#photoInput').setInputFiles(path.join(DIR,'original.png'));await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('题图已放入'));
  assert.equal(await page.locator('#questionTitle').innerText(),lesson.title);assert.equal(await page.locator('#userLayer').innerHTML(),ink);assert.equal(await page.locator('[data-context=doorframe]').count(),1);passed('photo-upload-preserves-lesson');
  await page.locator('#moreButton').click();let download=page.waitForEvent('download');await page.locator('#saveSession').click();const saved=await download;const sessionPath=path.join(OUT,'session.json');await saved.saveAs(sessionPath);
  const session=JSON.parse(fs.readFileSync(sessionPath,'utf8'));assert(Object.keys(session.presentations).length);assert(Object.values(session.records).some(r=>r.photo?.src===src));
  await page.locator('#sessionInput').setInputFiles(sessionPath);await page.locator('#confirmAction').click();assert.equal(await page.locator('#photoLayer image').getAttribute('href'),src);assert.equal(await page.locator('[data-context=plumb]').count(),1);assert.equal(await page.locator('#userLayer').innerHTML(),ink);passed('record-export-import');
  await page.locator('[data-board-view=compare]').click();download=page.waitForEvent('download');await page.locator('#exportButton').click();const png=await download;await png.saveAs(path.join(OUT,'board-export.png'));assert(fs.statSync(path.join(OUT,'board-export.png')).size>30000);passed('png-export-with-photo-and-context');
  // The lesson file/URL must reopen its bound question even if an example was selected last.
  await page.locator('#newQuestion').click();await page.locator('#examplePicker button').first().click();await page.locator('#applyQuestion').click();assert.notEqual(await page.locator('#questionTitle').innerText(),lesson.title);await page.reload();await page.locator('#photoLayer image').waitFor();assert.equal(await page.locator('#questionTitle').innerText(),lesson.title);assert.equal(await page.locator('[data-context=plumb]').count(),1);passed('reopen-bound-question-not-old-example');
  await page.setViewportSize({width:390,height:844});await page.locator('[data-board-view=photo]').click();assert(await page.locator('#drawingBoard').isVisible());await page.screenshot({path:path.join(OUT,'mobile-photo.png')});await page.locator('#openHints').click();assert(await page.locator('#revealStep').isVisible());await page.screenshot({path:path.join(OUT,'mobile-hint.png')});
  assert(await page.locator('#drawingBoard').evaluate(svg=>{const v=svg.viewBox.baseVal,c=svg.querySelector('[data-view-clip]');return ['x','y','width','height'].every(k=>+c.getAttribute(k)===v[k]);}));
  const layout=await page.evaluate(()=>{const svg=document.querySelector('#drawingBoard'),box=svg.getBoundingClientRect(),tools=document.querySelector('.pen-options').getBoundingClientRect(),footer=document.querySelector('.history-controls').getBoundingClientRect();return {top:box.top,bottom:box.bottom,toolsBottom:tools.bottom,footerTop:footer.top};});assert(layout.top>=layout.toolsBottom);assert(layout.bottom<=layout.footerTop);passed('mobile-controls-and-hints',{layout});
  assert.deepEqual(errors,[]);console.log('PASS',checks.length,'doorframe photo E2E checks');
 }catch(error){checks.push({passed:false,error:error.stack});console.error(error.stack);process.exitCode=1;if(page)await page.screenshot({path:path.join(OUT,'failure.png')}).catch(()=>{});}
 finally{if(context)await context.tracing.stop({path:path.join(OUT,'trace.zip')});if(browser)await browser.close();server.kill('SIGTERM');fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({passed:checks.length>0&&checks.every(c=>c.passed),checks,errors,source_photo_sha256:hash(photo),date:new Date().toISOString()},null,2));}
})();
