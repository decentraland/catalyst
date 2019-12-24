FROM node:lts
WORKDIR /app
COPY . .
RUN apt-get update && \
    apt-get -yq install yarn git && \
    yarn install
EXPOSE 9000
ENTRYPOINT [ "yarn", "bazel", "run", "//comms/lighthouse:server" ]
