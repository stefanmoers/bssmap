FROM node:24-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production \
    BSSMAP_HOST=0.0.0.0 \
    BSSMAP_PORT=8080 \
    BSSMAP_DATA_DIR=/data

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .
RUN mkdir -p /data && chown -R node:node /data

USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["node", "server/cli.mjs"]

