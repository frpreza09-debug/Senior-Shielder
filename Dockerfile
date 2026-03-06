FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy source
COPY . .

# Create public folder for dashboard
RUN mkdir -p public

# Expose ports
EXPOSE 3000
EXPOSE 3001

ENV NODE_ENV=production

CMD ["node", "server.js"]
