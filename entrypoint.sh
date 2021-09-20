#!/bin/bash
set -eo pipefail

if [ "$1" = 'comms' ]; then
    node comms/lighthouse/server.js
elif [ "$1" == 'content' ]; then
    node --inspect content/entrypoints/run-server.js
elif [ "$1" == 'lambdas' ]; then
    node lambdas/entrypoints/run-server.js
fi
