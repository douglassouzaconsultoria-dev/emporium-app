FROM node:24

WORKDIR /app

COPY . .

WORKDIR /app/frontend

RUN npm install --legacy-peer-deps && npm run build

EXPOSE 3000

CMD ["npx", "serve", "-s", "/app/frontend/build", "-l", "3000"]