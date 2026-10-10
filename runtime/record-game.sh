#!/bin/bash
# Wait for a game, record the desktop while the loop plays it, stop recording when it ends.
cd /d/Projects/jev-hearthstone
node src/await-game.mjs || exit 1
out="runtime/videos/game-$(date +%Y%m%d-%H%M%S).mp4"
ffmpeg -hide_banner -loglevel error -f gdigrab -framerate 15 -i desktop -vf "scale=1280:-2" -c:v libx264 -preset veryfast -crf 28 -pix_fmt yuv420p "$out" < <(while [ ! -f runtime/.stoprec ]; do sleep 1; done; echo q) &
FF=$!
node src/loop.mjs > runtime/last-game.log 2>&1
touch runtime/.stoprec; wait $FF; rm -f runtime/.stoprec
echo "video: $out"
