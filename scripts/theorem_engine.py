"""Small premise-based proof kernel. Coordinates never enter this module."""
from fractions import Fraction
from itertools import combinations
from exact_geometry import number, NAME

ARITY={'length_eq':4,'angle_eq':6,'angle_value':3,'midpoint':3,'between':3,'perpendicular':4,'bisector':4,'equilateral':3,'congruent':6}
RULES={
 'midpoint_definition':('angle','中点的定义','把中点这句话改写成两段长度的关系。'),
 'bisector_definition':('angle','角平分线的定义','一条射线把哪个角分成了相等的两部分？'),
 'equilateral_sides':('isosceles','等边三角形的定义','等边三角形的三条边有什么关系？'),
 'isosceles_base_angles':('isosceles','等腰三角形的两个底角相等','先找到相等的两条边，再找它们对着的角。'),
 'isosceles_converse':('isosceles','等角对等边','两个相等的角分别对着哪条边？'),
 'equal_base_angle_values':('angle','三角形内角和为 180°，两个底角相等','先从 180° 中减去顶角，再把余下的角度平分。'),
 'triangle_angle_sum':('angle','三角形内角和为 180°','用 180° 减去已经知道的两个角。'),
 'SSS':('congruence','SSS：三组对应边分别相等','按顶点顺序，逐一找齐三组相等的边。公共边也能算一组。'),
 'SAS':('congruence','SAS：两边及其夹角分别相等','相等的角必须夹在两组相等的边之间。'),
 'ASA':('congruence','ASA：两角及其夹边分别相等','找到两个相等的角，并核对连接这两个顶点的边。'),
 'AAS':('congruence','AAS：两角及其中一角的对边分别相等','找齐两组对应角，再找一组不夹在这两个角之间的对应边。'),
 'HL':('congruence','HL：直角三角形的斜边和一条直角边分别相等','先说明两个三角形都是直角三角形，再核对斜边和一条直角边。'),
 'corresponding_side':('congruence','全等三角形的对应边相等','按全等时的顶点顺序，找出要比较的两条对应边。'),
 'corresponding_angle':('congruence','全等三角形的对应角相等','按全等时的顶点顺序，找出要比较的两个对应角。'),
 'equal_linear_pair':('angle','邻补角相等时，每个角都是 90°','这两个相邻的角合起来是平角；如果还相等，每个应是多少度？'),
 'right_angles_equal':('angle','所有直角都相等','先确认这两个角分别是 90°。')}

PROMPTS={
 'midpoint_definition':'中点把这条线段分成了怎样的两部分？',
 'bisector_definition':'角平分线两边的角有什么关系？',
 'equilateral_sides':'这里有哪些边的长度可以确定相等？',
 'isosceles_base_angles':'相等的两条边，各自对着哪个角？',
 'isosceles_converse':'两个相等的角，分别对着哪条边？',
 'equal_base_angle_values':'两个底角加起来有多少度？它们各是多少？',
 'triangle_angle_sum':'知道两个内角后，还能怎样找到第三个内角？',
 'SSS':'这两个三角形有哪些已经能确认的边长关系？',
 'SAS':'两组相等的边之间，夹着的角相等吗？',
 'ASA':'两组角之间的那条边，能确认相等吗？',
 'AAS':'两组角相等后，还能找到哪一组对应边？',
 'HL':'除了直角，哪些边还可以用来比较这两个三角形？',
 'corresponding_side':'要比较的两条边，在全等三角形中对应吗？',
 'corresponding_angle':'要比较的两个角，在全等三角形中对应吗？',
 'equal_linear_pair':'这两个相邻的角合起来是多少度？每个角呢？',
 'right_angles_equal':'这两个角各是多少度？它们能相等吗？'}

def fact(kind,points,value=''):return {'kind':kind,'points':list(points),'value':str(value)}

def validate_fact(f):
    if not isinstance(f,dict) or set(f)!={'kind','points','value'} or f['kind'] not in ARITY: raise ValueError('事实字段或类型不正确')
    p=f['points'];k=f['kind']
    if not isinstance(p,list) or len(p)!=ARITY[k] or any(not isinstance(x,str) or not NAME.fullmatch(x) for x in p): raise ValueError('事实点名不正确')
    groups=([p[:2],p[2:]] if k in ('length_eq','perpendicular') else [p[:3],p[3:]] if k in ('angle_eq','congruent') else [p])
    if any(len(set(g))!=len(g) for g in groups): raise ValueError('事实引用退化线段或角')
    if k=='angle_value':
        v=number(f['value'])
        if not 0<v<180: raise ValueError('三角形内角必须介于 0 和 180 度')
    elif f['value']!='': raise ValueError('只有 angle_value 可以带 value')
    return f

def seg(p):return tuple(sorted(p))

