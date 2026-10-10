#!/bin/sh
cd "$(dirname "$0")/.."
node runtime/await-game.mjs || exit 1
exec node --env-file-if-exists=.env.local src/loop.mjs --minutes=45 --max=250
