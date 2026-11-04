# Stage 1: Build
FROM node:26-alpine AS build
WORKDIR /usr/local/app
COPY package.json ./
RUN rm -f package-lock.json && npm install --legacy-peer-deps --include=optional --force
COPY ./ ./
RUN npm run build

# Stage 2: Serve
FROM nginx:alpine
WORKDIR /usr/share/nginx/html
COPY --from=build /usr/local/app/dist .
# Add nginx config for SPA routing
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Runtime env injection (VITE_API_URL -> env-config.js), chained by the nginx image entrypoint
COPY docker-entrypoint.d/40-env-config.sh /docker-entrypoint.d/40-env-config.sh
RUN chmod +x /docker-entrypoint.d/40-env-config.sh
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
# docker buildx build --platform linux/amd64 -t asia-south1-docker.pkg.dev/s-0-000236-99/moa-bharatvistaar-repo/oan-ui-dev:latest --push .
