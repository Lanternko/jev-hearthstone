cd /d/Projects/jev-hearthstone
if [ -e runtime/runner.lock ] && kill -0 $(cat runtime/runner.lock) 2>/dev/null; then echo "another runner alive"; exit 1; fi; echo $$ > runtime/runner.lock; trap "rm -f runtime/runner.lock" EXIT
click(){ powershell -NoProfile -File runtime/pin.ps1; node -e "import('./src/win.mjs').then(async w=>{await w.focus();await w.click($1,$2);w.stop()})"; }
for i in 16 17 18 19 20 21 22 23 24 25; do
  for t in 1 2 3 4 5 6 7 8 9 10; do
    if true || [ $t -gt 1 ]; then for k in 1 2 3 4; do click 1280 1300; sleep 3; done; fi
    click 1867 1174
    if timeout 150 node src/await-game.mjs; then break; fi
  done
  node src/loop.mjs > runtime/last-game.log 2>&1
  cp runtime/last-game.log runtime/batch-game$i.log
  echo "game $i done $(date)" >> runtime/batch.txt
  sleep 20
done
