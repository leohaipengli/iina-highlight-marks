#!/usr/bin/env python3
"""Package readable local sources, reproducibly, without downloading anything."""
from pathlib import Path
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parent
source = root / "plugin"
output = root / "dist"
output.mkdir(exist_ok=True)
info = json.loads((source / "Info.json").read_text())
assert info["permissions"] == ["show-osd"]
assert not info.get("allowedDomains")
assert "ghRepo" not in info and "ghVersion" not in info
files = ["Info.json", "main.js", "review.html", "review.js", "review.css"]
package = output / "highlight-marks.iinaplgz"
manifest = []
with zipfile.ZipFile(package, "w", compression=zipfile.ZIP_DEFLATED) as archive:
    for name in files:
        data = (source / name).read_bytes()
        entry = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
        entry.compress_type = zipfile.ZIP_DEFLATED
        entry.external_attr = 0o100644 << 16
        archive.writestr(entry, data)
        manifest.append(f"{hashlib.sha256(data).hexdigest()}  {name}")
(output / "CONTENTS.sha256").write_text("\n".join(manifest) + "\n")
digest = hashlib.sha256(package.read_bytes()).hexdigest()
(output / "SHA256SUMS").write_text(f"{digest}  {package.name}\n")
print(f"Built {package}")
print(f"SHA-256: {digest}")
