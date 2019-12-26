#!/bin/bash
set -eo pipefail

if [ "$1" = 'comms' ]; then
    yarn bazel run //comms/lighthouse:server
elif [ "$1" == 'content' ]; then
    yarn bazel run content:server
elif [ "$1" == 'lambdas' ]; then
    yarn bazel run lambdas:server
fi