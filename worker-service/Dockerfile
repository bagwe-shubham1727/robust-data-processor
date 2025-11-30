FROM node:18-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "src/index.js"]
