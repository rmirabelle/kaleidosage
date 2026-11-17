#!/usr/bin/env bash
# Makes help pictures with the running dev app, one caller at a time.
# Usage: tools/help-capture.sh <only>   (<only> = the start of a shot's name, or a group's name)
# Prints the dev log lines of the run. See src/help/capture.ts.
root=D:/Code/KaleidoSage
lock=$root/help-stash/capture.lock
mkdir -p "$root/help-stash"
# A lock older than 12 minutes is from a caller that stopped.
until mkdir "$lock" 2>/dev/null; do
  if [ -n "$(find "$lock" -maxdepth 0 -mmin +12 2>/dev/null)" ]; then rmdir "$lock" 2>/dev/null; fi
  sleep 3
done
trap 'rmdir "$lock" 2>/dev/null' EXIT
log=$root/dev.log
done_before=$(grep -c "help pictures done" "$log")
start=$(wc -l < "$log")
curl -s "http://localhost:14510/__help-shots?only=$1" >/dev/null
for i in $(seq 1 240); do
  [ "$(grep -c "help pictures done" "$log")" -gt "$done_before" ] && break
  sleep 2
done
tail -n +$((start + 1)) "$log" | grep -E "help picture|hot update error|frontend error" | cut -c1-300
