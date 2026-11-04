# Giai đoạn 1: Build source code bằng Node.js
FROM node:20-alpine AS builder
WORKDIR /app

# Copy dependency definition
COPY package*.json ./
RUN npm ci

# Copy source code và build
COPY . .
RUN npm run build

# Giai đoạn 2: Phục vụ tĩnh bằng Nginx Alpine siêu nhẹ
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

