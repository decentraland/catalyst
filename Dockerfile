FROM node:14.16.1-slim

RUN apt-get update && \
  apt-get upgrade -yq && \
  apt-get install -yq yarn git zlib1g zlib1g-dev

WORKDIR /app

COPY entrypoint.sh .

WORKDIR /app/build

COPY . .

# The following are all collapsed to reduce image size
RUN yarn install &&\
  yarn bazel clean &&\
  yarn bazel build //comms/lighthouse:server &&\
  yarn bazel build //content:server &&\
  yarn bazel build //lambdas:server &&\
  cp -L -R dist/bin/ ../bin &&\
  yarn bazel clean --expunge && yarn cache clean &&\
  cd .. &&\
  rm -rf build &&\
  rm -rf /root/.cache/bazel

WORKDIR /app

ENV COMMIT_HASH=bc34832282cfa746cfb1f27184cf3b53f321a164
ENV CATALYST_VERSION=1.2.0

EXPOSE 6969
EXPOSE 7070
EXPOSE 9000

ENTRYPOINT [ "./entrypoint.sh" ]
