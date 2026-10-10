cd /d/Projects/jev-hearthstone
click(){ powershell -NoProfile -File runtime/pin.ps1; node -e "import('./src/win.mjs').then(async w=>{await w.focus();await w.click($1,$2);w.stop()})"; }
for i in 11 12 13 14 15; do
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
