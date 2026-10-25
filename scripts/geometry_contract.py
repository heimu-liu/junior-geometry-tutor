"""Strict, declarative geometry JSON validation using only Python's standard library.

This checks declared data and numerical geometry. It does not prove that natural-
language explanations are correct or that a declared knowledge list is complete.
"""

from __future__ import annotations

import argparse
import base64
import binascii
import copy
import json
import math
import re
from pathlib import Path


KNOWLEDGE_KEYS = (
    "angle", "area", "isosceles", "congruence", "pythagoras", "factorization",
    "parallel", "similarity", "circle", "quadrilateral", "coordinate",
)
MAX_JSON_BYTES = 12 * 1024 * 1024
MAX_PHOTO_BYTES = 8 * 1024 * 1024
GEOMETRY_TOLERANCE = 1e-3
ZERO_TOLERANCE = 1e-9
SLUG = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,79}\Z")
POINT_KEY = re.compile(r"[A-Za-z][A-Za-z0-9_]{0,31}\Z")
MARKUP = re.compile(r"<!--|<!DOCTYPE\b|<\?|</?[A-Za-z][A-Za-z0-9:_-]*(?:\s[^<>]*|/?)>", re.I)
SCRIPT = re.compile(r"\b(?:javascript|vbscript)\s*:|\b(?:eval|Function)\s*\(|\b(?:document|window|globalThis)\s*[.\[]|=>", re.I)
COMMON_PRIMITIVE_FIELDS = {"color", "width", "dashed", "fill", "opacity"}
PRIMITIVE_FIELDS = {
    "line": ({"a", "b"}, set()),
    "polygon": ({"points"}, set()),
    "circle": ({"center", "radius"}, set()),
    "point": ({"point"}, {"label", "dx", "dy"}),
    "label": ({"at", "text"}, set()),
    "rightAngle": ({"vertex", "a", "b"}, {"size"}),
    "angleArc": ({"vertex", "a", "b"}, {"size"}),
}


def _fail(path, message):
    raise ValueError(f"{path}: {message}")


def _object(value, path, required, optional=()):
    if not isinstance(value, dict):
        _fail(path, "must be an object")
    missing = set(required) - value.keys()
    unknown = value.keys() - set(required) - set(optional)
    if missing:
        _fail(path, "missing fields: " + ", ".join(sorted(missing)))
    if unknown:
        _fail(path, "unknown fields: " + ", ".join(sorted(map(str, unknown))))
    return value


def _array(value, path, maximum, minimum=0):
    if not isinstance(value, list):
        _fail(path, "must be an array")
    if not minimum <= len(value) <= maximum:
        _fail(path, f"must contain {minimum}..{maximum} items")
    return value


def _text(value, path, maximum=6000, nonempty=False):
    if not isinstance(value, str):
        _fail(path, "must be plain text")
    if len(value) > maximum or (nonempty and not value.strip()):
        _fail(path, f"must be {'nonempty and ' if nonempty else ''}at most {maximum} characters")
    if any(ord(character) < 32 and character not in "\n\r\t" for character in value):
        _fail(path, "contains forbidden control characters")
    if MARKUP.search(value) or SCRIPT.search(value):
        _fail(path, "HTML, script expressions and script URLs are not allowed")
    return value


def _number(value, path, minimum=None, maximum=None, positive=False):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        _fail(path, "must be a finite number, not a boolean or numeric string")
    try:
        finite = math.isfinite(value)
    except (OverflowError, TypeError):
        finite = False
    if not finite:
        _fail(path, "must be finite")
    if positive and value <= 0:
        _fail(path, "must be greater than zero")
    if minimum is not None and value < minimum:
        _fail(path, f"must be at least {minimum}")
    if maximum is not None and value > maximum:
        _fail(path, f"must be at most {maximum}")
    return value


def _slug(value, path):
    if not isinstance(value, str) or not SLUG.fullmatch(value):
        _fail(path, "must be a 1..80 character slug using letters, digits, _ or -")
    return value


def _texts(value, path, maximum=32, item_maximum=6000, minimum=0):
    for index, item in enumerate(_array(value, path, maximum, minimum)):
        _text(item, f"{path}[{index}]", item_maximum, nonempty=True)
    return value


