"""Prewritten failure-oriented checks; run this bounded subsystem while developing."""
import copy
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'scripts'))
from fixtures import fact,plan,request
from exact_geometry import construct
from theorem_engine import prove
from compile_plan import compile_plan

class GeometryFailures(unittest.TestCase):
    def op(self,op,points,values):return {'id':'c0','op':op,'points':points,'values':values,'stage':'base'}
    def test_midpoint_exact(self):
        p=plan();scene=construct(p['construction']);self.assertEqual(scene['exact']['D'],['3','0'])
    def test_foot_exact(self):
        p=plan();p['construction'][1]=self.op('foot',['D','A','B','C'],[]);scene=construct(p['construction']);self.assertEqual(scene['exact']['D'],['3','0'])
    def test_unequal_triangle(self):
        scene=construct([self.op('triangle',['A','B','C'],['5','6','5'])]);self.assertEqual(scene['exact']['A'],['3','4'])
    def test_invalid_sides(self):
        for v in (['1','2','3'],['0','2','2'],['-1','4','4'],['NaN','2','2'],['1/0','2','2'],['1e999','2','2']):
            with self.subTest(v=v),self.assertRaises(ValueError):construct([self.op('triangle',['A','B','C'],v)])
    def test_duplicate_point(self):
        p=plan();p['construction'][1]['points'][0]='A'
        with self.assertRaises(ValueError):construct(p['construction'])
    def test_future_point(self):
        p=plan();p['construction'].reverse()
        with self.assertRaises(ValueError):construct(p['construction'])
    def test_invalid_ratio(self):
        for ratio in ['0','1','2']:
            p=plan();p['construction'][1]=self.op('on_segment',['D','B','C'],[ratio])
            with self.subTest(ratio=ratio),self.assertRaises(ValueError):construct(p['construction'])
    def test_parallel_intersection(self):
        p=plan();p['construction'] += [self.op('midpoint',['E','A','B'],[]),self.op('midpoint',['F','A','C'],[]),self.op('intersection',['X','B','C','E','F'],[])]
        with self.assertRaises(ValueError):construct(p['construction'])
    def test_bad_angle(self):
        for theta in ['0','180','200']:
            with self.subTest(theta=theta),self.assertRaises(ValueError):construct([self.op('isosceles_angle',['A','B','C'],['6',theta])])
    def test_unknown_operator(self):
        with self.assertRaises(ValueError):construct([self.op('execute',['A'],['anything'])])

class ProofFailures(unittest.TestCase):
    def check(self,p):return compile_plan(p,request(p))
    def test_median_sss_proves_perpendicular(self):
        lesson,report=self.check(plan());self.assertEqual(lesson['status'],'ready');self.assertTrue(report['goal_reached']);self.assertIn('SSS',report['rules'])
    def test_missing_side(self):
        p=plan();p['methods'][0]['steps'][1]['premises']=['g1']
        with self.assertRaises(ValueError):self.check(p)
    def test_wrong_correspondence(self):
        p=plan();p['methods'][0]['steps'][1]['points']=['A','B','D','C','A','D']
        with self.assertRaises(ValueError):self.check(p)
    def test_unknown_ssa_aaa(self):
        for rule in ['SSA','AAA','obvious']:
            p=plan();p['methods'][0]['steps'][1]['rule']=rule
            with self.subTest(rule=rule),self.assertRaises(ValueError):self.check(p)
    def test_future_premise(self):
        p=plan();p['methods'][0]['steps'][0]['premises']=['s2']
        with self.assertRaises(ValueError):self.check(p)
    def test_cycle(self):
        p=plan();p['methods'][0]['steps'][0]['premises']=['s1']
        with self.assertRaises(ValueError):self.check(p)
    def test_goal_not_reached(self):
        p=plan();p['methods'][0]['steps']=p['methods'][0]['steps'][:2]
        with self.assertRaises(ValueError):self.check(p)
    def test_scope_reject(self):
        p=plan();p['profile']['knowledge']=['angle','isosceles']
        with self.assertRaises(ValueError):self.check(p)
    def test_source_not_in_question(self):
        p=plan();p['givens'][0]['source']='AB=AD'
        with self.assertRaises(ValueError):self.check(p)
    def test_mismatched_source_fact(self):
        p=plan();p['givens'][0]['points']=['A','B','B','C']
        with self.assertRaises(ValueError):self.check(p)
    def test_coordinate_coincidence_not_fact(self):
        p=plan();p['givens']=p['givens'][1:];p['methods'][0]['steps'][1]['premises']=['s1']
        with self.assertRaises(ValueError):self.check(p)
    def test_numerical_contradiction(self):
        p=plan();p['construction'][0]['op']='triangle';p['construction'][0]['values']=['5','6','6']
        with self.assertRaises(ValueError):self.check(p)
    def test_no_method_leak(self):
        p=plan();m=copy.deepcopy(p['methods'][0]);m['id']='other';m['steps'][0]['premises']=['s4'];p['methods'].append(m)
        with self.assertRaises(ValueError):self.check(p)
    def test_request_binding(self):
        p=plan();r=request();r['id']='different'
        with self.assertRaises(ValueError):compile_plan(p,r)
    def test_fact_cannot_assert_congruence(self):
        p=plan();p['givens'][0]['kind']='congruent';p['givens'][0]['points']=['A','B','D','A','C','D']
        with self.assertRaises(ValueError):self.check(p)

