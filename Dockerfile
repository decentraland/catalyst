FROM node:10.16.3-slim

WORKDIR /app

ADD tmpbin .
COPY entrypoint.sh .

EXPOSE 6969
EXPOSE 7070
EXPOSE 9000

ENTRYPOINT [ "./entrypoint.sh" ]