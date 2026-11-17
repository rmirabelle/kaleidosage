#!/usr/bin/env bash
# Writes a picture of the help window at a chapter, to check its layout.
# Usage: tools/help-preview.sh <chapter id> <output.png> [scroll px] [zoom, for example 0.5]
root=D:/Code/KaleidoSage
lock=$root/help-stash/capture.lock
mkdir -p "$root/help-stash"
until mkdir "$lock" 2>/dev/null; do
  if [ -n "$(find "$lock" -maxdepth 0 -mmin +12 2>/dev/null)" ]; then rmdir "$lock" 2>/dev/null; fi
  sleep 3
done
trap 'rmdir "$lock" 2>/dev/null' EXIT
url="http://localhost:14510/__help-preview?chapter=$1&scroll=${3:-0}&zoom=${4:-1}"
# The first call opens the help window when it is closed; the second makes the picture.
curl -s "$url" >/dev/null; sleep 4
rm -f "$root/public/help/preview.png"
curl -s "$url" >/dev/null
for i in $(seq 1 20); do [ -f "$root/public/help/preview.png" ] && break; sleep 1; done
sleep 1
cp "$root/public/help/preview.png" "$2" && echo "wrote $2"
