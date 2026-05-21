FROM golang:1.22-alpine AS builder
WORKDIR /app

# Copy proto module first
COPY proto/go.mod proto/go.sum* ./proto/
COPY proto/ ./proto/

# Copy storagenode module
COPY storagenode/go.mod storagenode/go.sum* ./storagenode/
WORKDIR /app/storagenode
RUN go mod download
COPY storagenode/ .
RUN CGO_ENABLED=0 go build -o storagenode ./cmd/main.go

FROM alpine:3.19
RUN apk --no-cache add ca-certificates
WORKDIR /app
COPY --from=builder /app/storagenode/storagenode .
EXPOSE 50051
CMD ["./storagenode"]
