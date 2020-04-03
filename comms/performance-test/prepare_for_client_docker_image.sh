rm -rf tmpbin

set -e

yarn install

yarn bazel clean
yarn bazel build '//comms/performance-test/client:devserver' && \
  yarn bazel build '//comms/performance-test:run-clients' && \

cp -L -R ../../dist/bin tmpbin