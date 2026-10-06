FROM node:24

WORKDIR /app

COPY . .

WORKDIR /app/frontend

RUN npm install --legacy-peer-deps

RUN npm run build

WORKDIR /app

EXPOSE 3000

CMD ["npx", "serve", "-s", "frontend/build", "-l", "3000"]