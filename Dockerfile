FROM node:18

WORKDIR /app
COPY . .

WORKDIR /app/frontend
RUN npm install --legacy-peer-deps --force
RUN npx react-scripts build

EXPOSE 3000
CMD ["npx", "serve", "-s", "build", "-l", "3000"]