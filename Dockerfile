FROM node:20

WORKDIR /app
COPY . .

WORKDIR /app/frontend
RUN npm ci --legacy-peer-deps
RUN npm run build

EXPOSE 3000
CMD ["npx", "serve", "-s", "build", "-l", "3000"]