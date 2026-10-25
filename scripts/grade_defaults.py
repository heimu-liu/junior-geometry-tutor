"""Shared grade defaults for the host Agent and generated board."""
import json
from pathlib import Path

CATALOG = Path(__file__).resolve().parents[1] / 'references' / 'grade-defaults.json'


def load_defaults():
    from geometry_contract import KNOWLEDGE_KEYS
    data = json.loads(CATALOG.read_text(encoding='utf-8'))
    assert set(data['grades']) == {'7', '8', '9'}, '年级默认表不完整'
    for grade, keys in data['grades'].items():
        assert keys and len(keys) == len(set(keys)), '年级默认知识重复或为空：' + grade
        assert set(keys) <= set(KNOWLEDGE_KEYS), '未知的年级默认知识：' + grade
    assert data['default_grade'] in data['grades']
    return data


def profile_for_grade(grade, edition='unknown'):
    data = load_defaults()
    grade = str(grade)
    if grade not in data['grades']:
        raise ValueError('请选择七、八或九年级')
    return {'grade': grade, 'edition': edition, 'chapter': '',
            'knowledge': list(data['grades'][grade]), 'confirmed': True}
