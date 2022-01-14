#!/bin/bash
set -eo pipefail

if [ "$1" = 'comms' ]; then
    node --max-old-space-size=8192 comms/lighthouse/server.js
elif [ "$1" == 'content' ]; then
    node --max-old-space-size=8192 content/entrypoints/run-server.js
elif [ "$1" == 'lambdas' ]; then
    node --max-old-space-size=8192 lambdas/entrypoints/run-server.js
fi
