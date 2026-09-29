FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY web/package*.json ./web/
RUN npm --prefix web ci
COPY web ./web
RUN npm --prefix web run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8000
WORKDIR /app/web
COPY --from=build /app/web/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/web/server ./server
COPY --from=build /app/web/data ./data
# Server validators share pure TypeScript modules with the client.
COPY --from=build /app/web/src ./src
COPY --from=build /app/web/dist ./dist
COPY --from=build /app/web/scripts ./scripts
RUN mkdir -p .local && chown node:node .local
USER node
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:8000/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.mjs"]