def _knowledge(value, path, minimum=0):
    _array(value, path, len(KNOWLEDGE_KEYS), minimum)
    for index, key in enumerate(value):
        if not isinstance(key, str) or key not in KNOWLEDGE_KEYS:
            _fail(f"{path}[{index}]", "unknown knowledge key")
    if len(set(value)) != len(value):
        _fail(path, "knowledge keys must be unique")
    return value


def _profile(value, path):
    _object(value, path, {"grade", "edition", "chapter", "knowledge", "confirmed"})
    if value["grade"] not in ("7", "8", "9"):
        _fail(path + ".grade", "must be '7', '8' or '9'")
    _text(value["edition"], path + ".edition", 80)
    _text(value["chapter"], path + ".chapter", 150)
    _knowledge(value["knowledge"], path + ".knowledge")
    if value["confirmed"] is not True:
        _fail(path + ".confirmed", "must be true")


def _photo(value, path):
    if value is None:
        return
    if not isinstance(value, str):
        _fail(path, "must be null or a PNG/JPEG/WebP base64 data URL")
    match = re.fullmatch(r"data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/]*={0,2})", value)
    if not match:
        _fail(path, "only PNG/JPEG/WebP base64 data URLs are accepted")
    image_type, encoded = match.groups()
    if len(encoded) > ((MAX_PHOTO_BYTES + 2) // 3) * 4:
        _fail(path, "decoded photo exceeds 8 MiB")
    try:
        data = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error) as error:
        _fail(path, "invalid base64: " + str(error))
    if len(data) > MAX_PHOTO_BYTES:
        _fail(path, "decoded photo exceeds 8 MiB")
    signatures = {
        "png": data.startswith(b"\x89PNG\r\n\x1a\n"),
        "jpeg": data.startswith(b"\xff\xd8\xff"),
        "webp": len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP",
    }
    if not signatures[image_type]:
        _fail(path, "photo bytes do not match the declared image type")


def _depth(value, maximum=48):
    pending = [(value, 0)]
    while pending:
        node, level = pending.pop()
        if level > maximum:
            _fail("$", "JSON nesting exceeds 48 levels")
        if isinstance(node, dict):
            pending.extend((child, level + 1) for child in node.values())
        elif isinstance(node, list):
            pending.extend((child, level + 1) for child in node)


def validate_request(data):
    """Return a detached validated request, or raise ValueError with a JSON path."""
    _depth(data)
    _object(data, "$", {"schema", "id", "question", "profile", "photo"})
    if data["schema"] != "geometry-request/1":
        _fail("$.schema", "must be geometry-request/1")
    _slug(data["id"], "$.id")
    _text(data["question"], "$.question", 6000, nonempty=True)
    _profile(data["profile"], "$.profile")
    _photo(data["photo"], "$.photo")
    return copy.deepcopy(data)


def _coordinate(value, path):
    _array(value, path, 2, 2)
    _number(value[0], path + "[0]", 0, 1000)
    _number(value[1], path + "[1]", 0, 700)


def _reference(value, scene_points, path):
    if not isinstance(value, str) or value not in scene_points:
        _fail(path, "must reference a defined scene point")
    return value


def _vector(first, second, scene_points, path):
    a, b = scene_points[first], scene_points[second]
    vector = (b[0] - a[0], b[1] - a[1])
    if math.hypot(*vector) <= ZERO_TOLERANCE:
        _fail(path, "zero-length segment is not allowed")
    return vector


def _perpendicular(first, second):
    dot = first[0] * second[0] + first[1] * second[1]
    return abs(dot) <= GEOMETRY_TOLERANCE * math.hypot(*first) * math.hypot(*second)


def _parallel(first, second):
    cross = first[0] * second[1] - first[1] * second[0]
    return abs(cross) <= GEOMETRY_TOLERANCE * math.hypot(*first) * math.hypot(*second)


