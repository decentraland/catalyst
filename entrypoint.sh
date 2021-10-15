#!/bin/bash
set -eo pipefail

if [ "$1" = 'comms' ]; then
    node --max-old-space-size=8192  comms/lighthouse/src/server.js
elif [ "$1" == 'content' ]; then
    node --max-old-space-size=8192  content/src/entrypoints/run-server.js
elif [ "$1" == 'lambdas' ]; then
    node --max-old-space-size=8192  lambdas/src/entrypoints/run-server.js
fi
