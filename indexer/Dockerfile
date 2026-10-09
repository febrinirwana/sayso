FROM oven/bun:1.3.14 AS bun
FROM node:24.21.0-bookworm-slim
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json ./
RUN bun install
COPY config.yaml schema.graphql tsconfig.json ./
COPY abi ./abi
COPY src ./src
COPY scripts/runtime.ts ./scripts/runtime.ts
RUN bun run codegen && chown -R node:node /app
USER node
ENV NODE_ENV=production ENVIO_TUI=false
CMD ["bun", "run", "start:local"]