def key(f):
    k,p,v=f['kind'],f['points'],f['value']
    if k in ('length_eq','perpendicular'):return k,tuple(sorted((seg(p[:2]),seg(p[2:]))))
    if k=='angle_eq':return k,tuple(sorted((ang(p[:3]),ang(p[3:]))))
    if k=='angle_value':return k,ang(p),str(number(v))
    if k=='midpoint':return k,p[0],seg(p[1:])
    if k=='between':return k,p[1],seg([p[0],p[2]])
    if k=='equilateral':return k,tuple(sorted(p))
    if k=='bisector':return k,p[1],p[2],seg([p[0],p[3]])
    if k=='congruent':return k,min(tuple(sorted(zip(p[:3],p[3:]))),tuple(sorted(zip(p[3:],p[:3]))))
    raise ValueError('未知事实')

def ang(p):return (p[1],*sorted((p[0],p[2])))

def connected(a,b,edges):
    seen={a};todo=[a]
    while todo:
        n=todo.pop()
        if n==b:return True
        for u,v in edges:
            x=v if u==n else u if v==n else None
            if x is not None and x not in seen:seen.add(x);todo.append(x)
    return False

class Known:
    def __init__(self,facts):
        self.facts=[validate_fact(f) for f in facts];self.keys={key(f) for f in facts}
        self.rays=[]
        for f in facts:
            if f['kind']=='between':
                a,m,b=f['points'];self.rays.extend([((a,m),(a,b)),((b,m),(b,a))])
            elif f['kind']=='midpoint':
                m,a,b=f['points'];self.rays.extend([((a,m),(a,b)),((b,m),(b,a))])
    def angle(self,p):
        origin=p[1]
        def ray(n):
            candidates={n}
            for a,b in self.rays:
                if a[0]==origin:
                    for c in (a[1],b[1]):
                        if connected((origin,n),(origin,c),self.rays):candidates.add(c)
            return min(candidates)
        return origin,*sorted((ray(p[0]),ray(p[2])))
    def length_eq(self,a,b):
        return connected(seg(a),seg(b),[(seg(f['points'][:2]),seg(f['points'][2:])) for f in self.facts if f['kind']=='length_eq'])
    def angle_eq(self,a,b):
        av,bv=self.angle_value(a),self.angle_value(b)
        if av is not None and av==bv:return True
        return connected(self.angle(a),self.angle(b),[(self.angle(f['points'][:3]),self.angle(f['points'][3:])) for f in self.facts if f['kind']=='angle_eq'])
    def angle_value(self,p):
        values={number(f['value']) for f in self.facts if f['kind']=='angle_value' and self.angle(f['points'])==self.angle(p)}
        if len(values)>1:raise ValueError('角度前提互相矛盾')
        return next(iter(values),None)
    def has(self,f):return key(f) in self.keys

def describe(f):
    p=f['points'];k=f['kind'];s=lambda a:''.join(a)
    if k=='length_eq':return s(p[:2])+' = '+s(p[2:])
    if k=='angle_eq':return '∠'+s(p[:3])+' = ∠'+s(p[3:])
    if k=='angle_value':return '∠'+s(p)+' = '+f['value']+'°'
    if k=='congruent':return '△'+s(p[:3])+' ≌ △'+s(p[3:])
    if k=='perpendicular':return s(p[:2])+' ⊥ '+s(p[2:])
    if k=='midpoint':return p[0]+' 是 '+s(p[1:])+' 的中点'
    if k=='between':return p[1]+' 在线段 '+p[0]+p[2]+' 内部'
    if k=='equilateral':return '△'+s(p)+' 是等边三角形'
    if k=='bisector':return p[1]+p[2]+' 平分 ∠'+p[0]+p[1]+p[3]
    return k

