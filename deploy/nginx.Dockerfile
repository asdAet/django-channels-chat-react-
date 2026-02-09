FROM node:20-alpine AS build

WORKDIR /app

COPY frontend/package*.json ./frontend/
RUN npm ci --prefix frontend

COPY frontend ./frontend
RUN npm run build --prefix frontend

FROM nginx:1.25-alpine

COPY deploy/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html

EXPOSE 80 443
