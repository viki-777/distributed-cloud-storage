FROM golang:1.25-alpine AS builder
WORKDIR /app

# Copy proto module first
COPY proto/go.mod proto/go.sum* ./proto/
COPY proto/ ./proto/

# Copy coordinator module
COPY coordinator/go.mod coordinator/go.sum* ./coordinator/
WORKDIR /app/coordinator
RUN go mod download
COPY coordinator/ .
RUN go mod tidy
RUN CGO_ENABLED=0 go build -o coordinator ./cmd/main.go

FROM alpine:3.19
RUN apk --no-cache add ca-certificates
WORKDIR /app
COPY --from=builder /app/coordinator/coordinator .
EXPOSE 8080
CMD ["./coordinator"]
