/* Declarative lessons only. Offline imports enforce the same numerical contract. */
(function () {
  'use strict';
  const colors={ink:'#294f43',amber:'#b4762c',blue:'#4286a0',red:'#af5a65'};
  const known=['angle','area','isosceles','congruence','pythagoras','factorization','parallel','similarity','circle','quadrilateral','coordinate'];
  const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tolerance=1e-3, zeroTolerance=1e-9;
  const markup=/<!--|<!DOCTYPE\b|<\?|<\/?[A-Za-z][A-Za-z0-9:_-]*(?:\s[^<>]*|\/?)>/i;
  const script=/\b(?:javascript|vbscript)\s*:|\b(?:eval|Function)\s*\(|\b(?:document|window|globalThis)\s*[.\[]|=>/i;
  const fail=(path='$',why='格式错误')=>{throw Error(`题目文件未通过校验（${path}：${why}），请让 Agent 重新校验。`);};
  function object(x,required,optional=[],path='$'){
    if(!x||typeof x!=='object'||Array.isArray(x))fail(path,'需要对象');
    const allowed=new Set([...required,...optional]);
    if(required.some(k=>!Object.hasOwn(x,k))||Object.keys(x).some(k=>!allowed.has(k)))fail(path,'缺少必需字段或含协议外字段');
    return x;
  }
  function text(x,max=6000,nonempty=false,path='$'){
    if(typeof x!=='string'||[...x].length>max||(nonempty&&!x.trim()))fail(path,'纯文本为空或过长');
    if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(x)||markup.test(x)||script.test(x))fail(path,'不允许HTML、脚本表达式或脚本URL');
    return x;
  }
  function num(x,min=-Infinity,max=Infinity,path='$'){
    if(typeof x!=='number'||!Number.isFinite(x)||x<min||x>max)fail(path,'需要范围内的有限数值');
    return x;
  }
  function array(x,max,min=0,path='$'){
    if(!Array.isArray(x)||x.length>max||x.length<min)fail(path,`数组数量须为${min}–${max}`);
    return x;
  }
  function id(x,path='$'){
    if(typeof x!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(x))fail(path,'标识符格式错误');
    return x;
  }
  function texts(x,path,min=0){array(x,32,min,path).forEach((v,i)=>text(v,6000,true,`${path}[${i}]`));}
  function keys(x,path,min=0){
    array(x,known.length,min,path);
    if(x.some(k=>typeof k!=='string'||!known.includes(k))||new Set(x).size!==x.length)fail(path,'知识键未知或重复');
    return x;
  }
  function profile(p,path='$.profile'){
    object(p,['grade','edition','chapter','knowledge','confirmed'],[],path);
    if(!['7','8','9'].includes(p.grade)||p.confirmed!==true)fail(path,'须确认初中学习范围');
    text(p.edition,80,false,path+'.edition');text(p.chapter,150,false,path+'.chapter');keys(p.knowledge,path+'.knowledge');return p;
  }
  function sameProfile(a,b){return !!a&&!!b&&a.grade===b.grade&&a.edition===b.edition&&a.chapter===b.chapter&&a.confirmed===b.confirmed&&JSON.stringify(a.knowledge)===JSON.stringify(b.knowledge);}
  function coordinate(p,path){array(p,2,2,path);num(p[0],0,1000,path+'[0]');num(p[1],0,700,path+'[1]');}
  function depth(raw){
    const pending=[[raw,0]];
    while(pending.length){const [x,n]=pending.pop();if(n>48)fail('$','嵌套超过48层');if(x&&typeof x==='object')Object.values(x).forEach(v=>pending.push([v,n+1]));}
  }
  const primitiveFields={line:[['a','b'],[]],polygon:[['points'],[]],circle:[['center','radius'],[]],point:[['point'],['label','dx','dy']],label:[['at','text'],[]],rightAngle:[['vertex','a','b'],['size']],angleArc:[['vertex','a','b'],['size']]};
  function check(raw,expected){
    depth(raw);
    object(raw,['schema','request_id','id','title','statement','givens','goal','status','message','questions','profile','scene','methods','audit']);
    if(raw.schema!=='geometry-lesson/1')fail('$.schema','不支持的协议版本');
    id(raw.id,'$.id');id(raw.request_id,'$.request_id');profile(raw.profile);
    if(expected){profile(expected.profile,'$.expected.profile');id(expected.id,'$.expected.id');if(expected.id!==raw.request_id||!sameProfile(raw.profile,expected.profile))throw Error('结果与当前题目或学习范围不一致，请重新生成。');}
    text(raw.title,160,true,'$.title');text(raw.statement,6000,true,'$.statement');text(raw.goal,6000,false,'$.goal');texts(raw.givens,'$.givens');
    if(!['ready','needs_clarification','out_of_scope'].includes(raw.status))fail('$.status','未知状态');
    const ready=raw.status==='ready';
    text(raw.message,2000,!ready,'$.message');texts(raw.questions,'$.questions',raw.status==='needs_clarification'?1:0);
    object(raw.scene,['points','base','constraints'],[],'$.scene');
    if(!raw.scene.points||typeof raw.scene.points!=='object'||Array.isArray(raw.scene.points))fail('$.scene.points','需要点坐标对象');
    const pts=raw.scene.points,names=Object.keys(pts);if(names.length>300)fail('$.scene.points','点数量超过300');
    names.forEach(k=>{if(!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(k))fail('$.scene.points','点键格式错误');coordinate(pts[k],'$.scene.points.'+k);});
    const ids=new Set();
    const point=(name,path)=>{if(typeof name!=='string'||!Object.hasOwn(pts,name))fail(path,'点引用不存在');return name;};
    const vector=(a,b,path)=>{const v=[pts[b][0]-pts[a][0],pts[b][1]-pts[a][1]];if(Math.hypot(...v)<=zeroTolerance)fail(path,'不允许零长线段');return v;};
    const perpendicular=(a,b)=>Math.abs(a[0]*b[0]+a[1]*b[1])<=tolerance*Math.hypot(...a)*Math.hypot(...b);
    const parallel=(a,b)=>Math.abs(a[0]*b[1]-a[1]*b[0])<=tolerance*Math.hypot(...a)*Math.hypot(...b);
    const close=(a,b)=>Math.abs(a-b)<=tolerance*Math.max(Math.abs(a),Math.abs(b));
    function primitive(p,path){
      if(!p||typeof p!=='object'||typeof p.kind!=='string'||!Object.hasOwn(primitiveFields,p.kind))fail(path+'.kind','未知图元');
      const [required,optional]=primitiveFields[p.kind];
      object(p,['id','kind',...required],['color','width','dashed','fill','opacity',...optional],path);
      id(p.id,path+'.id');if(ids.has(p.id))fail(path+'.id','图元id须在全课程内唯一');ids.add(p.id);
      if(Object.hasOwn(p,'color')&&!Object.hasOwn(colors,p.color))fail(path+'.color','未知颜色');
      if(Object.hasOwn(p,'width'))num(p.width,1,8,path+'.width');if(Object.hasOwn(p,'opacity'))num(p.opacity,.03,1,path+'.opacity');
      ['fill','dashed'].forEach(k=>{if(Object.hasOwn(p,k)&&typeof p[k]!=='boolean')fail(path+'.'+k,'需要布尔值');});
      let references=[];
      switch(p.kind){
        case 'line':references=[point(p.a,path+'.a'),point(p.b,path+'.b')];vector(p.a,p.b,path);break;
        case 'polygon':{
          array(p.points,300,3,path+'.points');references=p.points.map((name,i)=>point(name,`${path}.points[${i}]`));
          if(new Set(references).size!==references.length)fail(path+'.points','多边形顶点不能重复');
          let twiceArea=0,maxEdgeSquared=0;
          references.forEach((name,i)=>{const next=references[(i+1)%references.length],v=vector(name,next,path),a=pts[name],b=pts[next];maxEdgeSquared=Math.max(maxEdgeSquared,v[0]**2+v[1]**2);twiceArea+=a[0]*b[1]-b[0]*a[1];});
          if(Math.abs(twiceArea)<=zeroTolerance*maxEdgeSquared)fail(path,'不允许退化多边形');break;
        }
        case 'circle':references=[point(p.center,path+'.center')];num(p.radius,0,1000,path+'.radius');if(p.radius<=0)fail(path+'.radius','半径须大于0');break;
        case 'point':references=[point(p.point,path+'.point')];if(Object.hasOwn(p,'label'))text(p.label,160,false,path+'.label');if(Object.hasOwn(p,'dx'))num(p.dx,-1000,1000,path+'.dx');if(Object.hasOwn(p,'dy'))num(p.dy,-700,700,path+'.dy');break;
        case 'label':coordinate(p.at,path+'.at');text(p.text,160,true,path+'.text');break;
        case 'angleArc':
        case 'rightAngle':{
          references=[point(p.vertex,path+'.vertex'),point(p.a,path+'.a'),point(p.b,path+'.b')];
          const first=vector(p.vertex,p.a,path),second=vector(p.vertex,p.b,path);
          if(p.kind==='rightAngle'&&!perpendicular(first,second))fail(path,'直角标记与真实几何不符');
          if(Object.hasOwn(p,'size'))num(p.size,4,80,path+'.size');break;
        }
      }
      return references;
    }
    function shape(p){
      if(p.kind==='line')return JSON.stringify([p.kind,...[p.a,p.b].sort()]);
      if(p.kind==='circle')return JSON.stringify([p.kind,p.center,p.radius]);
      if(p.kind==='rightAngle'||p.kind==='angleArc')return JSON.stringify([p.kind,p.vertex,...[p.a,p.b].sort()]);
      return null;
    }
    function stage(items,path,visible,drawn,observe=false,maximum=100){
      array(items,maximum,0,path);const available=new Set(visible),newShapes=new Set(drawn);
      if(!observe)items.forEach((p,i)=>{if(p?.kind==='point'){const name=point(p.point,`${path}[${i}].point`);if(available.has(name))fail(`${path}[${i}].point`,'辅助点已可见，不能重复声明');available.add(name);}});
      items.forEach((p,i)=>{
        const itemPath=`${path}[${i}]`,references=primitive(p,itemPath);
        if(observe&&['point','label'].includes(p.kind))fail(itemPath+'.kind','observe不允许新点或标签');
        if(references.some(name=>!available.has(name)))fail(itemPath,'引用了尚未显示的点');
        const signature=shape(p);
        if(observe&&signature&&!drawn.has(signature))fail(itemPath,'observe只能高亮此前已经画出的线、圆或直角');
        if(signature)newShapes.add(signature);
      });
      return {visible:available,drawn:newShapes};
    }
    const base=stage(raw.scene.base,'$.scene.base',new Set(),new Set(),false,500);
    array(raw.scene.constraints,200,0,'$.scene.constraints').forEach((constraint,index)=>{
      const path=`$.scene.constraints[${index}]`;object(constraint,['kind','points'],['value'],path);
      const kind=constraint.kind;if(!['perpendicular','parallel','equal_length','collinear','midpoint','ratio'].includes(kind))fail(path+'.kind','未知约束');
      const count=['collinear','midpoint'].includes(kind)?3:4;
      const names=array(constraint.points,count,count,path+'.points');names.forEach((name,i)=>point(name,`${path}.points[${i}]`));
      if(kind!=='ratio'&&Object.hasOwn(constraint,'value'))fail(path+'.value','仅ratio可以指定value');
      let valid=false;
      if(kind==='collinear'){
        const first=vector(names[0],names[1],path),second=vector(names[0],names[2],path);vector(names[1],names[2],path);valid=parallel(first,second);
      }else if(kind==='midpoint'){
        const [a,m,b]=names.map(name=>pts[name]),v=vector(names[0],names[2],path);vector(names[0],names[1],path);vector(names[1],names[2],path);
        valid=Math.hypot(m[0]-(a[0]+b[0])/2,m[1]-(a[1]+b[1])/2)<=tolerance*Math.hypot(...v);
      }else{
        const first=vector(names[0],names[1],path),second=vector(names[2],names[3],path);
        if(kind==='perpendicular')valid=perpendicular(first,second);
        else if(kind==='parallel')valid=parallel(first,second);
        else if(kind==='equal_length')valid=close(Math.hypot(...first),Math.hypot(...second));
        else{num(constraint.value,0,Infinity,path+'.value');if(constraint.value<=0)fail(path+'.value','长度比须大于0');valid=close(Math.hypot(...first)/Math.hypot(...second),constraint.value);}
      }
      if(!valid)fail(path,'声明的几何约束不成立');
    });
    const methodIds=new Set();
    array(raw.methods,ready?4:0,ready?1:0,'$.methods').forEach((method,methodIndex)=>{
      const path=`$.methods[${methodIndex}]`;object(method,['id','title','requires','steps'],[],path);
      id(method.id,path+'.id');if(methodIds.has(method.id))fail(path+'.id','解法id不能重复');methodIds.add(method.id);
      text(method.title,160,true,path+'.title');keys(method.requires,path+'.requires',1);
      if(method.requires.some(k=>!raw.profile.knowledge.includes(k)))fail(path+'.requires','解法超出确认知识范围');
      let visible=new Set(base.visible),drawn=new Set(base.drawn);
      array(method.steps,12,2,path+'.steps').forEach((step,stepIndex)=>{
        const stepPath=`${path}.steps[${stepIndex}]`;object(step,['title','prompt','hint','explanation','uses','reason','observe','reveal'],[],stepPath);
        text(step.title,160,true,stepPath+'.title');['prompt','hint','explanation','reason'].forEach(k=>text(step[k],6000,true,stepPath+'.'+k));
        keys(step.uses,stepPath+'.uses',1);if(step.uses.some(k=>!method.requires.includes(k)))fail(stepPath+'.uses','步骤知识不属于本解法requires');
        stage(step.observe,stepPath+'.observe',visible,drawn,true);
        const revealed=stage(step.reveal,stepPath+'.reveal',visible,drawn);visible=revealed.visible;drawn=revealed.drawn;
      });
    });
    object(raw.audit,['summary','checks','uncertainties'],[],'$.audit');text(raw.audit.summary,6000,true,'$.audit.summary');texts(raw.audit.checks,'$.audit.checks');texts(raw.audit.uncertainties,'$.audit.uncertainties');
    return JSON.parse(JSON.stringify(raw));
  }
  function draw(raw,p,observe=false){
    const pts=raw.scene.points,color=colors[p.color||'ink'],width=p.width||2.5;
    const attrs=`data-primitive="${esc(p.id)}" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${p.dashed?' stroke-dasharray="9 7"':''} opacity="${p.opacity??1}"`;
    const xy=(n,axis)=>pts[n][axis];let mark='';
    switch(p.kind){
      case 'line':mark=`<line ${attrs} x1="${xy(p.a,0)}" y1="${xy(p.a,1)}" x2="${xy(p.b,0)}" y2="${xy(p.b,1)}"/>`;break;
      case 'polygon':mark=`<polygon ${attrs} points="${p.points.map(n=>pts[n].join(',')).join(' ')}" fill="${observe||p.fill?color:'none'}" ${observe?'style="stroke:none;fill-opacity:.12"':p.fill?'fill-opacity=".12"':''}/>`;break;
      case 'circle':mark=`<circle ${attrs} cx="${xy(p.center,0)}" cy="${xy(p.center,1)}" r="${p.radius}" fill="${p.fill?color:'none'}" ${p.fill?'fill-opacity=".12"':''}/>`;break;
      case 'point':mark=`<circle ${attrs} cx="${xy(p.point,0)}" cy="${xy(p.point,1)}" r="3" fill="${color}"/><text x="${xy(p.point,0)+(p.dx??10)}" y="${xy(p.point,1)+(p.dy??-12)}" font-size="23" fill="${color}">${esc(p.label??p.point)}</text>`;break;
      case 'label':mark=`<text data-primitive="${esc(p.id)}" x="${p.at[0]}" y="${p.at[1]}" font-size="21" fill="${color}" opacity="${p.opacity??1}">${esc(p.text)}</text>`;break;
      case 'angleArc':{const v=pts[p.vertex],a=pts[p.a],b=pts[p.b],r=p.size||30;let start=Math.atan2(a[1]-v[1],a[0]-v[0]),delta=Math.atan2(b[1]-v[1],b[0]-v[0])-start;while(delta>Math.PI)delta-=2*Math.PI;while(delta< -Math.PI)delta+=2*Math.PI;const end=start+delta;mark=`<path ${attrs} data-angle-arc fill="none" d="M${v[0]+r*Math.cos(start)} ${v[1]+r*Math.sin(start)} A${r} ${r} 0 0 ${delta>=0?1:0} ${v[0]+r*Math.cos(end)} ${v[1]+r*Math.sin(end)}"/>`;break;}
      case 'rightAngle':{const v=pts[p.vertex],a=pts[p.a],b=pts[p.b],size=p.size||17;const al=Math.hypot(a[0]-v[0],a[1]-v[1]),bl=Math.hypot(b[0]-v[0],b[1]-v[1]);if(!al||!bl)return '';const u=[(a[0]-v[0])*size/al,(a[1]-v[1])*size/al],w=[(b[0]-v[0])*size/bl,(b[1]-v[1])*size/bl];mark=`<path ${attrs} fill="none" d="M${v[0]+u[0]} ${v[1]+u[1]} L${v[0]+u[0]+w[0]} ${v[1]+u[1]+w[1]} L${v[0]+w[0]} ${v[1]+w[1]}"/>`;break;}
    }
    return mark;
  }
  function adapt(raw,expected){
    raw=check(raw,expected);
    return {id:'generated-'+raw.id, title:raw.title,shortTitle:raw.title,statementHTML:esc(raw.statement).replace(/\n/g,'<br>'),goalHTML:esc(raw.goal),generated:true,raw,
      methods:raw.methods.map(m=>({...m,steps:m.steps.map(s=>({...s,explanation:esc(s.explanation).replace(/\n/g,'<br>')}))})),
      render(methodId,step,explained){let svg=raw.scene.base.map(p=>draw(raw,p)).join('');const m=raw.methods.find(x=>x.id===methodId);if(!m||!Number.isInteger(step)||step<0||step>=m.steps.length)return svg;for(let i=0;i<step;i++)svg+=m.steps[i].reveal.map(p=>draw(raw,p)).join('');const s=m.steps[step];svg+='<g data-observation>'+s.observe.map(p=>draw(raw,p,true)).join('')+'</g>';if(explained===true)svg+='<g data-aux>'+s.reveal.map(p=>draw(raw,p)).join('')+'</g>';return svg;}
    };
  }
  window.GeometryLessonCodec={check,adapt,sameProfile,profile};
})();
