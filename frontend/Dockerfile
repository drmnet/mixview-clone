# Location: mixview/frontend/Dockerfile
# Description: Docker configuration for the React frontend application

FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Expose port
EXPOSE 3000

# For development, use vite dev server
CMD ["npm", "run", "dev"]