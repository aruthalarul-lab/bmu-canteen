# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# Stage 2: Production Server
FROM node:20-alpine
WORKDIR /app

# Install build tools and timezone data needed for native SQLite on Alpine
RUN apk add --no-cache python3 make g++ tzdata

# Install backend dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy server code
COPY server/ ./server/
COPY --from=frontend-builder /app/client/dist ./client/dist

ENV NODE_ENV=production
ENV TZ=Asia/Kolkata
ENV PORT=5000
EXPOSE 5000

CMD ["node", "server/server.js"]
