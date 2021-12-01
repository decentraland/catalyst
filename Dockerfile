FROM node:14-alpine as base
WORKDIR /app
RUN apk add --no-cache bash

COPY package.json .
COPY yarn.lock .
COPY comms/lighthouse/package.json comms/lighthouse/
COPY commons/package.json commons/
COPY contracts/package.json contracts/
COPY content/package.json content/
COPY lambdas/package.json lambdas/

# get production dependencies
FROM base as dependencies
RUN yarn install --prod --frozen-lockfile

# build sources
FROM base as catalyst-builder
RUN yarn install --frozen-lockfile

COPY . .
FROM catalyst-builder as comms-builder
RUN yarn workspace @catalyst/lighthouse-server build
FROM catalyst-builder as content-builder
RUN yarn workspace @catalyst/content-server build
FROM catalyst-builder as lambdas-builder
RUN yarn workspace @catalyst/lambdas-server build

# build final image with transpiled code and runtime dependencies
FROM base

COPY entrypoint.sh .
COPY --from=dependencies /app/node_modules ./node_modules/
COPY --from=dependencies /app/commons/node_modules ./node_modules/
COPY --from=dependencies /app/contracts/node_modules ./node_modules/
COPY --from=dependencies /app/comms/lighthouse/node_modules ./node_modules/
COPY --from=dependencies /app/content/node_modules ./node_modules/
# uncomment this if lambdas eventually get some dependencies there
# COPY --from=dependencies /app/lambdas/node_modules ./node_modules/

COPY --from=content-builder /app/contracts/dist contracts/
COPY --from=content-builder /app/commons/dist commons/
COPY --from=content-builder /app/content/dist/src content/
COPY --from=comms-builder /app/comms/lighthouse/dist/src comms/lighthouse/
COPY --from=lambdas-builder /app/lambdas/dist/src lambdas/

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
