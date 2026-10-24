"""Author-authored contract fixtures, not claimed as real-model outputs."""
import copy

def fact(kind, points, value=''):
    return {'kind': kind, 'points': list(points), 'value': value}

def plan():
    return {
      'schema':'geometry-plan/1','request_id':'median-case','id':'median-plan',
      'title':'等腰三角形底边上的中线','status':'ready','message':'','questions':[],
      'profile':{'grade':'8','edition':'pep','chapter':'全等三角形','knowledge':['angle','isosceles','congruence'],'confirmed':True},
      'construction':[
        {'id':'c0','op':'isosceles','points':['A','B','C'],'values':['6','4'],'stage':'base'},
        {'id':'c1','op':'midpoint','points':['D','B','C'],'values':[],'stage':'base'}],
      'segments':[{'points':['A','B'],'stage':'base'},{'points':['A','C'],'stage':'base'},{'points':['B','C'],'stage':'base'},{'points':['A','D'],'stage':'base'}],
      'givens':[
        {'id':'g1',**fact('length_eq',['A','B','A','C']),'source':'AB=AC'},
        {'id':'g2',**fact('midpoint',['D','B','C']),'source':'D是BC的中点'}],
      'goals':[fact('perpendicular',['A','D','B','C'])],
      'methods':[{'id':'sss-method','title':'用三边对应相等证明', 'steps':[
        {'id':'s1','rule':'midpoint_definition','points':['D','B','C'],'premises':['g2']},
        {'id':'s2','rule':'SSS','points':['A','B','D','A','C','D'],'premises':['g1','s1']},
        {'id':'s3','rule':'corresponding_angle','points':['A','D','B','A','D','C'],'premises':['s2']},
        {'id':'s4','rule':'equal_linear_pair','points':['A','D','B','C'],'premises':['s1','s3']}
      ]}]
    }

def request(p=None):
    p=p or plan()
    return {'schema':'geometry-request/1','id':p['request_id'],'question':'在三角形ABC中，AB=AC，D是BC的中点。求证AD⊥BC。','profile':copy.deepcopy(p['profile']),'photo':None}
