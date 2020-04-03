#!/bin/bash
set -eo pipefail

cd comms/performance-test/client
RUNFILES_DIR=devserver.runfiles ./devserver &

sleep 5

cd ..

CLIENT_URL=http://localhost:7654 RUNFILES_DIR=run-clients.sh.runfiles ./run-clients.sh
 