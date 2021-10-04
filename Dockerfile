FROM node:14-alpine as base
WORKDIR /app
RUN apk add --no-cache bash

# get production dependencies
FROM base as dependencies
COPY . .
RUN yarn install --prod

# build sources
FROM base as catalyst-builder
COPY . .
RUN yarn install

RUN yarn workspace @catalyst/contracts build
RUN yarn workspace @catalyst/commons build

# build comms
FROM catalyst-builder as comms-builder
RUN yarn workspace @catalyst/lighthouse-server build

# build content
FROM catalyst-builder as content-builder
RUN yarn workspace @catalyst/content-server build

# build lambdas
FROM catalyst-builder as lambdas-builder
RUN yarn workspace @catalyst/lambdas-server build

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

COPY --from=catalyst-builder /app/package.json .
COPY --from=catalyst-builder /app/comms/lighthouse/package.json comms/lighthouse/
COPY --from=catalyst-builder /app/content/package.json content/
COPY --from=catalyst-builder /app/lambdas/package.json lambdas/

COPY --from=catalyst-builder /app/contracts/dist contracts/
COPY --from=catalyst-builder /app/commons/dist commons/
COPY --from=comms-builder /app/comms/lighthouse/dist/src comms/lighthouse/
COPY --from=content-builder /app/content/dist/src content/
COPY --from=lambdas-builder /app/lambdas/dist/src lambdas/

ENV COMMIT_HASH=bc34832282cfa746cfb1f27184cf3b53f321a164
ENV CATALYST_VERSION=2.3.3

EXPOSE 6969
EXPOSE 7070
EXPOSE 9000

ENTRYPOINT [ "./entrypoint.sh" ]
