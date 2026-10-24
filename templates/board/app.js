(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  const boot=window.GEOMETRY_BOOTSTRAP||{}, bridge=window.GEOMETRY_BRIDGE||null, codec=window.GeometryLessonCodec;
  const KEY = 'geometry-study-room.v2.'+(boot.lesson?.request_id||'workspace');
  const builtins = window.GeometryLessons, lessons=[...builtins];
  const knowledgeNames = { angle:'角与三角形内角和', area:'三角形面积', isosceles:'等腰三角形', congruence:'全等三角形', pythagoras:'勾股定理', factorization:'因式分解', parallel:'平行线', similarity:'相似三角形', circle:'圆的性质', quadrilateral:'四边形', coordinate:'平面直角坐标系' };
  const icons = {
    cursor:'M5 3l13 9-6 1-3 6-4-16z', pen:'M4 16l-1 5 5-1L20 8l-4-4L4 16zM14 6l4 4', line:'M5 18L19 6M4 17h2v2H4zM18 5h2v2h-2z', straight:'M3 21L21 3M3 16v5h5M16 3h5v5', triangle:'M12 4L3 20h18L12 4z', rightTriangle:'M4 4v16h16L4 4zM4 16h4v4', circle:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', text:'M4 5h16M12 5v15M8 20h8', eraser:'M3 15l10-11 8 7-9 10H9l-6-6zM7 11l8 7M12 21h9', hand:'M8 11V5a2 2 0 0 1 4 0v6-8a2 2 0 0 1 4 0v8-5a2 2 0 0 1 4 0v8c0 5-3 7-7 7-3 0-4-2-6-4l-3-4a2 2 0 0 1 3-2l1 1', dashed:'M2 12h4M10 12h4M18 12h4', undo:'M8 5L3 10l5 5M3 10h10a7 7 0 0 1 7 7', redo:'M16 5l5 5-5 5M21 10H11a7 7 0 0 0-7 7', image:'M3 4h18v16H3zM3 16l5-5 4 4 3-3 6 6M16 8h.01', download:'M12 3v12M7 10l5 5 5-5M4 16v5h16v-5', more:'M5 12h.01M12 12h.01M19 12h.01', plus:'M12 5v14M5 12h14', minus:'M5 12h14', arrowRight:'M4 12h15M13 6l6 6-6 6', arrowLeft:'M20 12H5M11 6l-6 6 6 6', arrowUp:'M12 20V5M6 11l6-6 6 6', arrowDown:'M12 4v15M6 13l6 6 6-6', close:'M6 6l12 12M6 18L18 6', panelLeft:'M3 4h18v16H3zM9 4v16M15 9l-3 3 3 3', chevronDown:'M6 9l6 6 6-6', info:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM12 11v6M12 7h.01', edit:'M14 5l5 5M4 20l5-1L21 7l-4-4L5 15l-1 5z', spark:'M12 3l2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6L12 3z' };
  function iconMarkup(name) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icons[name] || icons.plus}"/></svg>`; }
  document.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = iconMarkup(el.dataset.icon));
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clone = x => JSON.parse(JSON.stringify(x));
  const initialProfile = { grade:'8', edition:'unknown', chapter:'', knowledge:['angle','area','isosceles','congruence'], confirmed:false };
  let state = { schema:'geometry-study-room/1', lessonId:lessons[0].id, profile:clone(initialProfile), records:{}, customText:'', collapsed:false, generatedLessons:[], pendingRequest:null };
  let current = { items:[], methodId:lessons[0].methods[0].id, step:0, level:0, hintsOpen:false, photo:null, view:{x:0,y:0,width:1000,height:700} };
  let activeJob=null, generationEpoch=0, generateAfterSettings=false;
  let drawing, saveTimer, toastTimer, textCallback, confirmation, selectedExample=null, importing=false, pendingPhoto=null;

  function lesson() { return lessons.find(l => l.id === state.lessonId) || null; }
  function permittedMethods() { return (lesson()?.methods || []).filter(m => m.requires.every(k => state.profile.knowledge.includes(k))); }
  function method() { return permittedMethods().find(m => m.id === current.methodId) || permittedMethods()[0] || null; }
  function toast(message) { $('toast').textContent = message; $('toast').hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').hidden=true,3300); }
  function showDialog(id) { if (!$(id).open) $(id).showModal(); }
  function view() { const v=$('drawingBoard').viewBox.baseVal; return {x:v.x,y:v.y,width:v.width,height:v.height}; }
  function stash() { if (!drawing) return; current.items=drawing.getItems(); current.view=view(); state.records[state.lessonId]=clone(current); }
  function persist() { if(importing) return; clearTimeout(saveTimer); stash(); try {localStorage.setItem(KEY,JSON.stringify(state));$('saveStatus').textContent='已保存';} catch { $('saveStatus').textContent='未保存，请导出记录'; } }
  function scheduleSave() { if(importing)return; $('saveStatus').textContent='保存中'; clearTimeout(saveTimer);saveTimer=setTimeout(persist,250); }
  function validateSession(raw) {
    if(!Array.isArray(raw?.generatedLessons||[])||(raw?.generatedLessons||[]).length>30)throw Error('学习记录中的题目过多。');
    const generated=(raw?.generatedLessons||[]).map(x=>codec.check(x));
    const ids=['custom',...builtins.map(l=>l.id),...generated.map(l=>'generated-'+l.id)];
    if (!raw || raw.schema!=='geometry-study-room/1' || !raw.profile || !raw.records || !ids.includes(raw.lessonId)) throw Error('文件不是有效的几何学习记录。');
    if(!Array.isArray(raw.profile.knowledge) || typeof raw.records!=='object' || Array.isArray(raw.records)) throw Error('学习记录结构不完整。');
    const profile={grade:['7','8','9'].includes(raw.profile.grade)?raw.profile.grade:'8',edition:String(raw.profile.edition||'unknown').slice(0,80),chapter:String(raw.profile.chapter||'').slice(0,100),knowledge:raw.profile.knowledge.filter(k=>knowledgeNames[k]),confirmed:!!raw.profile.confirmed};
    const records={};
    for(const [id,r] of Object.entries(raw.records)) {
      if(!ids.includes(id)||!r||!Array.isArray(r.items)) throw Error('学习记录中的画板数据不完整。');
      const v=r.view||{}; const validView=['x','y','width','height'].every(k=>typeof v[k]==='number'&&Number.isFinite(v[k]))&&v.width>=100&&v.width<=6000&&v.height>=70&&v.height<=4200&&Math.abs(v.x)<10000&&Math.abs(v.y)<10000;
      let photo=null;
      if(r.photo) { const p=r.photo;if(typeof p.src!=='string'||!/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(p.src)||p.src.length>8000000||!['x','y','width','height','scale'].every(k=>typeof p[k]==='number'&&Number.isFinite(p[k]))||p.width<1||p.height<1||p.width>2000||p.height>2000||p.scale<.3||p.scale>1.5||Math.abs(p.x)>10000||Math.abs(p.y)>10000)throw Error('学习记录中的图片无效。');photo={src:p.src,x:p.x,y:p.y,width:p.width,height:p.height,scale:p.scale}; }
      records[id]={items:r.items.slice(0,10000),methodId:typeof r.methodId==='string'?r.methodId:'',step:Number.isInteger(r.step)?Math.max(0,Math.min(20,r.step)):0,level:[0,1,2].includes(r.level)?r.level:0,hintsOpen:!!r.hintsOpen,photo,view:validView?v:{x:0,y:0,width:1000,height:700}};
    }
    let pendingRequest=null;if(raw.pendingRequest){const r=raw.pendingRequest;codec.profile(r.profile);if(r.schema!=='geometry-request/1'||typeof r.id!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/.test(r.id)||typeof r.question!=='string'||r.question.length>6000)throw Error('题目交接记录无效。');if(codec.sameProfile(r.profile,profile))pendingRequest=clone(r);}
    return {schema:raw.schema,profile,records,lessonId:raw.lessonId,customText:String(raw.customText||'').slice(0,6000),collapsed:!!raw.collapsed,generatedLessons:generated,pendingRequest};
  }
  try {const raw=localStorage.getItem(KEY);if(raw)state=validateSession(JSON.parse(raw));}catch{/* A damaged local record never prevents opening the board. */}

  function registerGenerated(){lessons.splice(0,lessons.length,...builtins,...state.generatedLessons.map(x=>codec.adapt(x)));}
  registerGenerated();
  if(boot.lesson&&!lessons.some(l=>l.raw?.request_id===boot.lesson.request_id)){const l=codec.adapt(boot.lesson);state.generatedLessons.push(l.raw);registerGenerated();state.lessonId=l.id;state.profile=clone(boot.profile);}

  function updateDrawingControls(s) {
    $('undoButton').disabled=!s.canUndo;$('redoButton').disabled=!s.canRedo;
    document.querySelectorAll('[data-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tool===s.tool)));
    $('zoomReset').textContent=Math.round(100000/view().width)+'%';
  }
  drawing=new window.GeometryDrawing($('drawingBoard'),$('userLayer'),{
    onChange(s){updateDrawingControls(s);scheduleSave();},
    onToolChange(){if(drawing)updateDrawingControls(drawing.getState());},
    onRequestText(point,callback){textCallback=callback;$('annotationInput').value='';showDialog('textDialog');$('annotationInput').focus();}
  });
  drawing.setStyle({color:'#285c4d',width:2.5,dashed:false});

  function loadCurrent() {
    importing=true;
    current=clone(state.records[state.lessonId]||{items:[],methodId:lesson()?.methods[0]?.id||'',step:0,level:0,hintsOpen:false,photo:null,view:{x:0,y:0,width:1000,height:700}});
    drawing.setItems(current.items);drawing.setView(current.view);drawing.setTool('pen');importing=false;
    render();updateDrawingControls(drawing.getState());
  }
  function renderPhoto(){ $('photoLayer').replaceChildren();if(!current.photo)return;const p=current.photo;const image=document.createElementNS(NS,'image');image.setAttribute('href',p.src);image.setAttribute('x',p.x);image.setAttribute('y',p.y);image.setAttribute('width',p.width*p.scale);image.setAttribute('height',p.height*p.scale);image.setAttribute('preserveAspectRatio','xMidYMid meet');image.setAttribute('pointer-events','none');$('photoLayer').append(image); }
  function render() {
    const l=lesson(),m=method();
    if(m) {current.methodId=m.id;current.step=Math.min(current.step,m.steps.length-1);}
    $('workspace').classList.toggle('question-collapsed',state.collapsed);
    $('questionPanel').hidden=state.collapsed;$('expandQuestion').hidden=!state.collapsed;
    $('workspace').classList.toggle('has-hints',current.hintsOpen);$('hintPanel').hidden=!current.hintsOpen;
    $('lessonNumber').textContent=l?.generated?'✦':l?String(lessons.indexOf(l)+1).padStart(2,'0'):'✎';
    $('questionTitle').textContent=l?l.title:'我的几何题';
    $('questionText').innerHTML=l?l.statementHTML:escape(state.customText||'上传题图，或写下你想研究的题目。').replace(/\n/g,'<br>');
    $('questionGoal').innerHTML=l?l.goalHTML:'先在画板上画一画';
    $('parsedConditions').hidden=!l?.generated; $('parsedConditionList').innerHTML=l?.generated?l.raw.givens.map(x=>'<li>'+escape(x)+'</li>').join(''):'';
    $('profileSummary').textContent=state.profile.confirmed?({7:'七',8:'八',9:'九'}[state.profile.grade]+'年级 · 学习范围'):'示例学习范围';
    $('boardMode').textContent=l?'先画一画，慢慢想':'我的思考空间';
    $('generateCurrent').hidden=!!activeJob||(!l&&!state.customText)||(!!l&&!l.generated)||(!!l?.generated&&codec.sameProfile(l.raw.profile,state.profile));
    $('lessonLayer').innerHTML=l?l.render(m?.id||l.methods[0]?.id||'',current.hintsOpen&&m?current.step:-1,current.level===2):'';
    renderPhoto();renderHints();
  }
  function renderHints() {
    const l=lesson(),m=method(),available=permittedMethods();
    const empty=!m;
    ['methodSelect','knowledgeNote','hintProgress','stepCount','stepTitle','stepPrompt','revealStep'].forEach(id=>$(id).hidden=empty||!current.hintsOpen);
    $('smallHint').hidden=true;$('smallHint').textContent='';$('explanation').hidden=true;$('explanation').innerHTML='';
    $('hintEmpty').hidden=!empty;$('nextStep').disabled=empty;$('previousStep').disabled=empty;
    if(!current.hintsOpen){$('stepPrompt').textContent='';$('stepTitle').textContent='';$('hintEmpty').innerHTML='';return;}
    if(empty){$('hintEmpty').innerHTML=l?'这道题的现有解法需要一些尚未勾选的知识。可以核对学习范围，或先自己画一画。<button class="outline-button" id="adjustKnowledge">核对学习范围</button>':'这道题还没有可用提示。先生成题图与提示，或把题目交给当前 Agent。';$('adjustKnowledge')?.addEventListener('click',openSettings);$('tryExample')?.addEventListener('click',openQuestion);return;}
    $('methodSelect').innerHTML=available.map(x=>`<option value="${x.id}">${escape(x.title)}</option>`).join('');$('methodSelect').value=m.id;
    $('knowledgeNote').textContent=(available.length===1?'当前范围可用 1 种方法 · ':'')+m.requires.map(k=>knowledgeNames[k]).join('、');
    $('hintProgress').innerHTML=m.steps.map((_,i)=>`<span class="${i<current.step?'done':i===current.step?'current':''}"></span>`).join('');
    $('stepCount').textContent=`第 ${current.step+1} 步 / 共 ${m.steps.length} 步`;
    const s=m.steps[current.step];$('stepTitle').textContent=s.title;$('stepPrompt').textContent=s.prompt;
    if(current.level>=1){$('smallHint').textContent=s.hint;$('smallHint').hidden=false;}
    if(current.level===2){$('explanation').innerHTML=s.explanation+(s.reason?'<p class="step-reason"><strong>本步依据：</strong>'+escape(s.reason)+'</p>':'');$('explanation').hidden=false;}
    $('revealStep').hidden=current.level===2;$('revealStep').textContent=current.level===0?'再给一点提示':'看看这一步的解释';
    $('nextStep').disabled=current.level<2;$('nextStep').innerHTML=(current.step===m.steps.length-1?'回到自主思考':'下一步')+iconMarkup('arrowRight');
    $('previousStep').disabled=current.step===0;
  }
  function closeHints(){current.hintsOpen=false;render();scheduleSave();}
  $('openHints').onclick=()=>{current.hintsOpen=true;current.step=0;current.level=0;render();scheduleSave();};
  $('closeHints').onclick=closeHints;
  $('revealStep').onclick=()=>{current.level=Math.min(2,current.level+1);render();scheduleSave();};
  $('nextStep').onclick=()=>{const m=method();if(!m||current.level<2)return;if(current.step===m.steps.length-1){closeHints();toast('把刚才的思路，试着自己走一遍。');return;}current.step++;current.level=0;render();$('hintPanel').querySelector('.hint-scroll').scrollTop=0;scheduleSave();};
  $('previousStep').onclick=()=>{if(current.step>0){current.step--;current.level=2;render();scheduleSave();}};
  $('methodSelect').onchange=e=>{current.methodId=e.target.value;current.step=0;current.level=0;render();scheduleSave();};
  $('collapseQuestion').onclick=()=>{state.collapsed=true;render();scheduleSave();};
  $('expandQuestion').onclick=()=>{state.collapsed=false;if(innerWidth<=850&&current.hintsOpen)current.hintsOpen=false;render();scheduleSave();};

  function openSettings(){ $('grade').value=state.profile.grade;if(![...$('edition').options].some(o=>o.value===state.profile.edition)){const o=new Option(state.profile.edition,state.profile.edition);$('edition').add(o);}$('edition').value=state.profile.edition;$('chapter').value=state.profile.chapter;$('knowledgeChoices').innerHTML=Object.entries(knowledgeNames).map(([key,label])=>`<label><input type="checkbox" name="knowledge" value="${key}" ${state.profile.knowledge.includes(key)?'checked':''}>${label}</label>`).join('');showDialog('settingsDialog'); }
  $('settingsButton').onclick=openSettings;
  $('settingsForm').onsubmit=e=>{e.preventDefault();if(!document.querySelector('input[name=knowledge]:checked')){toast('请至少勾选一项确实学过的知识。');return;}cancelGeneration(false);state.pendingRequest=null;state.profile={grade:$('grade').value,edition:$('edition').value,chapter:$('chapter').value,knowledge:[...document.querySelectorAll('input[name=knowledge]:checked')].map(c=>c.value),confirmed:true};current.step=0;current.level=0;current.methodId=permittedMethods()[0]?.id||'';$('settingsDialog').close();render();persist();toast('已按学过的知识重新筛选方法。');if(generateAfterSettings){generateAfterSettings=false;startGeneration();}};

  function plainStatement(l){const div=document.createElement('div');div.innerHTML=l.statementHTML+' '+l.goalHTML;return div.textContent.trim();}
  function openQuestion(){selectedExample=lesson()?.generated?null:lesson()?.id||null;$('questionInput').value=lesson()?plainStatement(lesson()):state.customText;renderExamplePicker();showDialog('questionDialog');}
  function renderExamplePicker(){ $('examplePicker').innerHTML=builtins.map((l,i)=>`<button class="${selectedExample===l.id?'active':''}" data-lesson="${l.id}"><span>例题 ${String(i+1).padStart(2,'0')}</span><strong>${escape(l.shortTitle||l.title)}</strong></button>`).join('');$('examplePicker').querySelectorAll('button').forEach(b=>b.onclick=()=>{selectedExample=b.dataset.lesson;$('questionInput').value=plainStatement(lessons.find(l=>l.id===selectedExample));renderExamplePicker();}); }
  $('questionInput').oninput=()=>{selectedExample=null;renderExamplePicker();};
  $('newQuestion').onclick=openQuestion;$('editQuestion').onclick=openQuestion;
  function switchLesson(id,text){cancelGeneration(false);state.pendingRequest=null;$('generationBox').hidden=true;stash();state.lessonId=id;if(id==='custom'){state.customText=text||'';state.records.custom={items:[],methodId:'',step:0,level:0,hintsOpen:false,photo:null,view:{x:0,y:0,width:1000,height:700}};}loadCurrent();current.hintsOpen=false;render();persist();}
  $('applyQuestion').onclick=()=>{const input=$('questionInput').value.trim();if(!input){toast('先输入题目，或选择一道例题。');return;}if(selectedExample){switchLesson(selectedExample);$('questionDialog').close();}else{switchLesson('custom',input);$('questionDialog').close();startGeneration();}};
  $('uploadFromQuestion').onclick=()=>{pendingPhoto={text:selectedExample?'':$('questionInput').value.trim()};$('photoInput').click();};

  function generationMessage(message,canCancel=false){$('generationBox').hidden=false;$('generationStatus').textContent=message;$('cancelGeneration').hidden=!canCancel;$('generateCurrent').hidden=!!activeJob;}
  async function api(path,options={}){
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
    try{const response=await fetch((bridge.baseUrl||'')+path,{...options,signal:controller.signal,headers:{'Content-Type':'application/json','X-Geometry-Token':bridge.token,...(options.headers||{})}});const data=await response.json();if(!response.ok)throw Error(data.message||data.error||'服务未能处理请求，请重试。');return data;}finally{clearTimeout(timeout);}
  }
  async function updateConnection(){
    if(!bridge){$('connectionNote').textContent='离线模式：先放入题目，再从“更多”导出给当前 Agent，生成后导入结果。';$('applyQuestion').textContent='放入题目';return;}
    try{const health=await api('/api/health');$('connectionNote').textContent=health.mode==='automatic'?`将通过 ${health.provider} 生成题图与分步提示，题目文字会发送给该服务。`:'Agent 文件交接模式：提交后，请让当前 Agent 读取任务并完成解题。';}catch{$('connectionNote').textContent='本地服务未连接。可以保留题目，稍后重试或导出给 Agent。';}
  }
  function requestData(){
    return {schema:'geometry-request/1',id:globalThis.crypto?.randomUUID?.()||('request-'+Date.now()+'-'+Math.random().toString(36).slice(2)),question:lesson()?plainStatement(lesson()):state.customText,profile:clone(state.profile),photo:current.photo?.src||null};
  }
  function cancelGeneration(show=true){
    generationEpoch++;const old=activeJob;activeJob=null;
    if(old&&bridge)api('/api/jobs/'+encodeURIComponent(old)+'/cancel',{method:'POST',body:'{}'}).catch(()=>{});
    if(show){state.pendingRequest=null;generationMessage('已取消生成。题目和笔迹仍保留。');render();persist();}
  }
  $('cancelGeneration').onclick=()=>cancelGeneration();
  $('generateCurrent').onclick=()=>startGeneration();
  async function startGeneration(){
    if(!state.profile.confirmed){generateAfterSettings=true;openSettings();return;}
    if(!state.profile.knowledge.length){toast('先确认已经学过的知识。');openSettings();return;}
    cancelGeneration(false);
    const request=requestData();if(!request.question.trim()){toast('请先写下题目。');return;}
    const epoch=generationEpoch;state.pendingRequest=request;persist();
    if(!bridge){generationMessage('题目已准备好。从画板“更多”中选择“交给其他 Agent”，解题后导入结果。');render();return;}
    // A sentinel also blocks repeat clicks while POST is in flight.
    activeJob='submitting';generationMessage('正在提交题目…',true);render();
    try{
      const result=await api('/api/jobs',{method:'POST',headers:{'Idempotency-Key':request.id},body:JSON.stringify({question:request.question,profile:request.profile,photo:request.photo})});
      if(epoch!==generationEpoch){api('/api/jobs/'+encodeURIComponent(result.id)+'/cancel',{method:'POST',body:'{}'}).catch(()=>{});return;}
      activeJob=result.id;request.id=result.id;state.pendingRequest=request;persist();await handleJob(result,request,epoch);
    }catch(error){if(epoch!==generationEpoch)return;activeJob=null;generationMessage('生成未完成：'+error.message+' 题目已保留，可重试或导出给 Agent。');render();}
  }
  async function handleJob(result,request,epoch){
    if(epoch!==generationEpoch||!codec.sameProfile(request.profile,state.profile))return;
    if(['ready','needs_clarification','out_of_scope'].includes(result.status)){
      activeJob=null;try{acceptLesson(result.lesson,request);}catch(error){generationMessage(error.message);render();}return;
    }
    if(['failed','canceled'].includes(result.status)){activeJob=null;generationMessage(result.message||'生成未完成，请重试。');render();return;}
    const waiting=result.status==='waiting_agent';
    generationMessage(waiting?`等待当前 Agent 完成任务 ${result.id}。可告诉它：“处理队列里的新几何题”。`:(result.message||'正在生成题图与提示…'),true);
    setTimeout(async()=>{if(epoch!==generationEpoch)return;try{const next=await api('/api/jobs/'+encodeURIComponent(result.id));await handleJob(next,request,epoch);}catch(error){if(epoch!==generationEpoch)return;activeJob=null;generationMessage('连接中断，题目已保留。请重试或导出给 Agent。');render();}},1200);
  }
  function acceptLesson(raw,request){
    const adapted=codec.adapt(raw,request);
    if(!codec.sameProfile(raw.profile,state.profile))throw Error('学习范围已经改变，请按当前范围重新生成。');
    if(raw.status!=='ready'){
      generationMessage([raw.message,...raw.questions].filter(Boolean).join('\n'));
      render();persist();return;
    }
    stash();const previous=clone(current);
    state.generatedLessons=state.generatedLessons.filter(l=>l.id!==raw.id);state.generatedLessons.push(adapted.raw);
    // Keep complete editable sessions bounded; older drawings remain in exported records.
    if(state.generatedLessons.length>30){const removed=state.generatedLessons.shift();delete state.records['generated-'+removed.id];}
    registerGenerated();state.lessonId=adapted.id;state.pendingRequest=null;
    state.records[adapted.id]={...previous,methodId:adapted.methods[0].id,step:0,level:0,hintsOpen:false};
    current=clone(state.records[adapted.id]);render();updateDrawingControls(drawing.getState());$('generationBox').hidden=true;persist();toast('题图已画好。需要时，再打开一点提示。');
  }
  $('exportRequest').onclick=()=>{
    if(!state.profile.confirmed){toast('请先确认学习范围，再导出题目。');openSettings();return;}
    const request=state.pendingRequest||requestData();state.pendingRequest=request;persist();
    download(new Blob([JSON.stringify(request,null,2)],{type:'application/json'}),'geometry-request-'+request.id+'.json');
    generationMessage('已导出题目。请交给装有此 Skill 的 Agent，生成并校验 lesson.json 后，用“导入 Agent 解题”打开。');
  };
  $('importLesson').onclick=()=>$('lessonInput').click();
  $('lessonInput').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{if(file.size>12000000)throw Error('解题文件过大。');const raw=JSON.parse(await file.text());if(!state.pendingRequest)throw Error('请先导出当前题目，再导入对应的 Agent 解题文件。');const expected=clone(state.pendingRequest);codec.check(raw,expected);cancelGeneration(false);acceptLesson(raw,expected);}catch(error){toast(error instanceof SyntaxError?'请选择有效的 lesson.json 文件。':error.message);}};

  document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>drawing.setTool(b.dataset.tool));
  document.querySelectorAll('[data-color]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-color]').forEach(x=>x.classList.toggle('selected',x===b));drawing.setStyle({color:b.dataset.color});});
  $('dashedButton').onclick=()=>{const pressed=$('dashedButton').getAttribute('aria-pressed')!=='true';$('dashedButton').setAttribute('aria-pressed',pressed);drawing.setStyle({dashed:pressed});};
  $('strokeWidth').onchange=()=>drawing.setStyle({width:Number($('strokeWidth').value)});
  $('undoButton').onclick=()=>drawing.undo();$('redoButton').onclick=()=>drawing.redo();
  function zoom(factor){const v=view();const width=Math.min(3000,Math.max(250,v.width*factor));const height=width*.7;drawing.setView({x:v.x+(v.width-width)/2,y:v.y+(v.height-height)/2,width,height});updateDrawingControls(drawing.getState());scheduleSave();}
  $('zoomIn').onclick=()=>zoom(.8);$('zoomOut').onclick=()=>zoom(1.25);$('zoomReset').onclick=()=>{drawing.resetView();updateDrawingControls(drawing.getState());scheduleSave();};
  $('textForm').onsubmit=e=>{e.preventDefault();const value=$('annotationInput').value.trim();if(value){textCallback?.(value);textCallback=null;$('textDialog').close();}};
  $('textDialog').addEventListener('close',()=>{if(textCallback){textCallback('');textCallback=null;}});
  $('moreButton').onclick=()=>{$('moreMenu').hidden=!$('moreMenu').hidden;$('moreButton').setAttribute('aria-expanded',String(!$('moreMenu').hidden));};
  document.addEventListener('click',e=>{if(!e.target.closest('#moreMenu,#moreButton')){$('moreMenu').hidden=true;$('moreButton').setAttribute('aria-expanded','false');}});
  function confirmAction(title,message,callback){$('confirmTitle').textContent=title;$('confirmMessage').textContent=message;confirmation=callback;showDialog('confirmDialog');}
  $('confirmAction').onclick=()=>{$('confirmDialog').close();confirmation?.();confirmation=null;};
  $('clearDrawing').onclick=()=>confirmAction('清空我的笔迹？','题目和辅助线会保留；清空后也可以撤销。',()=>drawing.clear());

  function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  $('saveSession').onclick=()=>{stash();download(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),'几何学习记录.json');toast('已导出可继续编辑的学习记录。');};
  $('loadSession').onclick=()=>$('sessionInput').click();
  $('sessionInput').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;try{if(f.size>12000000)throw Error('学习记录文件过大。');const imported=validateSession(JSON.parse(await f.text()));confirmAction('打开这份学习记录？','当前草稿将被替换。需要保留时，请先取消并保存当前记录。',()=>{cancelGeneration(false);state=imported;registerGenerated();loadCurrent();persist();toast('学习记录已恢复。');});}catch(error){toast(error instanceof SyntaxError?'文件无法读取，请选择有效的学习记录 JSON。':error.message);}};
  $('exportButton').onclick=async()=>{
    try{const source=$('drawingBoard').cloneNode(true);source.querySelectorAll('[data-geometry-ui]').forEach(n=>n.remove());source.setAttribute('xmlns',NS);source.setAttribute('width','2000');source.setAttribute('height','1400');source.removeAttribute('style');
      const data=new XMLSerializer().serializeToString(source);const url=URL.createObjectURL(new Blob([data],{type:'image/svg+xml;charset=utf-8'}));const image=new Image();
      image.onload=()=>{const canvas=document.createElement('canvas');canvas.width=2000;canvas.height=1400;const ctx=canvas.getContext('2d');ctx.fillStyle='#f9fbf5';ctx.fillRect(0,0,2000,1400);ctx.drawImage(image,0,0);URL.revokeObjectURL(url);canvas.toBlob(blob=>{if(blob){download(blob,'几何画板.png');toast('已导出当前画面。');}else toast('图片导出失败，请重试。');},'image/png');};image.onerror=()=>{URL.revokeObjectURL(url);toast('图片导出失败，请重试。');};image.src=url;
    }catch{toast('图片导出失败，请先保存学习记录。');}
  };

  function openPhoto(){ $('photoControls').hidden=!current.photo;$('photoScale').value=current.photo?current.photo.scale*100:100;showDialog('photoDialog'); }
  $('photoButton').onclick=openPhoto;$('uploadPhoto').onclick=()=>{pendingPhoto=null;$('photoInput').click();};
  $('photoInput').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)){toast('请选择 PNG、JPEG 或 WebP 图片。');return;}if(file.size>15000000){toast('图片较大，请选择 15 MB 以内的题图。');return;}
    try{const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=data;});
      const ratio=Math.min(1,1400/Math.max(img.width,img.height));const canvas=document.createElement('canvas');canvas.width=Math.round(img.width*ratio);canvas.height=Math.round(img.height*ratio);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);const fit=Math.min(680/img.width,450/img.height);
      if(pendingPhoto){switchLesson('custom',pendingPhoto.text||'请根据上传的题图进行思考和演算。');pendingPhoto=null;if($('questionDialog').open)$('questionDialog').close();}else if(lesson())switchLesson('custom','请根据上传的题图进行思考和演算。');
      current.photo={src:canvas.toDataURL('image/png'),x:500-img.width*fit/2,y:350-img.height*fit/2,width:img.width*fit,height:img.height*fit,scale:1};render();persist();if($('photoDialog').open){$('photoControls').hidden=false;$('photoScale').value=100;}toast('题图已放入画板，可以在上面写画。');
    }catch{toast('图片无法读取，请换一张试试。');}
  };
  $('photoScale').oninput=()=>{if(current.photo){const p=current.photo,next=Number($('photoScale').value)/100;p.x+=(p.width*p.scale-p.width*next)/2;p.y+=(p.height*p.scale-p.height*next)/2;p.scale=next;renderPhoto();scheduleSave();}};
  document.querySelectorAll('[data-move]').forEach(b=>b.onclick=()=>{if(!current.photo)return;const p=current.photo;({left:()=>p.x-=20,right:()=>p.x+=20,up:()=>p.y-=20,down:()=>p.y+=20}[b.dataset.move])();renderPhoto();scheduleSave();});
  $('removePhoto').onclick=()=>{current.photo=null;renderPhoto();$('photoControls').hidden=true;persist();};
  $('aboutButton').onclick=()=>showDialog('aboutDialog');
  document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
  document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
  document.addEventListener('keydown',e=>{if(e.target.closest('input,textarea,select')||document.querySelector('dialog[open]'))return;
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?drawing.redo():drawing.undo();return;}
    if(e.metaKey||e.ctrlKey||e.altKey)return;
    const tool={p:'pen',l:'line',c:'circle',e:'eraser',v:'select',h:'pan',t:'text'}[e.key.toLowerCase()];if(tool){e.preventDefault();drawing.setTool(tool);}if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();drawing.deleteSelected();}if(e.key==='Escape')drawing.setTool('select');
  });
  window.addEventListener('beforeunload',persist);
  loadCurrent();
  updateConnection();
  if(bridge&&state.pendingRequest&&state.lessonId==='custom'){
    const saved=clone(state.pendingRequest),epoch=generationEpoch;activeJob=saved.id;
    generationMessage('正在恢复这道题的生成状态…',true);render();
    api('/api/jobs/'+encodeURIComponent(saved.id)).then(r=>handleJob(r,saved,epoch)).catch(()=>{if(epoch!==generationEpoch)return;activeJob=null;generationMessage('上次的服务已结束。题目已保留，可以重新生成或交给 Agent。');render();});
  }
})();
