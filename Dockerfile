FROM node:24

WORKDIR /app

COPY . .

# Install and build frontend
WORKDIR /app/frontend
RUN npm install --legacy-peer-deps
RUN npm run build

# Start from fresh image for production
FROM node:24
WORKDIR /app
COPY --from=0 /app/frontend/build /app/frontend/build
RUN npm install -g serve

EXPOSE 3000

CMD ["serve", "-s", "/app/frontend/build", "-l", "3000"]