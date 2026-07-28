FROM node:22-alpine

# iputils provides ping for ICMP monitors
RUN apk add --no-cache iputils

WORKDIR /app
COPY package.json server.js ./
COPY lib ./lib
COPY public ./public

ENV PORT=3300 \
    PULSEWATCH_DATA=/app/data/pulsewatch.json
VOLUME /app/data
EXPOSE 3300

CMD ["node", "server.js"]
