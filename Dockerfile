FROM node:lts-slim

WORKDIR /app

COPY . .

RUN apt-get update && \
    apt-get upgrade -yq && \
    apt-get install -yq yarn git && \
    yarn install

EXPOSE 9000
EXPOSE 6969

ENTRYPOINT [ "./entrypoint.sh" ]