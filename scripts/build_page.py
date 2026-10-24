"""Build a dependency-free board; model output is always data, never executable code."""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def safe_json(value):
    return json.dumps(value, ensure_ascii=False).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")


def build_html(lesson=None, profile=None, bridge=None):
    if lesson is not None:
        from geometry_contract import validate_lesson
        lesson = validate_lesson(lesson)
        if lesson["status"] != "ready":
            raise ValueError("Only ready lessons can build learning pages; deliver clarification/out-of-scope messages through the host.")
        profile = lesson["profile"]
    folder = ROOT / "templates" / "board"
    html = (folder / "index.html").read_text(encoding="utf-8")
    css = (folder / "styles.css").read_text(encoding="utf-8")
    html = html.replace('<link rel="stylesheet" href="styles.css">', '<style>\n' + css + '\n</style>')
    bootstrap = {"lesson": lesson, "profile": profile}
    config = '<script>window.GEOMETRY_BOOTSTRAP=' + safe_json(bootstrap) + ';window.GEOMETRY_BRIDGE=' + safe_json(bridge) + ';</script>'
    html = html.replace('<!-- BOOTSTRAP -->', config)
    for name in ("lessons.js", "lesson-renderer.js", "drawing.js", "app.js"):
        source = (folder / name).read_text(encoding="utf-8").replace('</script', '<\\/script')
        html = html.replace(f'<script src="{name}"></script>', '<script>\n' + source + '\n</script>')
    return html


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--lesson", type=Path)
    p.add_argument("--request", type=Path)
    p.add_argument("--output", type=Path, required=True)
    args = p.parse_args()
    from geometry_contract import load_json, validate_lesson
    lesson = load_json(args.lesson) if args.lesson else None
    if args.request and not lesson:
        p.error("--request requires --lesson")
    if lesson is not None:
        lesson = validate_lesson(lesson, load_json(args.request) if args.request else None)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(build_html(lesson=lesson), encoding="utf-8")
    print(args.output.resolve())


if __name__ == "__main__":
    main()
