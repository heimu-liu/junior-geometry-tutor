"""Build small, deterministic install archives without runtime or personal data."""
from pathlib import Path
import hashlib
import json
import re
import zipfile

ROOT = Path(__file__).resolve().parent.parent
ALLOWED_DIRS = ("scripts", "templates", "references", "agents", "examples")
ALLOWED_SUFFIXES = {".py", ".js", ".html", ".css", ".json", ".md", ".yaml"}


def main():
    destination = ROOT / "dist"
    destination.mkdir(exist_ok=True)
    files = [ROOT / "SKILL.md", ROOT / "README.md", ROOT / "几何自习室.html", ROOT / "docs" / "verification.md"]
    for dirname in ALLOWED_DIRS:
        files.extend(p for p in (ROOT / dirname).rglob("*") if p.is_file() and not p.is_symlink()
                     and p.suffix in ALLOWED_SUFFIXES and "__pycache__" not in p.parts)
    entry = (ROOT / "SKILL.md").read_text(encoding="utf-8")
    match = re.search(r'^  version: "(\d+\.\d+\.\d+)"$', entry, re.MULTILINE)
    if not match:
        raise ValueError("SKILL.md must declare metadata.version as a quoted semantic version")
    archive = destination / f"junior-geometry-tutor-v{match.group(1)}.zip"
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as out:
        for file in sorted(files):
            relative = file.relative_to(ROOT).as_posix()
            info = zipfile.ZipInfo(relative, (2026, 10, 23, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            out.writestr(info, file.read_bytes())
    with zipfile.ZipFile(archive) as check:
        assert check.testzip() is None
        names = check.namelist()
        assert "SKILL.md" in names and all(not n.startswith(("/", ".runtime", "tests", "prototype")) and ".." not in Path(n).parts for n in names)
        assert check.read("SKILL.md") == (ROOT / "SKILL.md").read_bytes()
    legacy = [destination / f"junior-geometry-tutor-{target}-v0.2.0.zip" for target in ("universal", "workbuddy")]
    if any(path.exists() for path in legacy):
        history = destination / "archive" / "v0.2.0"
        history.mkdir(parents=True, exist_ok=True)
        existing = [path for path in legacy if path.exists()]
        if (destination / "checksums.json").exists():
            existing.append(destination / "checksums.json")
        if any((history / path.name).exists() for path in existing):
            raise FileExistsError("Legacy archive already exists; preserve it and resolve the duplicate before packaging")
        for path in existing:
            path.rename(history / path.name)
    previous = destination / "junior-geometry-tutor-v0.2.1.zip"
    if previous.exists() and previous != archive:
        history = destination / "archive" / "v0.2.1"
        history.mkdir(parents=True, exist_ok=True)
        if (history / previous.name).exists():
            raise FileExistsError("Previous release archive already exists")
        previous.rename(history / previous.name)
        checksum = destination / "checksums.json"
        if checksum.exists():
            checksum.rename(history / "checksums.json")
    previous = destination / "junior-geometry-tutor-v0.3.0.zip"
    if previous.exists() and previous != archive:
        history = destination / "archive" / "v0.3.0"
        history.mkdir(parents=True, exist_ok=True)
        if (history / previous.name).exists():
            raise FileExistsError("Previous release archive already exists")
        previous.rename(history / previous.name)
        checksum = destination / "checksums.json"
        if checksum.exists():
            checksum.rename(history / "checksums.json")
    records = [{"file": archive.name, "kind": "unified", "sha256": hashlib.sha256(archive.read_bytes()).hexdigest(), "bytes": archive.stat().st_size, "files": len(files)}]
    (destination / "checksums.json").write_text(json.dumps(records, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    for record in records:
        print(f"{record['file']}: {record['bytes']} bytes, {record['files']} files")


if __name__ == "__main__":
    main()
