"""Copy the existing public CAD build into this repository for GitHub Pages."""
import hashlib
import json
import re
from collections import deque
from pathlib import Path
from urllib.parse import urljoin, urlsplit, unquote
from urllib.request import Request, urlopen

SOURCE = "https://zhungou-cad-20261121.sacredanole21.chatgpt.site/"
OUTPUT = Path("site")
MAX_FILE = 32 * 1024 * 1024
MAX_TOTAL = 64 * 1024 * 1024
ASSET_PATH = re.compile(r"""(?:\./|/)?assets/[A-Za-z0-9_.-]+\.(?:js|css|wasm|png|jpg|jpeg|svg|webp|woff2?)""")
RELATIVE_ASSET = re.compile(r"""["'(]((?:\./)?[A-Za-z0-9_.]+-[A-Za-z0-9_-]{8,}\.(?:js|css|wasm))["')]""")
origin = urlsplit(SOURCE)
queue = deque([""])
seen = set()
manifest = {}
total = 0

while queue:
    relative = queue.popleft()
    if relative in seen:
        continue
    if len(seen) >= 40:
        raise RuntimeError("Unexpected number of build assets")
    seen.add(relative)
    url = urljoin(SOURCE, relative)
    req = Request(url, headers={"User-Agent": "ZhunGou-CAD-Pages-Migration/1.0"})
    with urlopen(req, timeout=90) as response:
        final = urlsplit(response.url)
        if (final.scheme, final.netloc) != (origin.scheme, origin.netloc):
            raise RuntimeError("Unexpected cross-origin redirect")
        content = response.read(MAX_FILE + 1)
    if not content or len(content) > MAX_FILE:
        raise RuntimeError("Missing or oversized asset: " + relative)
    total += len(content)
    if total > MAX_TOTAL:
        raise RuntimeError("Build exceeds the expected size")
    local = relative or "index.html"
    parts = Path(unquote(local)).parts
    if ".." in parts or Path(local).is_absolute():
        raise RuntimeError("Unsafe asset path")
    suffix = Path(local).suffix
    if suffix == ".wasm" and content[:4] != b"\x00asm":
        raise RuntimeError("Invalid WebAssembly asset")
    if suffix in {".js", ".css"} and content.lstrip().lower().startswith((b"<!doctype html", b"<html")):
        raise RuntimeError("Received an HTML error instead of a build asset")
    if suffix in {".html", ".js", ".css"}:
        body = content.decode("utf-8")
        if local == "index.html" and ("CAD" not in body or not ASSET_PATH.search(body)):
            raise RuntimeError("Source page is not the expected CAD build")
        for matched in ASSET_PATH.findall(body):
            queue.append(matched.removeprefix("./").lstrip("/"))
        if relative.startswith("assets/"):
            for matched in RELATIVE_ASSET.findall(body):
                resolved = urlsplit(urljoin(url, matched)).path.lstrip("/")
                if resolved.startswith("assets/"):
                    queue.append(resolved)
        if suffix == ".css":
            body = re.sub(r"""@import\s+(?:url\()?["']?https://fonts\.googleapis\.com[^;]+;""", "", body)
            content = body.encode("utf-8")
    target = OUTPUT / local
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)
    manifest[local] = {"bytes": len(content), "sha256": hashlib.sha256(content).hexdigest()}
    print("Copied", local, len(content))

if not any(name.endswith(".wasm") for name in manifest):
    raise RuntimeError("The CAD WebAssembly engine is missing")
if not any("worker" in name and name.endswith(".js") for name in manifest):
    raise RuntimeError("The CAD worker is missing")
(OUTPUT / ".nojekyll").touch()
Path("migration-manifest.json").write_text(
    json.dumps({"source": SOURCE, "files": manifest}, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)
print("Validated", len(manifest), "files;", total, "downloaded bytes")
