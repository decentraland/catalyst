FROM node:24-alpine@sha256:6a1c190e17215d844926b0677f4bf87273ff7d5e54db06d3b5b5863ab0b09a3d as base
WORKDIR /app
RUN apk add --no-cache git

COPY package.json .
COPY yarn.lock .
COPY blocks-cache-*.csv ./

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

# Emit the runtime under /app/content so the entrypoint stays at
# /app/content/entrypoints/run-server.js, matching the peer deployment's start
# command. blocks-cache CSVs live at /app and are read relative to cwd (/app).
COPY --from=catalyst-builder /app/dist/src content/
COPY --from=catalyst-builder /app/blocks-cache-*.csv /app/

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
