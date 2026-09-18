#!/bin/bash
# StyleMind launcher — double-click this in Finder.
# Starts a local web server in this folder and opens the app in your browser.
cd "$(dirname "$0")" || exit 1

PORT=4599
URL="http://localhost:$PORT"

echo "Starting StyleMind on $URL ..."
echo "(Leave this window open while you use the app. Close it to stop.)"

# open the browser shortly after the server comes up
( sleep 1; open "$URL" ) &

# python3 ships with macOS; serve the current folder
python3 -m http.server "$PORT"
