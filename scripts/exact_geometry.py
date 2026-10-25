"""Deterministic constructions. Rational arithmetic when possible; bounded floats for roots/trig."""
from fractions import Fraction
import math
import re

NAME = re.compile(r'^[A-Za-z][A-Za-z0-9_]{0,31}$')
OPS = {'isosceles':(3,2), 'isosceles_angle':(3,2), 'triangle':(3,3),
       'midpoint':(3,0), 'foot':(4,0), 'on_segment':(3,1), 'on_line':(3,1), 'reflection':(4,0), 'intersection':(5,0)}

def number(s):
    if not isinstance(s,str) or len(s)>40: raise ValueError('数值须为短的有理数字符串')
    try: v=Fraction(s)
    except (ValueError,ZeroDivisionError,OverflowError): raise ValueError('无效数值') from None
    if abs(v)>1000000 or v.denominator>10**12: raise ValueError('数值超过构图范围')
    return v

def root(v):
    if v<=0: raise ValueError('三角形退化或边长矛盾')
    if isinstance(v,Fraction):
        a,b=math.isqrt(v.numerator),math.isqrt(v.denominator)
        if a*a==v.numerator and b*b==v.denominator: return Fraction(a,b)
    return math.sqrt(float(v))

def construct(operations):
    if not isinstance(operations,list) or not 1<=len(operations)<=40: raise ValueError('需要 1–40 个构造')
    pts={}; stages={}; audit=[]; seeds=0
    for op in operations:
        if not isinstance(op,dict) or set(op)!={'id','op','points','values','stage'}: raise ValueError('构造字段不正确')
        kind=op['op']; names=op['points']; values=op['values']
        if kind not in OPS: raise ValueError('不支持的本地构造 '+str(kind))
        nc,nv=OPS[kind]
        if not isinstance(names,list) or len(names)!=nc or any(not isinstance(x,str) or not NAME.fullmatch(x) for x in names): raise ValueError('构造点名不正确')
        if len(set(names))!=nc: raise ValueError('构造点不能重复')
        if not isinstance(values,list) or len(values)!=nv: raise ValueError('构造参数不正确')
        if not isinstance(op['stage'],str) or not NAME.fullmatch(op['stage']): raise ValueError('构造阶段不正确')
        val=[number(x) for x in values]
        fresh=names if kind in ('isosceles','isosceles_angle','triangle') else names[:1]
        if any(n in pts for n in fresh): raise ValueError('点被重复定义')
        if any(n not in pts for n in names[len(fresh):]): raise ValueError('构造引用未定义的点')
        if kind in ('isosceles','isosceles_angle','triangle'):
            if op['stage']!='base': raise ValueError('初始三角形必须在 base 阶段')
            if any(v<=0 for v in val): raise ValueError('构图长度和角度须大于零')
            if kind=='triangle':
                ab,bc,ac=val
                if ab+ac<=bc or ab+bc<=ac or ac+bc<=ab: raise ValueError('不满足三角形三边关系')
                x=(ab*ab+bc*bc-ac*ac)/(2*bc); y=root(ab*ab-x*x)
            else:
                bc=val[0]; x=bc/2
                if kind=='isosceles_angle':
                    if not 1<=val[1]<=179: raise ValueError('顶角须在 1–179 度之间')
                    y=float(x)/math.tan(math.radians(float(val[1])/2))
                else: y=val[1]
            # Put independent triangles side by side; translation is not a mathematical premise.
            off=Fraction(0) if not pts else max(p[0] for p in pts.values())+bc/2+2
            pts.update({names[0]:(x+off,y), names[1]:(off,Fraction(0)), names[2]:(bc+off,Fraction(0))});seeds+=1
        elif kind in ('midpoint','on_segment','on_line'):
            a,b=(pts[n] for n in names[1:]);t=Fraction(1,2) if kind=='midpoint' else val[0]
            if kind!='on_line' and not 0<t<1: raise ValueError('分点必须在线段内部')
            if kind=='on_line' and t in (0,1): raise ValueError('直线分点不能与端点重合')
            if a==b: raise ValueError('零长度线段')
            pts[names[0]]=tuple(a[i]+t*(b[i]-a[i]) for i in (0,1))
        elif kind in ('foot','reflection'):
            a,b,c=(pts[n] for n in names[1:]);v=tuple(c[i]-b[i] for i in (0,1));d=sum(x*x for x in v)
            if d==0: raise ValueError('不能向零长度直线作垂线')
            t=sum((a[i]-b[i])*v[i] for i in (0,1))/d
            foot=tuple(b[i]+t*v[i] for i in (0,1))
            pts[names[0]]=foot if kind=='foot' else tuple(2*foot[i]-a[i] for i in (0,1))
        elif kind=='intersection':
            a,b,c,d=(pts[n] for n in names[1:]);u=tuple(b[i]-a[i] for i in (0,1));v=tuple(d[i]-c[i] for i in (0,1));det=u[0]*v[1]-u[1]*v[0]
            if abs(float(det))<1e-10: raise ValueError('直线平行、重合或退化，无唯一交点')
            t=((c[0]-a[0])*v[1]-(c[1]-a[1])*v[0])/det
            pts[names[0]]=tuple(a[i]+t*u[i] for i in (0,1))
        for n in fresh:
            if any(not math.isfinite(float(v)) or abs(v)>1e8 for v in pts[n]): raise ValueError('构图坐标超出范围')
            stages[n]=op['stage']
        audit.append({'id':op['id'],'op':kind,'points':fresh,'arithmetic':'rational' if all(isinstance(v,Fraction) for n in fresh for v in pts[n]) else 'floating'})
    lo=[min(float(p[i]) for p in pts.values()) for i in (0,1)];hi=[max(float(p[i]) for p in pts.values()) for i in (0,1)]
    scale=min(760/max(hi[0]-lo[0],1e-8),470/max(hi[1]-lo[1],1e-8))
    cx=(lo[0]+hi[0])/2;cy=(lo[1]+hi[1])/2
    display={n:[round(500+(float(p[0])-cx)*scale,8),round(325-(float(p[1])-cy)*scale,8)] for n,p in pts.items()}
    return {'points':{n:[float(x) for x in p] for n,p in pts.items()},'display':display,'stages':stages,
            'exact':{n:[str(v) if isinstance(v,Fraction) else '~'+format(v,'.15g') for v in p] for n,p in pts.items()},'audit':audit}
