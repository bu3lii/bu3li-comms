.PHONY: dev build test

dev:
	./dev.sh

build:
	go build ./...
	cd frontend && npm run build

test:
	go build ./... && go vet ./...
	cd frontend && npm test
