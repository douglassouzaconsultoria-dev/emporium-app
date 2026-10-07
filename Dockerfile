FROM node:24

WORKDIR /app
COPY . .

# Build frontend
WORKDIR /app/frontend
RUN npm install --legacy-peer-deps
RUN chmod -R +x node_modules/.bin/
RUN npm run build
RUN ls -la build/  # Debug: confirmar que build/ existe

# Serve
EXPOSE 3000
CMD ["npx", "serve", "-s", "build", "-l", "3000"]