FROM node:24-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS build
WORKDIR /workspace
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html tsconfig*.json vite.config.ts ./
COPY public ./public
COPY src ./src
ENV VITE_API_BASE_URL=/api
RUN npm run build

FROM nginxinc/nginx-unprivileged:stable-alpine@sha256:15c994d10d6d78658721c3bcafff14cb281fba2a4bdf9d5ba92c416a472516e3
ARG SOURCE_REVISION
LABEL org.opencontainers.image.source="https://github.com/CAUCapstoneDesignPipeline/capstone_code_FE" \
      org.opencontainers.image.revision=$SOURCE_REVISION \
      art.capsnote.release-protocol="4"
COPY --from=build /workspace/dist /usr/share/nginx/app
COPY deploy/nginx.conf /etc/nginx/nginx.conf
COPY deploy/ready.html /usr/share/nginx/ready/index.html
COPY --chmod=0755 deploy/start.sh /start.sh
USER 101:101
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
ENTRYPOINT ["/start.sh"]
