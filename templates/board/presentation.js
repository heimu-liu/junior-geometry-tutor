/* Physical context stays separate from the checked mathematical scene. */
(function(){
 'use strict';
 const NS='http://www.w3.org/2000/svg',roles=['top','left','right','bottom','crossing'];
 function check(c,l){
  if(!c)return null;
  if(!l||c.schema!=='geometry-context/1'||c.kind!=='doorframe-plumb'||c.request_id!==l.request_id||Object.keys(c).sort().join()!==['schema','request_id','kind','anchors'].sort().join())throw Error('场景与当前题目不一致。');
  if(!c.anchors||Object.keys(c.anchors).sort().join()!==[...roles].sort().join()||new Set(Object.values(c.anchors)).size!==5)throw Error('场景点不完整。');
  const visible=l.scene.base.filter(p=>p.kind==='point').map(p=>p.point);
  if(roles.some(k=>!visible.includes(c.anchors[k])))throw Error('场景引用尚未显示的点。');
  const [a,b,d,v,e]=roles.map(k=>l.scene.points[c.anchors[k]]);
  if(!(Math.abs(a[0]-v[0])<1e-6&&Math.abs(a[0]-e[0])<1e-6&&Math.abs(b[1]-d[1])<1e-6&&Math.abs(b[1]-e[1])<1e-6&&a[1]<e[1]&&e[1]<v[1]&&b[0]<e[0]&&e[0]<d[0]))throw Error('场景与几何点位置不一致。');
  if(l.methods.some(m=>!m.steps.at(-1).reveal.some(p=>p.kind==='rightAngle'&&p.vertex===c.anchors.crossing&&[p.a,p.b].includes(c.anchors.top)&&[c.anchors.left,c.anchors.right].some(n=>[p.a,p.b].includes(n)))))throw Error('门框场景缺少已完成的垂直目标。');
  return JSON.parse(JSON.stringify(c));
 }
 function draw(layer,c,l,complete){
  layer.replaceChildren();if(!c)return;
  const q=c.anchors,p=l.scene.points,a=p[q.top],b=p[q.left],d=p[q.right],v=p[q.bottom];
  const left=b[0]-52,right=d[0]+52,bottom=Math.min(677,v[1]+108),weightY=Math.min(640,v[1]+64);
  const add=(tag,attrs,text)=>{const el=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);if(text)el.textContent=text;layer.append(el);return el;};
  const frame=complete?'#357b5e':'#8c9588';
  add('path',{'data-context':'doorframe',d:`M${left} ${bottom} V${b[1]} H${right} V${bottom}`,stroke:frame,'stroke-width':12,'stroke-linejoin':'round',fill:'none'});
  add('line',{'data-context':'string',x1:a[0],y1:a[1],x2:a[0],y2:weightY-12,stroke:complete?'#b4762c':'#6f7e78','stroke-width':4});
  add('path',{'data-context':'plumb',d:`M${a[0]-13} ${weightY-12} H${a[0]+13} L${a[0]+18} ${weightY+7} L${a[0]} ${weightY+29} L${a[0]-18} ${weightY+7} Z`,fill:'#63756f',stroke:'#465c53','stroke-width':2});
  add('text',{x:left-4,y:b[1]-24,fill:'#626f60','font-size':21},'门框');
  add('text',{x:a[0]+27,y:v[1]+32,fill:'#626f60','font-size':20},'线绳');
  add('text',{x:a[0]+32,y:weightY+14,fill:'#626f60','font-size':20},'铅锤');
  if(complete)add('text',{'data-context':'conclusion',x:right+18,y:b[1]+7,fill:'#357b5e','font-size':22},'水平');
 }
 function conclusion(c){const a=c.anchors;return `线绳经过 ${a.top}、${a.bottom}，铅锤让它保持竖直。刚才证明了门框 ${a.left}${a.right} 与这条线绳垂直，所以门框是水平的。`;}
 window.GeometryPresentation={check,draw,conclusion};
})();
