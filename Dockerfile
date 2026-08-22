FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html tsconfig.json tsconfig.server.json vite.config.ts ./
COPY src ./src
COPY server ./server

ARG VITE_AVATAR_BASE_URL
ARG VITE_AVATAR_KEYS
ARG VITE_PUBLIC_APP_URL
ARG VITE_GAME_AUDIO_PACK_URL
ENV VITE_AVATAR_BASE_URL=$VITE_AVATAR_BASE_URL
ENV VITE_AVATAR_KEYS=$VITE_AVATAR_KEYS
ENV VITE_PUBLIC_APP_URL=$VITE_PUBLIC_APP_URL
ENV VITE_GAME_AUDIO_PACK_URL=$VITE_GAME_AUDIO_PACK_URL

RUN npm run build

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
ENV PORT=8080

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/server-dist ./server-dist

USER node

EXPOSE 8080

CMD ["npm", "start"]
