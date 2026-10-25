"""Bound, typed real-world context. It adds no premises to the proof engine."""
import copy

ROLES = {'top', 'left', 'right', 'bottom', 'crossing'}


def validate_presentation(value, lesson):
    if value is None:
        return None
    if not lesson or not isinstance(value, dict) or set(value) != {'schema', 'request_id', 'kind', 'anchors'}:
        raise ValueError('场景需要绑定完整的已生成题目')
    if value['schema'] != 'geometry-context/1' or value['kind'] != 'doorframe-plumb' or value['request_id'] != lesson['request_id']:
        raise ValueError('场景与当前题目不一致')
    anchors = value['anchors']
    if not isinstance(anchors, dict) or set(anchors) != ROLES or any(not isinstance(n, str) for n in anchors.values()) or len(set(anchors.values())) != 5:
        raise ValueError('门框场景需要五个不同的已知点')
    visible = {p['point'] for p in lesson['scene']['base'] if p['kind'] == 'point'}
    if not set(anchors.values()) <= visible:
        raise ValueError('场景不能提前引入辅助点')
    pts = lesson['scene']['points']
    a, b, d, c, e = (pts[anchors[k]] for k in ('top', 'left', 'right', 'bottom', 'crossing'))
    if not (abs(a[0]-c[0]) < 1e-6 and abs(a[0]-e[0]) < 1e-6 and abs(b[1]-d[1]) < 1e-6 and abs(b[1]-e[1]) < 1e-6 and a[1] < e[1] < c[1] and b[0] < e[0] < d[0]):
        raise ValueError('门框场景需先按竖直线绳、两侧接触点和内部交点构图')
    for method in lesson['methods']:
        marks = method['steps'][-1]['reveal']
        if not any(p['kind'] == 'rightAngle' and p['vertex'] == anchors['crossing'] and anchors['top'] in (p['a'], p['b']) and any(n in (p['a'], p['b']) for n in (anchors['left'], anchors['right'])) for p in marks):
            raise ValueError('门框场景的最后一步须完成线绳与门框垂直的数学目标')
    return copy.deepcopy(value)
