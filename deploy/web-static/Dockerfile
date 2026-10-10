# The Sidevoice web interface as a static site, for people who cannot install the desktop app.
# It holds no secret: a device pairs with a node using the code the node issues.
#
#   docker build -f deploy/web-static/Dockerfile -t sidevoice-web .
#   docker run -p 8080:8080 -e SIDEVOICE_TARGET=https://rendezvous.example sidevoice-web
#
# SIDEVOICE_TARGET (optional) is where the interface looks first: a rendezvous room or a node. Without it, the
# pairing code says where the machine is. Serve it over https (the microphone needs a secure context).
#
# The site is the same on every architecture, so it is built once, on the builder's own platform; the image of each
# platform only copies it beside that platform's nginx, and runs nothing, so a multi-platform build needs no emulator.
FROM --platform=$BUILDPLATFORM node:22-bookworm AS build
WORKDIR /src
COPY . .
RUN npm ci && npm run build -w @sidevoice/protocol \
    && npm run build -w @sidevoice/web && node scripts/assemble-static-web.mjs /site

FROM nginx:1.29-alpine
LABEL org.opencontainers.image.source="https://github.com/sidevoice/sidevoice-web" \
      org.opencontainers.image.description="The Sidevoice web interface, a static site served by nginx on port 8080" \
      org.opencontainers.image.licenses="Apache-2.0"
COPY --from=build /site /usr/share/nginx/html
COPY deploy/web-static/nginx.conf /etc/nginx/conf.d/default.conf
COPY --chmod=755 deploy/web-static/40-sidevoice-target.sh /docker-entrypoint.d/40-sidevoice-target.sh
EXPOSE 8080
