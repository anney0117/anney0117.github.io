"""Prepare the verified Vite build for GitHub Pages."""
import hashlib
import json
import os
import re
from pathlib import Path

root = Path(".")
dist = Path("source/dist")
manifest = {}
for file in sorted(dist.rglob("*")):
    if not file.is_file():
        continue
    relative = file.relative_to(dist)
    content = file.read_bytes()
    if file.suffix == ".css":
        text = content.decode("utf-8")
        text = re.sub(r"""@import\s*(?:url\(\s*)?["']https://fonts\.googleapis\.com[^"']*["']\s*\)?\s*;""", "", text)
        content = text.encode("utf-8")
    for destination in (root / relative, root / "site" / relative):
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(content)
    manifest[str(relative)] = {"bytes": len(content), "sha256": hashlib.sha256(content).hexdigest()}
if "index.html" not in manifest or not any(p.endswith(".wasm") for p in manifest):
    raise RuntimeError("Incomplete CAD build")
(root / ".nojekyll").touch()
(root / "site/.nojekyll").touch()
(root / "migration-manifest.json").write_text(
    json.dumps({"source": "source/", "source_commit": os.environ.get("GITHUB_SHA"), "files": manifest}, indent=2) + "\n",
    encoding="utf-8",
)
print("Prepared", len(manifest), "verified build files")
