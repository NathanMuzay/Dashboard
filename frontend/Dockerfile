FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package.json
RUN npm ci
COPY frontend/ frontend/
COPY bonus/ bonus/
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_SPOTIFY_CLIENT_ID
RUN npm run build -w frontend

FROM nginx:stable-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
