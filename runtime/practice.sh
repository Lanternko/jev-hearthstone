# Timing sweep vs the Innkeeper (practice, Priest, deck 棄牌). One game per line of CONFIGS.
cd /d/Projects/jev-hearthstone
rm -f runtime/stop
click(){ powershell -NoProfile -File runtime/pin.ps1; node -e "import('./src/win.mjs').then(async w=>{await w.focus();await w.click($1,$2);w.stop()})"; }
CONFIGS=(
 "A JEV_TURN_SETTLE=3500 JEV_ACTION_SETTLE=1200 JEV_DRAW_SETTLE=3000 JEV_DRAW_EACH=800 JEV_DEAD_MS=9000"
 "B JEV_TURN_SETTLE=1800 JEV_ACTION_SETTLE=700 JEV_DRAW_SETTLE=2000 JEV_DRAW_EACH=600 JEV_DEAD_MS=4500"
 "B JEV_TURN_SETTLE=1800 JEV_ACTION_SETTLE=700 JEV_DRAW_SETTLE=2000 JEV_DRAW_EACH=600 JEV_DEAD_MS=4500"
 "C JEV_TURN_SETTLE=900 JEV_ACTION_SETTLE=350 JEV_DRAW_SETTLE=1400 JEV_DRAW_EACH=450 JEV_DEAD_MS=3500"
 "C JEV_TURN_SETTLE=900 JEV_ACTION_SETTLE=350 JEV_DRAW_SETTLE=1400 JEV_DRAW_EACH=450 JEV_DEAD_MS=3500"
 "A JEV_TURN_SETTLE=3500 JEV_ACTION_SETTLE=1200 JEV_DRAW_SETTLE=3000 JEV_DRAW_EACH=800 JEV_DEAD_MS=9000"
)
n=1
LIVE=1
for cfg in "${CONFIGS[@]}"; do
  n=$((n+1)); set -- $cfg; name=$1; shift
  [ -e runtime/stop ] && { echo "stopped $(date)" >> runtime/practice.txt; exit 0; }
  started=0
  for t in 1 2 3 4 5; do
    [ -n "$LIVE" ] && { LIVE=; started=1; break; }   # a game already started by hand
    for k in 1 2 3 4; do click 1280 1300; sleep 3; done
    click 1872 1173; sleep 2.5   # 開始 on the deck page -> opponent list
    click 1856 608; sleep 1.5    # 牧師
    click 1888 1149              # 開始
    if timeout 120 node src/await-game.mjs; then started=1; break; fi
  done
  [ $started = 1 ] || { echo "g$n would not start $(date)" >> runtime/practice.txt; exit 1; }
  t0=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  env "$@" node src/loop.mjs > runtime/practice-g$n.log 2>&1
  echo "g$n $name start=$t0 end=$(date -u +%Y-%m-%dT%H:%M:%SZ) $*" >> runtime/practice.txt
  sleep 12
done
echo "sweep done $(date)" >> runtime/practice.txt
