"""Compile a narrow typed geometry plan into a checked, render-only lesson."""
import argparse
import hashlib
import json
import math
import re
from pathlib import Path
from exact_geometry import construct, NAME
from theorem_engine import fact, validate_fact, prove, Known, key, describe, RULES
from geometry_contract import validate_request, validate_lesson, load_json

FIELDS={'schema','request_id','id','title','status','message','questions','profile','construction','segments','givens','goals','methods'}

def norm(s):return re.sub(r'[\s，,。；;：:△三角形]','',s).replace('＝','=').replace('≅','≌')
def plain(s,n=6000):
    if not isinstance(s,str) or len(s)>n or re.search(r'[<>\x00-\x08]',s):raise ValueError('文本格式不正确')
    return s

def source_matches(f,source,question):
    """Conservative binding for explicit notation; not an unrestricted language parser."""
    s=norm(source);q=norm(re.split(r'求证|证明|求',question)[0]);p=f['points'];k=f['kind']
    if not s or s not in q: return False
    pairs=lambda a:[a,a[::-1]]
    if k=='length_eq':return any(a+'='+b in s or b+'='+a in s for a in pairs(''.join(p[:2])) for b in pairs(''.join(p[2:])))
    if k=='midpoint':return any(p[0]+'是'+a+'的中点' in s or p[0]+'为'+a+'的中点' in s for a in pairs(''.join(p[1:])))
    if k=='between':return any(p[1]+'在线段'+a+'上' in s or p[1]+'在线段'+a+'内部' in s for a in pairs(p[0]+p[2]))
    if k=='angle_value':
        from exact_geometry import number
        for m in re.finditer(r'∠([A-Za-z]+)=([0-9./]+)°?',s):
            label,v=m.groups()
            if label in (''.join(p),''.join(reversed(p)),p[1]) and number(v)==number(f['value']):return True
        return False
    if k=='angle_eq':return '∠'+''.join(p[:3])+'=∠'+''.join(p[3:]) in s or '∠'+''.join(p[3:])+'=∠'+''.join(p[:3]) in s
    if k=='perpendicular':return any(a+'⊥'+b in s or b+'⊥'+a in s for a in pairs(''.join(p[:2])) for b in pairs(''.join(p[2:])))
    if k=='bisector':return p[1]+p[2]+'平分∠'+p[0]+p[1]+p[3] in s
    if k=='equilateral':return ''.join(p) in s and '等边' in s and not any(x in s for x in ('不是','并非','不一定'))
    return False

def goal_matches(goals,question):
    # Require the complete explicit goal (including all requested angles), never a model-chosen easier target.
    tail=re.split(r'求证|证明|求',norm(question))[-1].rstrip('？?')
    if not tail or tail==norm(question):return False
    values=[f for f in goals if f['kind']=='angle_value']
    if values and len(values)==len(goals):
        labels=re.findall(r'∠([A-Za-z]+)',tail)
        return bool(labels) and len(labels)==len(values) and all(any(label in (''.join(f['points']),''.join(reversed(f['points'])),f['points'][1]) for f in values) for label in labels)
    remaining=tail
    for f in goals:
        text=norm(describe(f));alternatives=[text]
        if f['kind'] in ('length_eq','angle_eq','perpendicular','congruent'):
            operator={'length_eq':'=','angle_eq':'=','perpendicular':'⊥','congruent':'≌'}[f['kind']]
            a,b=text.split(operator);alternatives.append(b+operator+a)
        match=next((x for x in alternatives if x in remaining),None)
        if match is None:return False
        remaining=remaining.replace(match,'',1)
    return not re.search(r'[A-Z∠=⊥≌]',remaining)

