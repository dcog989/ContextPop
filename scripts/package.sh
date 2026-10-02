#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src="$root/src"
dist="$root/dist"

rm -rf "$dist"
mkdir -p "$dist/firefox"

cp -R "$src/." "$dist/firefox/"

make_zip() {
  local dir="$1" out="$2"
  rm -f "$out"
  if command -v zip >/dev/null 2>&1; then
    (cd "$dir" && zip -qr "$out" .)
  else
    python3 -c 'import os, sys, zipfile
d, out = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
    for base, _dirs, files in os.walk(d):
        for name in files:
            path = os.path.join(base, name)
            archive.write(path, os.path.relpath(path, d))' "$dir" "$out"
  fi
}

make_zip "$dist/firefox" "$dist/contextpop-firefox.zip"

echo "Packaged:"
ls -lh "$dist"/*.zip
