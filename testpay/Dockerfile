FROM node:22-alpine
WORKDIR /app
COPY server.mjs package.json ./
USER node
EXPOSE 4000
CMD ["node", "server.mjs"]