def _primitive(value, scene_points, path, identifiers):
    if not isinstance(value, dict):
        _fail(path, "must be a primitive object")
    kind = value.get("kind")
    if not isinstance(kind, str) or kind not in PRIMITIVE_FIELDS:
        _fail(path + ".kind", "unknown primitive kind")
    required, optional = PRIMITIVE_FIELDS[kind]
    _object(value, path, {"id", "kind"} | required, COMMON_PRIMITIVE_FIELDS | optional)
    identifier = _slug(value["id"], path + ".id")
    if identifier in identifiers:
        _fail(path + ".id", "primitive id must be globally unique in the lesson")
    identifiers.add(identifier)
    if "color" in value and value["color"] not in ("ink", "amber", "blue", "red"):
        _fail(path + ".color", "unknown color token")
    for field, minimum, maximum in (("width", 1, 8), ("opacity", 0.03, 1)):
        if field in value:
            _number(value[field], path + "." + field, minimum, maximum)
    for field in ("dashed", "fill"):
        if field in value and not isinstance(value[field], bool):
            _fail(path + "." + field, "must be a boolean")
    references = []
    if kind in ("line", "rightAngle", "angleArc"):
        references = [_reference(value[key], scene_points, path + "." + key) for key in ("a", "b")]
        if kind == "line":
            _vector(*references, scene_points, path)
        else:
            vertex = _reference(value["vertex"], scene_points, path + ".vertex")
            first = _vector(vertex, references[0], scene_points, path)
            second = _vector(vertex, references[1], scene_points, path)
            if kind == "rightAngle" and not _perpendicular(first, second):
                _fail(path, "rightAngle rays are not numerically perpendicular")
            references.append(vertex)
            if "size" in value:
                _number(value["size"], path + ".size", 4, 80)
    elif kind == "polygon":
        for index, name in enumerate(_array(value["points"], path + ".points", 300, 3)):
            references.append(_reference(name, scene_points, f"{path}.points[{index}]"))
        if len(set(references)) != len(references):
            _fail(path + ".points", "polygon vertices must not repeat")
        coordinates = [scene_points[name] for name in references]
        area_twice = 0.0
        maximum_edge_squared = 0.0
        for index, name in enumerate(references):
            next_name = references[(index + 1) % len(references)]
            edge = _vector(name, next_name, scene_points, path)
            maximum_edge_squared = max(maximum_edge_squared, edge[0] ** 2 + edge[1] ** 2)
            a, b = coordinates[index], coordinates[(index + 1) % len(coordinates)]
            area_twice += a[0] * b[1] - b[0] * a[1]
        if abs(area_twice) <= ZERO_TOLERANCE * maximum_edge_squared:
            _fail(path, "degenerate polygon is not allowed")
    elif kind == "circle":
        references = [_reference(value["center"], scene_points, path + ".center")]
        _number(value["radius"], path + ".radius", maximum=1000, positive=True)
    elif kind == "point":
        references = [_reference(value["point"], scene_points, path + ".point")]
        if "label" in value:
            _text(value["label"], path + ".label", 160)
        if "dx" in value:
            _number(value["dx"], path + ".dx", -1000, 1000)
        if "dy" in value:
            _number(value["dy"], path + ".dy", -700, 700)
    elif kind == "label":
        _coordinate(value["at"], path + ".at")
        _text(value["text"], path + ".text", 160, nonempty=True)
    return references


def _shape(value):
    kind = value["kind"]
    if kind == "line":
        return (kind, *sorted((value["a"], value["b"])))
    if kind == "circle":
        return (kind, value["center"], value["radius"])
    if kind in ("rightAngle", "angleArc"):
        return (kind, value["vertex"], *sorted((value["a"], value["b"])))
    return None


def _stage(primitives, scene_points, path, identifiers, visible, existing_shapes, observe=False, maximum=100):
    _array(primitives, path, maximum)
    declared = set()
    if not observe:
        for index, primitive in enumerate(primitives):
            if isinstance(primitive, dict) and primitive.get("kind") == "point":
                name = _reference(primitive.get("point"), scene_points, f"{path}[{index}].point")
                if name in declared or name in visible:
                    _fail(f"{path}[{index}].point", "point is already visible; point declarations do not update existing points")
                declared.add(name)
    available = visible | declared
    new_shapes = set()
    for index, primitive in enumerate(primitives):
        item_path = f"{path}[{index}]"
        references = _primitive(primitive, scene_points, item_path, identifiers)
        if observe and primitive["kind"] in ("point", "label"):
            _fail(item_path + ".kind", "observe cannot contain point or label primitives")
        if not set(references) <= available:
            _fail(item_path, "references a point that has not yet been revealed")
        shape = _shape(primitive)
        if observe and shape is not None and shape not in existing_shapes:
            _fail(item_path, "observe may only highlight an already drawn line, circle or rightAngle")
        if shape is not None:
            new_shapes.add(shape)
    return available, existing_shapes | new_shapes