def check_numeric(f,pts):
    p=f['points'];k=f['kind']
    if any(x not in pts for x in p):raise ValueError('事实引用未构造的点')
    def vector(a,b):return [pts[b][i]-pts[a][i] for i in (0,1)]
    def length(a,b):return math.dist(pts[a],pts[b])
    def angle(a,v,b):
        u,w=vector(v,a),vector(v,b);d=math.hypot(*u)*math.hypot(*w)
        if d<1e-12:raise ValueError('角的射线退化')
        value=math.degrees(math.acos(max(-1,min(1,sum(u[i]*w[i] for i in (0,1))/d))))
        if value<1e-5 or value>180-1e-5:raise ValueError('角退化为直线')
        return value
    close=lambda a,b:math.isclose(a,b,rel_tol=1e-7,abs_tol=1e-7)
    if k=='length_eq':ok=length(*p[:2])>1e-9 and close(length(*p[:2]),length(*p[2:]))
    elif k=='angle_eq':ok=close(angle(*p[:3]),angle(*p[3:]))
    elif k=='angle_value':
        from exact_geometry import number
        ok=close(angle(*p),float(number(f['value'])))
    elif k in ('midpoint','between'):
        m,a,b=p if k=='midpoint' else [p[1],p[0],p[2]]
        ok=length(a,m)>1e-9 and length(m,b)>1e-9 and close(length(a,m)+length(m,b),length(a,b))
        if k=='midpoint':ok=ok and close(length(a,m),length(m,b))
    elif k=='perpendicular':
        u,v=vector(*p[:2]),vector(*p[2:]);d=math.hypot(*u)*math.hypot(*v);ok=d>1e-12 and abs(sum(u[i]*v[i] for i in (0,1)))/d<1e-7
    elif k=='bisector':ok=close(angle(*p[:3]),angle(p[2],p[1],p[3]))
    elif k=='equilateral':ok=close(length(p[0],p[1]),length(p[1],p[2])) and close(length(p[0],p[2]),length(p[1],p[2]));angle(*p)
    elif k=='congruent':
        angle(*p[:3]);angle(*p[3:]);ok=all(close(length(p[i],p[j]),length(p[i+3],p[j+3])) for i,j in ((0,1),(1,2),(0,2)))
    else:raise ValueError('未知事实')
    if not ok:raise ValueError('本地构图与条件矛盾：'+describe(f))

