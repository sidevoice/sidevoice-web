#!/bin/sh
# Writes where the interface looks first, from SIDEVOICE_TARGET, into /voice/target.js (nginx's image runs
# every script in /docker-entrypoint.d/ before starting). Only an http(s) URL is written, as a JSON string.
set -eu
file=/usr/share/nginx/html/voice/target.js
nl='
'
case "${SIDEVOICE_TARGET:-}" in *"$nl"*|*"</"*) echo "SIDEVOICE_TARGET must be one line, a URL" >&2; exit 1 ;; esac
case "${SIDEVOICE_TARGET:-}" in
  "") printf '%s\n' "/* no SIDEVOICE_TARGET: nothing at this origin; the pairing code says where the machine is */" \
        "window.__SIDEVOICE_TARGET__ = null;" > "$file" ;;
  http://*|https://*)
    escaped=$(printf '%s' "$SIDEVOICE_TARGET" | sed 's/\\/\\\\/g; s/"/\\"/g')
    printf 'window.__SIDEVOICE_TARGET__ = "%s";\n' "$escaped" > "$file" ;;
  *) echo "SIDEVOICE_TARGET must be an http(s) URL" >&2; exit 1 ;;
esac
