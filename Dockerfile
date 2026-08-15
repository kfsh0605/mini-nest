FROM node:22-slim

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN chown -R node:node /app

USER node

CMD ["npm", "test"]
