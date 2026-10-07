FROM node:24

WORKDIR /app
COPY . .

WORKDIR /app/frontend
RUN npm install
RUN npm run build

EXPOSE 3000

CMD ["npx", "serve", "-s", "build", "-l", "3000"]