def prove(rule,points,givens,knowledge):
    if rule not in RULES:raise ValueError('未收录的定理：'+str(rule))
    scope,reason,hint=RULES[rule]
    if scope not in knowledge:raise ValueError('定理超出已确认的知识范围：'+rule)
    p=points;k=Known(givens);out=[];detail=''
    expected=6 if rule in ('SSS','SAS','ASA','AAS','HL','corresponding_angle','right_angles_equal') else 4 if rule in ('corresponding_side','equal_linear_pair','bisector_definition') else 3
    if not isinstance(p,list) or len(p)!=expected or any(not isinstance(x,str) or not NAME.fullmatch(x) for x in p):raise ValueError('定理参数点数不正确：'+rule)
    def require(ok):
        if not ok:raise ValueError(rule+' 缺少必要前提，或对应关系不正确')
    if rule in ('SSS','SAS','ASA','AAS','HL'):
        a,b=p[:3],p[3:];require(len(set(a))==len(set(b))==3)
        sides={(i,j):k.length_eq([a[i],a[j]],[b[i],b[j]]) for i,j in combinations(range(3),2)}
        angles={i:k.angle_eq([a[(i+1)%3],a[i],a[(i+2)%3]],[b[(i+1)%3],b[i],b[(i+2)%3]]) for i in range(3)}
        side=lambda i,j:sides[tuple(sorted((i,j)))]
        if rule=='SSS':ok=all(sides.values())
        elif rule=='SAS':ok=any(angles[i] and side(i,(i+1)%3) and side(i,(i+2)%3) for i in range(3))
        elif rule=='ASA':ok=any(angles[i] and angles[j] and side(i,j) for i,j in combinations(range(3),2))
        elif rule=='AAS':ok=any(angles[i] and angles[j] and (side(i,3-i-j) or side(j,3-i-j)) for i,j in combinations(range(3),2))
        else:
            ok=False
            for i in range(3):
                j,l=(i+1)%3,(i+2)%3
                if k.angle_value([a[j],a[i],a[l]])==90 and k.angle_value([b[j],b[i],b[l]])==90 and side(j,l) and (side(i,j) or side(i,l)):ok=True
        require(ok);out=[fact('congruent',p)]
        if rule=='SSS':
            groups=[]
            for i,j in ((0,1),(1,2),(0,2)):
                left,right=[a[i],a[j]],[b[i],b[j]]
                groups.append(''.join(left)+' = '+''.join(right)+('（同一条公共边）' if seg(left)==seg(right) else ''))
            detail='按顶点顺序比较 △'+''.join(a)+' 和 △'+''.join(b)+'：'+ '；'.join(groups)+'。三组对应边都相等。'
        else: detail='按顶点顺序比较 △'+''.join(a)+' 和 △'+''.join(b)+'，上述条件满足 '+rule+'。'
    elif rule in ('corresponding_side','corresponding_angle'):
        size=2 if rule=='corresponding_side' else 3;target='length_eq' if size==2 else 'angle_eq';ok=False
        for f in givens:
            if f['kind']!='congruent':continue
            for aa,bb in ((f['points'][:3],f['points'][3:]),(f['points'][3:],f['points'][:3])):
                mp=dict(zip(aa,bb))
                if all(x in mp for x in p[:size]):
                    mapped=[mp[x] for x in p[:size]]
                    if (seg(mapped)==seg(p[size:]) if size==2 else ang(mapped)==ang(p[size:])):ok=True
        require(ok);out=[fact(target,p)]
    elif rule=='midpoint_definition':
        m,a,b=p;require(k.has(fact('midpoint',p)));out=[fact('length_eq',[a,m,m,b]),fact('between',[a,m,b])]
    elif rule=='bisector_definition':
        a,v,d,b=p;require(k.has(fact('bisector',p)));out=[fact('angle_eq',[a,v,d,d,v,b])]
    elif rule=='equilateral_sides':
        a,b,c=p;require(k.has(fact('equilateral',p)));out=[fact('length_eq',[a,b,b,c]),fact('length_eq',[b,c,a,c])]
    elif rule=='isosceles_base_angles':
        a,b,c=p;require(k.length_eq([a,b],[a,c]));out=[fact('angle_eq',[a,b,c,a,c,b])]
    elif rule=='isosceles_converse':
        a,b,c=p;require(k.angle_eq([a,b,c],[a,c,b]));out=[fact('length_eq',[a,b,a,c])]
    elif rule=='equal_base_angle_values':
        a,b,c=p;v=k.angle_value([b,a,c]);require(v is not None and k.angle_eq([a,b,c],[a,c,b]));v=(180-v)/2
        require(0<v<180);detail='两个底角合起来是 180° − '+str(k.angle_value([b,a,c]))+'°，所以每个底角为 (180° − '+str(k.angle_value([b,a,c]))+'°) ÷ 2 = '+str(v)+'°。';out=[fact('angle_value',[a,b,c],v),fact('angle_value',[a,c,b],v)]
    elif rule=='triangle_angle_sum':
        angles=[[p[(i+1)%3],p[i],p[(i+2)%3]] for i in range(3)];vs=[k.angle_value(a) for a in angles]
        require(sum(v is not None for v in vs)==2);v=180-sum(x for x in vs if x is not None);require(0<v<180)
        out=[fact('angle_value',angles[vs.index(None)],v)]
    elif rule=='equal_linear_pair':
        a,d,b,c=p;require(k.has(fact('between',[b,d,c])) or k.has(fact('midpoint',[d,b,c])));require(k.angle_eq([a,d,b],[a,d,c]))
        out=[fact('angle_value',[a,d,b],'90'),fact('angle_value',[a,d,c],'90'),fact('perpendicular',[a,d,b,c])]
    elif rule=='right_angles_equal':
        require(k.angle_value(p[:3])==k.angle_value(p[3:])==90);out=[fact('angle_eq',p)]
    for f in out:validate_fact(f)
    return {'facts':out,'uses':[scope],'reason':reason,'hint':hint,'prompt':PROMPTS[rule],'explanation':detail+'因此，'+'；'.join(describe(f) for f in out)+'。'}
