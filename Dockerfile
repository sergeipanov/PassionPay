# Use Node.js 18 LTS
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including dev dependencies for build)
RUN npm ci

# Copy application code
COPY . .

# Build the application (now tailwindcss is available)
RUN npm run build

# Remove dev dependencies after build to keep image small
RUN npm prune --omit=dev

# Expose port (Cloud Run uses PORT env var)
EXPOSE 8080

# Start the application
CMD ["npm", "start"]