def compile_plan(plan,request):
    r=validate_request(request)
    if not isinstance(plan,dict) or set(plan)!=FIELDS or plan['schema']!='geometry-plan/1':raise ValueError('计划必须使用完整 geometry-plan/1 字段')
    if plan['request_id']!=r['id'] or plan['profile']!=r['profile']:raise ValueError('计划与当前题目或学习范围不一致')
    if not isinstance(plan['id'],str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,128}',plan['id']):raise ValueError('计划 ID 不正确')
    for name in ('title','message'):plain(plan[name])
    if not isinstance(plan['questions'],list) or len(plan['questions'])>20:raise ValueError('澄清问题格式不正确')
    for q in plan['questions']:plain(q)
    if plan['status'] not in ('ready','needs_clarification','out_of_scope'):raise ValueError('状态不正确')
    lesson={'schema':'geometry-lesson/1','request_id':r['id'],'id':plan['id'],'title':plan['title'],'statement':r['question'],'givens':[], 'goal':'',
            'status':plan['status'],'message':plan['message'],'questions':plan['questions'],'profile':r['profile'],
            'scene':{'points':{},'base':[],'constraints':[]},'methods':[],
            'audit':{'summary':'未形成可校验的解法。','checks':[],'uncertainties':[]}}
    report={'engine':'local-geometry-proof/1','goal_reached':False,'rules':[],'methods':[],
            'boundary':'只校验支持的构造与定理；题意抽取仍需核对，不是通用自然语言证明器。'}
    if plan['status']!='ready':
        if any(plan[n] for n in ('construction','segments','givens','goals','methods')):raise ValueError('未就绪计划不得夹带未校验解答')
        return validate_lesson(lesson,r),report
    for name,low,high in [('givens',1,30),('goals',1,8),('methods',1,3),('segments',3,60)]:
        if not isinstance(plan[name],list) or not low<=len(plan[name])<=high:raise ValueError(name+' 数量不正确')
    scene=construct(plan['construction']);points=scene['points'];stages=scene['stages']
    named=set(re.findall(r'[A-Z]',r['question']))
    if any(not re.fullmatch(r'[A-Z]',n) for n in points):raise ValueError('本轮点名只支持单个大写字母')
    if any(stages[n]=='base' and n not in named for n in points):raise ValueError('题目未命名的辅助点不能提前放进初始图')
    lesson['scene']['points']=scene['display'];known={};all_ids=set();construction_ids=set()
    def slug(identifier):
        if not isinstance(identifier,str) or not NAME.fullmatch(identifier):raise ValueError('标识符须以字母开头，只用字母、数字和下划线')
    for op in plan['construction']:
        slug(op['id'])
        if op['id'] in construction_ids:raise ValueError('重复构造 ID')
        construction_ids.add(op['id'])
    for given in plan['givens']:
        if not isinstance(given,dict) or set(given)!={'id','kind','points','value','source'}:raise ValueError('已知条件字段不正确')
        slug(given['id']);f={k:given[k] for k in ('kind','points','value')};validate_fact(f)
        if given['id'] in known or f['kind']=='congruent':raise ValueError('重复条件或不支持的全等断言')
        plain(given['source'])
        if not source_matches(f,given['source'],r['question']):raise ValueError('已知条件未能与题面原文绑定：'+describe(f))
        if any(stages.get(x)!='base' for x in f['points']):raise ValueError('题目已知点必须在初始图中')
        check_numeric(f,points);known[given['id']]=[f]
    prefix=norm(re.split(r'求证|证明|求',r['question'])[0])
    explicit=[]
    for a,b in re.findall(r'([A-Z]{2})=([A-Z]{2})',prefix):explicit.append(fact('length_eq',list(a+b)))
    for a,b in re.findall(r'([A-Z]{2})⊥([A-Z]{2})',prefix):explicit.append(fact('perpendicular',list(a+b)))
    for m,ab in re.findall(r'([A-Z])(?:是|为)([A-Z]{2})的中点',prefix):explicit.append(fact('midpoint',list(m+ab)))
    given_keys={key(f) for fs in known.values() for f in fs}
    if any(key(f) not in given_keys for f in explicit):raise ValueError('遗漏了题面明确给出的线段或中点条件')
    for label,value in re.findall(r'∠([A-Z]+)=([0-9./]+)',prefix):
        matches=[f for fs in known.values() for f in fs if f['kind']=='angle_value' and label in (''.join(f['points']),''.join(reversed(f['points'])),f['points'][1])]
        from exact_geometry import number
        if not any(number(f['value'])==number(value) for f in matches):raise ValueError('遗漏了题面明确给出的角度')
    for g in plan['goals']:validate_fact(g)
    if not goal_matches(plan['goals'],r['question']):raise ValueError('目标不能完整对应题目所求；请使用明确的点名和求证/求角表述')
    # Do not accidentally expose an auxiliary definition as a given.
    segments=[]
    for s in plan['segments']:
        if not isinstance(s,dict) or set(s)!={'points','stage'} or not isinstance(s['points'],list) or len(s['points'])!=2 or len(set(s['points']))!=2:raise ValueError('线段字段不正确')
        if any(n not in points for n in s['points']) or math.dist(*(points[n] for n in s['points']))<1e-9:raise ValueError('未定义或退化线段')
        segments.append(s)
    counter=0
    def primitive(kind,**data):
        nonlocal counter
        counter+=1;return {'id':'shape'+str(counter),'kind':kind,**data}
    def stage_primitives(stage,available):
        out=[]
        for n in points:
            if stages[n]==stage:
                if n in available:raise ValueError('重复显示点')
                out.append(primitive('point',point=n,label=n));available.add(n)
        for s in segments:
            if s['stage']==stage:
                if not set(s['points'])<=available:raise ValueError('线段先于端点出现')
                out.append(primitive('line',a=s['points'][0],b=s['points'][1],color='ink' if stage=='base' else 'amber',dashed=stage!='base'))
        return out
    def angle_label(f):
        a,v,b=(scene['display'][n] for n in f['points'])
        u=[a[i]-v[i] for i in (0,1)];w=[b[i]-v[i] for i in (0,1)]
        lu,lw=math.hypot(*u),math.hypot(*w);direction=[u[i]/lu+w[i]/lw for i in (0,1)];ln=math.hypot(*direction)
        return [max(30,min(950,v[0]+direction[0]/ln*44-10)),max(30,min(650,v[1]+direction[1]/ln*44+6))]
    base_visible=set();lesson['scene']['base']=stage_primitives('base',base_visible)
    for f in (x for group in known.values() for x in group):
        if f['kind']=='angle_value':lesson['scene']['base'].append(primitive('label',at=angle_label(f),text=f['value']+'°'))
    method_ids=set();used_stages={'base'}
    for method in plan['methods']:
        if not isinstance(method,dict) or set(method)!={'id','title','steps'}:raise ValueError('解法字段不正确')
        if not isinstance(method['id'],str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,128}',method['id']) or method['id'] in method_ids:raise ValueError('解法 ID 不正确或重复')
        method_ids.add(method['id']);plain(method['title'],160)
        if not isinstance(method['steps'],list) or not 2<=len(method['steps'])<=12:raise ValueError('每种解法需要 2–12 步')
        local=dict(known);available=set(base_visible);steps=[];requires=set();details=[];visible_segments={tuple(sorted(s['points'])) for s in segments if s['stage']=='base'}
        for step in method['steps']:
            if not isinstance(step,dict) or set(step)!={'id','rule','points','premises'}:raise ValueError('步骤字段不正确')
            sid=step['id'];slug(sid)
            if sid in local or sid in all_ids:raise ValueError('步骤 ID 重复或跨解法共享')
            all_ids.add(sid);used_stages.add(sid)
            if not isinstance(step['premises'],list) or len(step['premises'])>40 or any(not isinstance(x,str) or x not in local for x in step['premises']):raise ValueError('引用了不存在、未来或其他解法的前提')
            facts=[f for pid in step['premises'] for f in local[pid]]
            rule=step['rule'];p=step['points'];reveal=[]
            if rule in ('construct_midpoint','construct_foot'):
                opkind='midpoint' if rule=='construct_midpoint' else 'foot'
                ops=[op for op in plan['construction'] if op['stage']==sid and op['op']==opkind and op['points']==p]
                if len(ops)!=1 or any(n not in available for n in p[1:]):raise ValueError('辅助构造与本地定义不一致')
                if 'angle' not in r['profile']['knowledge']:raise ValueError('缺少基本角与线段知识')
                if opkind=='midpoint':fs=[fact('midpoint',p),fact('between',[p[1],p[0],p[2]]),fact('length_eq',[p[1],p[0],p[0],p[2]])]
                else:fs=[fact('perpendicular',[p[1],p[0],p[2],p[3]])]
                result={'facts':fs,'uses':['angle'],'reason':'辅助点的构造定义','prompt':'可以补一条辅助线，把大图拆成两个小三角形吗？','hint':'试着'+('取底边的中点。' if opkind=='midpoint' else '向底边所在直线作垂线。'),'explanation':'作辅助点 '+p[0]+'，于是'+'；'.join(describe(f) for f in fs)+'。'}
            else:
                if not isinstance(p,list) or not set(p)<=available:raise ValueError('证明使用了尚未出现的点')
                result=prove(rule,p,facts,set(r['profile']['knowledge']))
            # Newly introduced points require a trusted construction step; ordinary rules cannot declare them.
            if any(stages[n]==sid for n in points) and rule not in ('construct_midpoint','construct_foot'):raise ValueError('新点必须用构造步骤引入')
            reveal.extend(stage_primitives(sid,available))
            for f in result['facts']:check_numeric(f,points)
            for s in segments:
                if s['stage']==sid:visible_segments.add(tuple(sorted(s['points'])))
            local[sid]=result['facts'];requires.update(result['uses']);report['rules'].append(rule)
            observe=[];used=set(p);focus=[]
            angle_fact=next((f for f in result['facts'] if f['kind']=='angle_eq'),None)
            length_fact=next((f for f in result['facts'] if f['kind']=='length_eq'),None)
            if angle_fact:
                for trio,color in ((angle_fact['points'][:3],'blue'),(angle_fact['points'][3:],'amber')):
                    focus.extend([(trio[0],trio[1],color),(trio[1],trio[2],color)])
            elif length_fact:
                a,b,c,d=length_fact['points'];focus=[(a,b,'blue'),(c,d,'amber')]
            else:focus=[(a,b,'amber') for a,b in sorted(visible_segments) if a in used and b in used]
            for a,b,color in focus:
                if tuple(sorted((a,b))) in visible_segments and not any(s['stage']==sid and set(s['points'])=={a,b} for s in segments):observe.append(primitive('line',a=a,b=b,color=color,width=4))
            for f in result['facts']:
                if f['kind']=='congruent':
                    for tri,color in ((f['points'][:3],'blue'),(f['points'][3:],'amber')):
                        reveal.append(primitive('polygon',points=tri,fill=True,opacity=1,color=color))
                elif f['kind']=='angle_value':reveal.append(primitive('label',at=angle_label(f),text=f['value']+'°',color='amber'))
                elif f['kind']=='perpendicular':
                    # Show a right-angle mark only at a named common intersection.
                    a,b,c,d=f['points'];vertex=next((n for n in (a,b) if n in (c,d)),None)
                    if vertex:reveal.append(primitive('rightAngle',vertex=vertex,a=b if a==vertex else a,b=d if c==vertex else c,color='amber',size=18))
                    else:
                        for n in (a,b):
                            if Known([x for fs in local.values() for x in fs]).has(fact('between',[c,n,d])):reveal.append(primitive('rightAngle',vertex=n,a=b if a==n else a,b=c,color='amber',size=18));break
            # Child-facing text is generated from verified facts, never unchecked model explanation.
            premise_text='；'.join(dict.fromkeys(describe(f) for f in facts))
            new_lines=[s['points'] for s in segments if s['stage']==sid]
            if new_lines:
                result['prompt']='试着连接 '+ '、'.join(''.join(x) for x in new_lines)+'。'+result['prompt']
                result['explanation']='连接 '+ '、'.join(''.join(x) for x in new_lines)+'。'+result['explanation']
            explanation=('已知或前面已经得到：'+premise_text+'。\n' if premise_text else '')+result['explanation']
            steps.append({'title':('作辅助图形' if rule.startswith('construct_') else RULES[rule][1].split('：')[0]),'prompt':result['prompt'],'hint':result['hint'],'explanation':explanation,'uses':result['uses'],'reason':result['reason'],'observe':observe,'reveal':reveal})
            details.append({'id':sid,'rule':rule,'premises':step['premises'],'derived':result['facts']})
        end=Known([f for fs in local.values() for f in fs])
        if not all(end.has(g) for g in plan['goals']):raise ValueError('本解法尚未证明题目的全部目标')
        lesson['methods'].append({'id':method['id'],'title':method['title'],'requires':sorted(requires),'steps':steps})
        report['methods'].append({'id':method['id'],'steps':details,'goal_reached':True})
    if any(s['stage'] not in used_stages for s in segments) or any(stage not in used_stages for stage in stages.values()):raise ValueError('构图使用不存在的显示阶段')
    lesson['givens']=[describe(f) for fs in known.values() for f in fs];lesson['goal']='求'+re.split(r'求证|证明|求',r['question'])[-1]
    lesson['audit']={'summary':'本地构图与已知条件一致；每种解法的定理前提和目标已通过有限规则校验。','checks':['条件原文绑定','逐步前提校验','全部目标到达','学习范围检查','图形数值检查'], 'uncertainties':['请核对题面与提取的已知条件；这里只支持已收录的构造和定理。']}
    report.update(goal_reached=True,construction=scene['audit'],exact_coordinates=scene['exact'],givens=plan['givens'],goals=plan['goals'],rules=list(dict.fromkeys(report['rules'])),plan_sha256=hashlib.sha256(json.dumps(plan,sort_keys=True,ensure_ascii=False).encode()).hexdigest())
    checked=validate_lesson(lesson,r)
    report['lesson_sha256']=hashlib.sha256(json.dumps(checked,sort_keys=True,ensure_ascii=False).encode()).hexdigest()
    return checked,report

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--plan',type=Path,required=True);p.add_argument('--request',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--report',type=Path,required=True);a=p.parse_args()
    try:lesson,report=compile_plan(load_json(a.plan),load_json(a.request))
    except ValueError as e:p.exit(1,str(e)+'\n')
    for path,obj in ((a.output,lesson),(a.report,report)):
        path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'status':lesson['status'],'goal_reached':report['goal_reached'],'output':str(a.output.resolve())},ensure_ascii=False))
if __name__=='__main__':main()