def _constraint(value, scene_points, path):
    _object(value, path, {"kind", "points"}, {"value"})
    kind = value["kind"]
    if kind not in ("perpendicular", "parallel", "equal_length", "collinear", "midpoint", "ratio"):
        _fail(path + ".kind", "unknown constraint kind")
    count = 3 if kind in ("collinear", "midpoint") else 4
    names = _array(value["points"], path + ".points", count, count)
    for index, name in enumerate(names):
        _reference(name, scene_points, f"{path}.points[{index}]")
    if kind != "ratio" and "value" in value:
        _fail(path + ".value", "value is only valid for a ratio constraint")
    if kind == "collinear":
        first = _vector(names[0], names[1], scene_points, path)
        second = _vector(names[0], names[2], scene_points, path)
        _vector(names[1], names[2], scene_points, path)
        valid = _parallel(first, second)
    elif kind == "midpoint":
        a, middle, b = (scene_points[name] for name in names)
        vector = _vector(names[0], names[2], scene_points, path)
        _vector(names[0], names[1], scene_points, path)
        _vector(names[1], names[2], scene_points, path)
        error = math.hypot(middle[0] - (a[0] + b[0]) / 2, middle[1] - (a[1] + b[1]) / 2)
        valid = error <= GEOMETRY_TOLERANCE * math.hypot(*vector)
    else:
        first = _vector(names[0], names[1], scene_points, path)
        second = _vector(names[2], names[3], scene_points, path)
        if kind == "perpendicular":
            valid = _perpendicular(first, second)
        elif kind == "parallel":
            valid = _parallel(first, second)
        elif kind == "equal_length":
            valid = math.isclose(math.hypot(*first), math.hypot(*second), rel_tol=GEOMETRY_TOLERANCE, abs_tol=0)
        else:
            if "value" not in value:
                _fail(path + ".value", "ratio requires a positive value")
            target = _number(value["value"], path + ".value", positive=True)
            actual = math.hypot(*first) / math.hypot(*second)
            valid = math.isclose(actual, target, rel_tol=GEOMETRY_TOLERANCE, abs_tol=0)
    if not valid:
        _fail(path, f"declared {kind} constraint is not satisfied by the scene coordinates")


