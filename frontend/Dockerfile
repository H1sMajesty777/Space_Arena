FROM node:22-alpine AS build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
COPY backend/club-settings.json /app/backend/
RUN npm run build
WORKDIR /app
COPY scripts/sync-kitchen-hours.mjs ./scripts/
COPY site/index.html site/standalone.html ./site/
RUN node scripts/sync-kitchen-hours.mjs

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/site/ /usr/share/nginx/html/
COPY site/assets/ /usr/share/nginx/html/assets/
COPY site/css/style.css site/css/mobile.css /usr/share/nginx/html/css/
COPY site/js/config.js site/js/data.js site/js/main.js /usr/share/nginx/html/js/
COPY --from=build /app/frontend/dist/ /usr/share/nginx/html/
