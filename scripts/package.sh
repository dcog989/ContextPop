#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src="$root/src"
dist="$root/dist"

python3 - "$src/manifest.json" "$src/chrome_manifest.json" <<'PY'
import json
import sys

firefox, chrome = (json.load(open(path)) for path in sys.argv[1:3])
problems = []


def compare(path, expected, actual):
    if expected != actual:
        problems.append(f"{path}: firefox={expected!r} chrome={actual!r}")


for key in ("name", "version", "description", "homepage_url", "permissions", "optional_host_permissions"):
    compare(key, firefox.get(key), chrome.get(key))

ff_scripts = firefox["content_scripts"][0]
cr_scripts = chrome["content_scripts"][0]
for key in ("js", "matches", "run_at", "all_frames", "match_origin_as_fallback"):
    compare(f"content_scripts.{key}", ff_scripts.get(key), cr_scripts.get(key))

if problems:
    print("Manifest drift detected:", file=sys.stderr)
    for problem in problems:
        print("  - " + problem, file=sys.stderr)
    sys.exit(1)
PY

rm -rf "$dist"
mkdir -p "$dist/firefox" "$dist/chrome"

cp -R "$src/." "$dist/firefox/"
cp -R "$src/." "$dist/chrome/"

# Firefox already ships manifest.json; only Chrome needs the alternate manifest renamed.
rm -f "$dist/firefox/chrome_manifest.json"
cp "$dist/chrome/chrome_manifest.json" "$dist/chrome/manifest.json"
rm -f "$dist/chrome/chrome_manifest.json"

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

make_zip "$dist/firefox" "$dist/context-pop-firefox.zip"
make_zip "$dist/chrome" "$dist/context-pop-chrome.zip"

echo "Packaged:"
ls -lh "$dist"/*.zip
