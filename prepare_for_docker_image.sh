rm -rf tmpbin

set -e

yarn install

yarn bazel clean
yarn bazel build //comms/lighthouse:server && \
  yarn bazel build //content:server && \
  yarn bazel build //lambdas:server

cp -L -R dist/bin/ tmpbin

commit_hash=`git rev-parse HEAD`

sed -i "s/COMMIT_HASH=.*/COMMIT_HASH=$commit_hash/g" Dockerfile