def validate_lesson(data, request=None):
    """Validate a lesson and optionally bind it to an already confirmed request."""
    _depth(data)
    _object(data, "$", {"schema", "request_id", "id", "title", "statement", "givens", "goal", "status", "message", "questions", "profile", "scene", "methods", "audit"})
    if data["schema"] != "geometry-lesson/1":
        _fail("$.schema", "must be geometry-lesson/1")
    _slug(data["id"], "$.id")
    _slug(data["request_id"], "$.request_id")
    _text(data["title"], "$.title", 160, nonempty=True)
    _text(data["statement"], "$.statement", 6000, nonempty=True)
    _text(data["goal"], "$.goal", 6000)
    _texts(data["givens"], "$.givens")
    if data["status"] not in ("ready", "needs_clarification", "out_of_scope"):
        _fail("$.status", "unknown lesson status")
    ready = data["status"] == "ready"
    _text(data["message"], "$.message", 2000, nonempty=not ready)
    _texts(data["questions"], "$.questions", minimum=1 if data["status"] == "needs_clarification" else 0)
    _profile(data["profile"], "$.profile")
    if request is not None:
        confirmed_request = validate_request(request)
        if data["request_id"] != confirmed_request["id"]:
            _fail("$.request_id", "does not match the request id")
        if data["profile"] != confirmed_request["profile"]:
            _fail("$.profile", "must exactly match the confirmed request profile")
    scene = _object(data["scene"], "$.scene", {"points", "base", "constraints"})
    scene_points = scene["points"]
    if not isinstance(scene_points, dict) or len(scene_points) > 300:
        _fail("$.scene.points", "must be an object with at most 300 point definitions")
    for name, coordinate in scene_points.items():
        if not isinstance(name, str) or not POINT_KEY.fullmatch(name):
            _fail("$.scene.points", "point keys must match [A-Za-z][A-Za-z0-9_]{0,31}")
        _coordinate(coordinate, "$.scene.points." + name)
    identifiers = set()
    base_visible, base_shapes = _stage(scene["base"], scene_points, "$.scene.base", identifiers, set(), set(), maximum=500)
    for index, constraint in enumerate(_array(scene["constraints"], "$.scene.constraints", 200)):
        _constraint(constraint, scene_points, f"$.scene.constraints[{index}]")
    methods = _array(data["methods"], "$.methods", 4 if ready else 0, 1 if ready else 0)
    method_ids = set()
    for method_index, method in enumerate(methods):
        path = f"$.methods[{method_index}]"
        _object(method, path, {"id", "title", "requires", "steps"})
        _slug(method["id"], path + ".id")
        if method["id"] in method_ids:
            _fail(path + ".id", "method ids must be unique")
        method_ids.add(method["id"])
        _text(method["title"], path + ".title", 160, nonempty=True)
        requires = set(_knowledge(method["requires"], path + ".requires", minimum=1))
        if not requires <= set(data["profile"]["knowledge"]):
            _fail(path + ".requires", "requires knowledge outside the confirmed profile")
        visible, shapes = set(base_visible), set(base_shapes)
        for step_index, step in enumerate(_array(method["steps"], path + ".steps", 12, 2)):
            step_path = f"{path}.steps[{step_index}]"
            _object(step, step_path, {"title", "prompt", "hint", "explanation", "uses", "reason", "observe", "reveal"})
            _text(step["title"], step_path + ".title", 160, nonempty=True)
            for field in ("prompt", "hint", "explanation", "reason"):
                _text(step[field], step_path + "." + field, 6000, nonempty=True)
            uses = set(_knowledge(step["uses"], step_path + ".uses", minimum=1))
            if not uses <= requires:
                _fail(step_path + ".uses", "must be a subset of this method's requires")
            _stage(step["observe"], scene_points, step_path + ".observe", identifiers, visible, shapes, observe=True)
            visible, shapes = _stage(step["reveal"], scene_points, step_path + ".reveal", identifiers, visible, shapes)
    audit = _object(data["audit"], "$.audit", {"summary", "checks", "uncertainties"})
    _text(audit["summary"], "$.audit.summary", 6000, nonempty=True)
    _texts(audit["checks"], "$.audit.checks")
    _texts(audit["uncertainties"], "$.audit.uncertainties")
    return copy.deepcopy(data)


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate JSON object key: {key}")
        result[key] = value
    return result


def _invalid_constant(value):
    raise ValueError(f"non-standard JSON constant is not allowed: {value}")


def load_json(path):
    """Read at most 12 MiB of strict UTF-8 JSON, rejecting duplicate keys."""
    source = Path(path)
    try:
        with source.open("rb") as stream:
            content = stream.read(MAX_JSON_BYTES + 1)
        if len(content) > MAX_JSON_BYTES:
            _fail("$", "JSON file exceeds 12 MiB")
        result = json.loads(content.decode("utf-8"), object_pairs_hook=_unique_object, parse_constant=_invalid_constant)
    except (OSError, UnicodeError, json.JSONDecodeError, RecursionError) as error:
        raise ValueError(f"could not load strict JSON from {source}: {error}") from error
    if not isinstance(result, dict):
        _fail("$", "JSON root must be an object")
    _depth(result)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("kind", choices=("request", "lesson"))
    parser.add_argument("path", type=Path)
    parser.add_argument("--request", type=Path, help="bind a lesson to this confirmed request JSON")
    arguments = parser.parse_args()
    try:
        data = load_json(arguments.path)
        if arguments.kind == "request":
            if arguments.request is not None:
                parser.error("--request only applies to a lesson")
            validate_request(data)
        else:
            request = load_json(arguments.request) if arguments.request else None
            validate_lesson(data, request)
    except ValueError as error:
        parser.exit(1, str(error) + "\n")
    print(json.dumps({"valid": True, "kind": arguments.kind, "id": data["id"], "scope": "structure, declared knowledge and numerical geometry only"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
