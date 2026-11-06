# Веб-версия ПОшки: сборка Vite и раздача готовых файлов через nginx.
#
# Сервер страницы стикера отсюда больше не собирается — он живёт в
# отдельном репозитории MAX-Mascot-web. Локально его по-прежнему
# запускает `npm run sticker`.

FROM node:22-alpine AS build
WORKDIR /app

# Сначала зависимости: этот слой пересобирается, только когда меняется lock.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# Ключи VITE_* Vite встраивает в сборку, поэтому нужны они именно здесь.
# В Dokploy — поле Build-time Arguments, не Environment. Объявлены только
# обязательные: необязательные настройки (модель, разрешение…) берутся из
# значений по умолчанию в коде.
ARG VITE_KIE_API_KEY
ARG VITE_STATS_API_KEY
ARG VITE_STICKER_RELAY
ARG VITE_STICKER_TOKEN
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web /usr/share/nginx/html
EXPOSE 80

# По этой проверке Dokploy (Docker Swarm) понимает, что новая версия
# поднялась, и только тогда гасит старую. wget есть в образе alpine.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ > /dev/null || exit 1
