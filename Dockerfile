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


# https://docs.docker.com/engine/reference/builder/#arg
ARG CATALYST_VERSION=0.0.0
ENV CATALYST_VERSION=${CATALYST_VERSION:-0.0.0}

# https://docs.docker.com/engine/reference/builder/#arg
ARG COMMIT_HASH=local
ENV COMMIT_HASH=${COMMIT_HASH:-local}

EXPOSE 6969
EXPOSE 7070
EXPOSE 9000

ENTRYPOINT [ "./entrypoint.sh" ]
