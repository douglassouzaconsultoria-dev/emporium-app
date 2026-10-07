FROM node:24 AS builder

WORKDIR /app
COPY . .

WORKDIR /app/frontend
RUN npm install --legacy-peer-deps
RUN npm run build

FROM node:24
WORKDIR /app
RUN npm install -g serve
COPY --from=builder /app/frontend/build /app/build

EXPOSE 3000
CMD ["serve", "-s", "/app/build", "-l", "3000"]