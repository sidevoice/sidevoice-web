# The Sidevoice web interface as a static site, for people who cannot install the desktop app.
# It holds no secret: a device pairs with a node using the code the node issues.
#
#   docker build -f deploy/web-static/Dockerfile -t sidevoice-web .
#   docker run -p 8080:8080 -e SIDEVOICE_TARGET=https://rendezvous.example sidevoice-web
#
# SIDEVOICE_TARGET (optional) is where the interface looks first: a rendezvous room or a node. Without it, the
# pairing code says where the machine is. Serve it over https (the microphone needs a secure context).
FROM node:22-bookworm AS build
WORKDIR /src
COPY . .
RUN npm ci && npm run build -w @sidevoice/protocol \
    && npm run build -w @sidevoice/web && node scripts/assemble-static-web.mjs /site

FROM nginx:1.29-alpine
COPY --from=build /site /usr/share/nginx/html
COPY deploy/web-static/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/web-static/40-sidevoice-target.sh /docker-entrypoint.d/40-sidevoice-target.sh
RUN chmod +x /docker-entrypoint.d/40-sidevoice-target.sh
EXPOSE 8080
