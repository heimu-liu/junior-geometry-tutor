"""Validate format, declared learning scope and numerical geometry constraints."""
import argparse
import sys
from pathlib import Path
from geometry_contract import load_json, validate_lesson


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("lesson", type=Path)
    p.add_argument("--request", type=Path)
    args = p.parse_args()
    try:
        data = validate_lesson(load_json(args.lesson), load_json(args.request) if args.request else None)
    except (ValueError, OSError) as error:
        print(f"INVALID: {error}", file=sys.stderr)
        return 1
    print(f"VALID: {data['status']} · {len(data['methods'])} method(s). Mathematical reasoning still requires host review.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
