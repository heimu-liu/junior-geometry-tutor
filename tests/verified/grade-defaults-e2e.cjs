/* Grade selection -> real local request queue; no model call or theorem-checkbox setup. */
const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'../..'),OUT=path.join(ROOT,'tests/verified/evidence-grade-defaults'),WORK=path.join(OUT,'workspace');
const defaults=JSON.parse(fs.readFileSync(path.join(ROOT,'references/grade-defaults.json'),'utf8'));
fs.mkdirSync(OUT,{recursive:true});
(async()=>{
 const server=spawn('python3',['scripts/serve.py','--workspace',WORK,'--port','0','--no-open'],{cwd:ROOT,stdio:['ignore','pipe','pipe']});
 let logs='',browser,context,page;const checks=[],errors=[];server.stderr.on('data',d=>logs+=d);
 try{
  const info=await new Promise((resolve,reject)=>{let b='';server.stdout.on('data',d=>{b+=d;if(b.includes('\n'))resolve(JSON.parse(b.split('\n')[0]));});server.on('exit',()=>reject(Error(logs)));});
  browser=await chromium.launch({channel:'chrome',headless:true});context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.tracing.start({screenshots:true,snapshots:true,sources:true});page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(info.url);
  for(const grade of ['7','9','8']){
   await page.locator('#settingsButton').click();assert.equal(await page.locator('#chapter,input[name=knowledge]').count(),0);
   await page.locator('#grade').selectOption(grade);await page.locator('#settingsForm button[type=submit]').click();
   await page.locator('#newQuestion').click();await page.locator('#questionInput').fill('在三角形ABC中，AB=AC，∠BAC=70°。求∠ABC的度数。');
   const response=page.waitForResponse(r=>r.url().endsWith('/api/jobs')&&r.request().method()==='POST');await page.locator('#applyQuestion').click();
   const job=await(await response).json();const request=JSON.parse(fs.readFileSync(path.join(WORK,'jobs',job.id,'request.json'),'utf8'));
   assert.equal(request.profile.grade,grade);assert.deepEqual(request.profile.knowledge,defaults.grades[grade]);assert.equal(request.profile.chapter,'');
   await page.locator('#cancelGeneration').click();checks.push({name:'grade-'+grade+'-request-defaults',passed:true,profile:request.profile});
  }
  // An old saved manual list must not survive a reload or a session-file import.
  const old=await page.evaluate(()=>JSON.parse(localStorage.getItem('geometry-study-room.v2.workspace')));
  old.profile.grade='7';old.profile.knowledge=['angle','congruence','circle'];old.profile.chapter='旧章节';
  await page.addInitScript(s=>localStorage.setItem('geometry-study-room.v2.workspace',JSON.stringify(s)),old);await page.reload();
  assert((await page.locator('#profileSummary').innerText()).includes('七年级'));await page.locator('#settingsButton').click();await page.locator('#settingsForm button[type=submit]').click();
  const normalized=await page.evaluate(()=>JSON.parse(localStorage.getItem('geometry-study-room.v2.workspace')));
  assert.deepEqual(normalized.profile.knowledge,defaults.grades['7']);assert.equal(normalized.profile.chapter,'');checks.push({name:'saved-profile-migration',passed:true});
  await page.locator('#sessionInput').setInputFiles({name:'old-session.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(old))});await page.locator('#confirmAction').click();
  const imported=await page.evaluate(()=>JSON.parse(localStorage.getItem('geometry-study-room.v2.workspace')));assert.deepEqual(imported.profile.knowledge,defaults.grades['7']);checks.push({name:'imported-profile-migration',passed:true});
  await page.locator('#settingsButton').click();await page.locator('#grade').selectOption('8');await page.locator('.grade-scope summary').click();await page.screenshot({path:path.join(OUT,'grade-settings.png')});
  await page.setViewportSize({width:390,height:844});assert(await page.locator('#settingsForm button[type=submit]').isVisible());await page.screenshot({path:path.join(OUT,'grade-settings-mobile.png')});
  assert.deepEqual(errors,[]);console.log('PASS',checks.length,'grade-default browser checks');
 }catch(error){checks.push({passed:false,error:error.stack});console.error(error.stack);process.exitCode=1;if(page)await page.screenshot({path:path.join(OUT,'failure.png')}).catch(()=>{});}
 finally{if(context)await context.tracing.stop({path:path.join(OUT,'trace.zip')});if(browser)await browser.close();server.kill('SIGTERM');fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({passed:checks.length>0&&checks.every(c=>c.passed),checks,errors,date:new Date().toISOString()},null,2));}
})();
