FROM node:24-alpine as base
WORKDIR /app
RUN apk add --no-cache git

COPY package.json .
COPY yarn.lock .
COPY content/blocks-cache-*.csv content/
COPY content/package.json content/
COPY lambdas/package.json lambdas/

# get production dependencies
FROM base as dependencies
RUN yarn install --prod --frozen-lockfile

# build sources
FROM base as catalyst-builder
RUN yarn install --frozen-lockfile
COPY . .
RUN yarn build

# build final image with transpiled code and runtime dependencies
FROM base
RUN apk update && apk upgrade

COPY --from=dependencies /app/node_modules ./node_modules/
COPY --from=dependencies /app/content/node_modules ./node_modules/

COPY --from=catalyst-builder /app/content/dist/src content/
COPY --from=catalyst-builder /app/content/blocks-cache-*.csv /app/
COPY --from=catalyst-builder /app/lambdas/dist/src lambdas/

# https://docs.docker.com/engine/reference/builder/#arg
ARG CURRENT_VERSION=4.0.0-ci
ENV CURRENT_VERSION=${CURRENT_VERSION:-4.0.0}

# https://docs.docker.com/engine/reference/builder/#arg
ARG COMMIT_HASH=local
ENV COMMIT_HASH=${COMMIT_HASH:-local}

EXPOSE 6969

# Please _DO NOT_ use a custom ENTRYPOINT because it may prevent signals
# (i.e. SIGTERM) to reach the service
# Read more here: https://aws.amazon.com/blogs/containers/graceful-shutdowns-with-ecs/
#            and: https://www.ctl.io/developers/blog/post/gracefully-stopping-docker-containers/

# We use Tini to handle signals and PID1 (https://github.com/krallin/tini, read why here https://github.com/krallin/tini/issues/8)
RUN apk add --no-cache tini

ENTRYPOINT ["/sbin/tini", "--"]

# Run the program under Tini
CMD [ "/usr/local/bin/node", "--max-old-space-size=8192", "content/entrypoints/run-server.js" ]
