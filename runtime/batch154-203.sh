# Next 50 ranked games (154-203), including games after reaching Legend.
# Stops early on: runtime/stop, game failing to start after 10 tries,
# 6 consecutive losses, model trouble, or 50 games.

cd /d/Projects/jev-hearthstone
if [ -e runtime/runner.lock ] && kill -0 $(cat runtime/runner.lock) 2>/dev/null; then echo "another runner alive"; exit 1; fi; echo $$ > runtime/runner.lock; trap "rm -f runtime/runner.lock" EXIT
rm -f runtime/stop
click(){ powershell -NoProfile -File runtime/pin.ps1; node -e "import('./src/win.mjs').then(async w=>{await w.focus();await w.click($1,$2);w.stop()})"; }
echo "legend run start $(date) | $(node runtime/rank.mjs)" >> runtime/batch.txt
losses=0
for i in $(seq 154 203); do   # 2026-10-01: next 50 games
  [ -e runtime/stop ] && { echo "stopped by runtime/stop $(date)" >> runtime/batch.txt; exit 0; }
  started=0
  for t in 1 2 3 4 5 6 7 8 9 10; do
    click 1267 866; sleep 2   # 確定 on an error dialog (opponent failed to connect)
    for k in 1 2 3 4; do click 1280 1300; sleep 3; done
    click 1867 1174           # 點開始配對
    if timeout 150 node src/await-game.mjs; then started=1; break; fi
  done
  [ $started = 1 ] || { echo "game $i would not start, stopping $(date)" >> runtime/batch.txt; exit 1; }
  since=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  node src/loop.mjs > runtime/last-game.log 2>&1
  cp runtime/last-game.log runtime/batch-game$i.log
  sleep 20
  h=$(node runtime/health.mjs "$since"); healthy=$?
  r=$(node runtime/rank.mjs); legend=$?
  echo "game $i done $(date) | $h | HDT: $r" >> runtime/batch.txt
  [ $legend = 0 ] && echo "LEGEND milestone $(date); continuing this 50-game batch" >> runtime/batch.txt
  [ $healthy = 2 ] && { echo "model trouble, stopping $(date): ${h#*STOP }" >> runtime/batch.txt; exit 1; }
  case "$h" in Loss*) losses=$((losses+1));; Win*|Tie*) losses=0;; esac   # "?" (no result seen) counts neither way
  [ $losses -ge 6 ] && { echo "6 losses in a row, stopping $(date)" >> runtime/batch.txt; exit 1; }
done
