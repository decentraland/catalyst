rm -rf tmpbin

yarn install
yarn bazel clean

yarn bazel build //comms/lighthouse:server && \
  yarn bazel build //content:server && \
  yarn bazel build //lambdas:server

cp -L -R dist/bin/ tmpbin
