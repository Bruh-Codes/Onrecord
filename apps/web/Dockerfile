# Dev-only image (docker-compose.yml, repo root)-bind-mounts source for
# live reload, so this never runs `bun run build`. A production image (Next
# standalone output) is a separate concern once there's somewhere to deploy it.
FROM oven/bun:1.3-slim

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

EXPOSE 3000

CMD ["sh", "-c", "bunx auth migrate -y && bunx next dev -H 0.0.0.0"]
