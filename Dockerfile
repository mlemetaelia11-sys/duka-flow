FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

COPY backend ./backend
COPY frontend ./frontend

EXPOSE 3000
CMD ["sh", "-c", "node backend/scripts/migrate.js && node backend/server.js"]
