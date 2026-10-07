# Includes LibreOffice so PDF export works out of the box.
FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-core libreoffice-impress fonts-dejavu fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server.js ./
COPY public ./public
COPY scripts ./scripts
ENV HOST=0.0.0.0 PORT=3200 NODE_ENV=production
EXPOSE 3200
CMD ["node","server.js"]
