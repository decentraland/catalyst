#!/bin/bash
set -eo pipefail

cd bin

if [ "$1" = 'comms' ]; then
    cd comms/lighthouse
elif [ "$1" == 'content' ]; then
    cd content
elif [ "$1" == 'lambdas' ]; then
    cd lambdas
fi

RUNFILES_DIR=server.sh.runfiles ./server.sh
 