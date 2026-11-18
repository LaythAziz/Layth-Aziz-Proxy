FROM ubuntu:24.04 AS builder
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git make gcc libc6-dev libssl-dev zlib1g-dev && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 https://github.com/TelegramMessenger/MTProxy.git /src/MTProxy && make -C /src/MTProxy

FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl libssl3 zlib1g && rm -rf /var/lib/apt/lists/* && useradd --system --no-create-home --shell /usr/sbin/nologin mtproxy
COPY --from=builder /src/MTProxy/objs/bin/mtproto-proxy /usr/local/bin/mtproto-proxy
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 0755 /usr/local/bin/docker-entrypoint.sh /usr/local/bin/mtproto-proxy && mkdir -p /var/lib/mtproxy && chown mtproxy:mtproxy /var/lib/mtproxy
EXPOSE 8443/tcp
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