class RuleInputs(unittest.TestCase):
    def run_rule(self,rule,pts,givens,knowledge=('congruence','angle','isosceles')):
        return prove(rule,pts,givens,set(knowledge))
    def test_sss(self):
        g=[fact('length_eq',list(x)) for x in ('ABDE','BCEF','ACDF')]
        self.assertEqual(self.run_rule('SSS',list('ABCDEF'),g)['facts'][0]['kind'],'congruent')
    def test_sas(self):
        g=[fact('length_eq',list('ABDE')),fact('length_eq',list('ACDF')),fact('angle_eq',list('BACEDF'))]
        self.assertEqual(self.run_rule('SAS',list('ABCDEF'),g)['facts'][0]['kind'],'congruent')
    def test_sas_wrong_angle(self):
        g=[fact('length_eq',list('ABDE')),fact('length_eq',list('ACDF')),fact('angle_eq',list('ABCDEF'))]
        with self.assertRaises(ValueError):self.run_rule('SAS',list('ABCDEF'),g)
    def test_asa(self):
        g=[fact('angle_eq',list('BACEDF')),fact('angle_eq',list('ABCDEF')),fact('length_eq',list('ABDE'))]
        self.assertEqual(self.run_rule('ASA',list('ABCDEF'),g)['facts'][0]['kind'],'congruent')
    def test_aas(self):
        g=[fact('angle_eq',list('BACEDF')),fact('angle_eq',list('ABCDEF')),fact('length_eq',list('ACDF'))]
        self.assertEqual(self.run_rule('AAS',list('ABCDEF'),g)['facts'][0]['kind'],'congruent')
    def test_asa_wrong_side(self):
        g=[fact('angle_eq',list('BACEDF')),fact('angle_eq',list('ABCDEF')),fact('length_eq',list('ACDF'))]
        with self.assertRaises(ValueError):self.run_rule('ASA',list('ABCDEF'),g)
    def test_hl_requires_right(self):
        g=[fact('length_eq',list('ABDE')),fact('length_eq',list('ACDF'))]
        with self.assertRaises(ValueError):self.run_rule('HL',list('ABCDEF'),g)
    def test_hl(self):
        g=[fact('length_eq',list('ABDE')),fact('length_eq',list('ACDF')),fact('angle_value',list('ACB'),'90'),fact('angle_value',list('DFE'),'90')]
        self.assertEqual(self.run_rule('HL',list('ABCDEF'),g)['facts'][0]['kind'],'congruent')
    def test_isosceles_requires_equal_sides(self):
        with self.assertRaises(ValueError):self.run_rule('isosceles_base_angles',list('ABC'),[])
    def test_isosceles_angles(self):
        g=[fact('length_eq',list('ABAC'))]
        r=self.run_rule('isosceles_base_angles',list('ABC'),g)
        r2=self.run_rule('equal_base_angle_values',list('ABC'),r['facts']+[fact('angle_value',list('BAC'),'70')])
        self.assertEqual([f['value'] for f in r2['facts']],['55','55'])
    def test_invalid_angle_sum(self):
        g=[fact('angle_value',list('BAC'),'100'),fact('angle_value',list('ABC'),'100')]
        with self.assertRaises(ValueError):self.run_rule('triangle_angle_sum',list('ABC'),g)

if __name__=='__main__':unittest.main(verbosity=2)
