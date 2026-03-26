FROM golang:1.21-alpine AS builder

WORKDIR /app

COPY go.mod ./
COPY *.go ./
COPY sources/ ./sources/

RUN go build -o recipe-calc .

RUN ./recipe-calc build

FROM alpine:3.19

WORKDIR /app

COPY --from=builder /app/recipe-calc .
COPY --from=builder /app/sources/ ./sources/
COPY --from=builder /app/docs/ ./docs/

EXPOSE 8080

CMD ["./recipe-calc", "serve"]
