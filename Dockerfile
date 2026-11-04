# Stage 1: Build
FROM node:22-alpine AS build
WORKDIR /usr/local/app
COPY package.json package-lock.json ./
RUN npm install --legacy-peer-deps
COPY ./ ./
RUN npm run build

# Stage 2: Serve
FROM nginx:alpine
WORKDIR /usr/share/nginx/html
COPY --from=build /usr/local/app/dist .
# Add nginx config for SPA routing
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
# docker buildx build --platform linux/amd64 -t asia-south1-docker.pkg.dev/s-0-000236-99/moa-bharatvistaar-repo/oan-ui-dev:latest --push .
