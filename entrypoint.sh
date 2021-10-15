#!/bin/bash
set -eo pipefail

if [ "$1" = 'comms' ]; then
    node comms/lighthouse/src/server.js
elif [ "$1" == 'content' ]; then
    node content/src/entrypoints/run-server.js
elif [ "$1" == 'lambdas' ]; then
    node lambdas/src/entrypoints/run-server.js
fi
