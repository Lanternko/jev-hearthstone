#!/bin/bash
# Wait on this computer until a 5090 job writes DONE or FAILED, then print its orchestrate.log and exit (L-082).
# Run it once with run_in_background right after the launch: it wakes the session a single time, at the end.
#   bash train/await-5090.sh <dir on the 5090 holding DONE/FAILED, relative to ~> [check every N seconds, default 120]
# Exit 0 on DONE, 1 on FAILED, 2 when ssh failed 15 times in a row (5090 unreachable: report it, do not loop).
set -u
dir=$1; every=${2:-120}; host=kojiek@100.97.181.15; misses=0
while :; do
  if state=$(ssh -o ConnectTimeout=20 -o BatchMode=yes $host "cd ~/$dir && { [ -f FAILED ] && echo FAILED || { [ -f DONE ] && echo DONE || echo running; }; }" 2>/dev/null); then
    misses=0
    case $state in
      DONE|FAILED) echo "$(date -Is) $dir: $state"; ssh $host "tail -20 ~/$dir/orchestrate.log 2>/dev/null"; [ $state = DONE ]; exit $? ;;
    esac
  else
    misses=$((misses+1)); [ $misses -ge 15 ] && { echo "$(date -Is) $dir: 5090 unreachable 15 times in a row"; exit 2; }
  fi
  sleep $every
done
