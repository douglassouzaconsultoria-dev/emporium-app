FROM node:18

WORKDIR /app
COPY . .

WORKDIR /app/frontend
RUN npm install --legacy-peer-deps --force
RUN chmod +x node_modules/.bin/*
RUN npm run build

EXPOSE 3000
CMD ["npx", "serve", "-s", "build", "-l", "3000"]