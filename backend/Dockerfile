FROM rust:1.98-bookworm AS build
WORKDIR /app
COPY backend/ backend/
COPY bonus/ bonus/
RUN cargo build --locked --release --manifest-path backend/Cargo.toml

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/backend/target/release/lumi-backend /usr/local/bin/lumi-backend
USER 65534:65534
EXPOSE 3001
CMD ["lumi-backend"]
