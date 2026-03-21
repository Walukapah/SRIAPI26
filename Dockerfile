# Dockerfile - Optimized for Koyeb
FROM node:20-alpine

WORKDIR /app

# Install curl for healthcheck (must be before COPY for layer caching)
RUN apk add --no-cache curl

# Copy package files first (better layer caching)
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy app files
COPY . .

# Expose port
EXPOSE 3000

# Health check - Koyeb optimized
# Note: Koyeb uses its own health checks, but this helps Docker layer
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start server
CMD ["node", "server.js"]
