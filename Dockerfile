FROM node:14-alpine as base
WORKDIR /app
RUN apk add --no-cache bash

# get production dependencies
FROM base as dependencies
COPY . .
RUN yarn install --prod

# build sources
FROM base as katalyst-builder
COPY . .
RUN yarn install

RUN yarn workspace @katalyst/contracts build
RUN yarn workspace @katalyst/commons build

# build comms
FROM katalyst-builder as comms-builder
RUN yarn workspace @katalyst/lighthouse-server build

# build content
FROM katalyst-builder as content-builder
RUN yarn workspace @katalyst/content-server build

# build lambdas
FROM katalyst-builder as lambdas-builder
RUN yarn workspace @katalyst/lambdas-server build

# build final image with transpiled code and runtime dependencies
FROM base

COPY --from=dependencies /app/entrypoint.sh .
COPY --from=dependencies /app/node_modules ./node_modules/
COPY --from=dependencies /app/commons/node_modules ./node_modules/
COPY --from=dependencies /app/contracts/node_modules ./node_modules/
COPY --from=dependencies /app/comms/lighthouse/node_modules ./node_modules/
COPY --from=dependencies /app/content/node_modules ./node_modules/
# uncomment this if lambdas eventually get some dependencies there
# COPY --from=dependencies /app/lambdas/node_modules ./node_modules/

COPY --from=katalyst-builder /app/package.json .
COPY --from=katalyst-builder /app/comms/lighthouse/package.json comms/lighthouse/
COPY --from=katalyst-builder /app/content/package.json content/
COPY --from=katalyst-builder /app/lambdas/package.json lambdas/

COPY --from=katalyst-builder /app/contracts/dist contracts/
COPY --from=katalyst-builder /app/commons/dist commons/
COPY --from=comms-builder /app/comms/lighthouse/dist/src comms/lighthouse/
COPY --from=content-builder /app/content/dist/src content/
COPY --from=lambdas-builder /app/lambdas/dist/src lambdas/

ENV COMMIT_HASH=bc34832282cfa746cfb1f27184cf3b53f321a164
ENV CATALYST_VERSION=2.1.0

EXPOSE 6969
EXPOSE 7070
EXPOSE 9000

ENTRYPOINT [ "./entrypoint.sh" ]
