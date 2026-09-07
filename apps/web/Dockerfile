FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --ignore-scripts
COPY . .

FROM node:22-alpine AS runner
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app .
EXPOSE 3000
CMD ["npm", "run", "dev"]