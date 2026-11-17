FROM node:20-slim
WORKDIR /app

# Dependencias (solo las de produccion; esbuild esta en "dependencies" para poder compilar)
COPY package.json package-lock.json ./
RUN npm install --omit=dev --no-audit --no-fund --loglevel=http

# Codigo + compilacion del cliente
COPY . .
RUN npm run build

ENV NODE_ENV=production
CMD ["node", "server.js"]
