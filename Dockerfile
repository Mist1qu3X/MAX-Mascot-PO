# Сервер страницы стикера. Собирается только он — панель остаётся локальной.
#
# Зависимостей нет вообще: server/index.mjs написан на встроенных модулях
# Node, поэтому ни npm install, ни node_modules в образе не нужны.
FROM node:22-alpine

WORKDIR /app

# Только то, что сервер реально читает: сам себя и страницу, которую раздаёт.
COPY server/ ./server/
COPY sticker/ ./sticker/

# Внутри контейнера порт фиксирован; наружу его отображает Dokploy.
ENV PORT=8787
EXPOSE 8787

# Не от root: контейнеру достаточно прав на чтение своих же файлов.
USER node

CMD ["node", "server/index.mjs"]
