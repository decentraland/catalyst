FROM node:lts-slim

WORKDIR /app

COPY . .

RUN apt-get update && \
    apt-get upgrade -yq && \
    apt-get install -yq yarn git zlib1g zlib1g-dev && \
    yarn install && \
    yarn bazel build //comms/lighthouse:server && \
    yarn bazel build content:server

EXPOSE 6969
EXPOSE 7070
EXPOSE 9000

ENTRYPOINT [ "./entrypoint.sh" ]
