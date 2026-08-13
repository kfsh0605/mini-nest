FROM node:22-slim

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

USER node

CMD ["npm", "test"]
