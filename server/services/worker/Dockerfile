FROM node:20-alpine

RUN apk add --no-cache docker-cli

WORKDIR /app

COPY worker/package*.json ./
RUN npm install --omit=dev

COPY worker/src ./src
COPY shared ./shared

CMD ["npm", "run", "start"]
