.PHONY: build clean deploy

build:
	env GOOS=linux go build -ldflags="-s -w" -o bin/http_lambda main/http_lambda.go
	env GOOS=linux go build -ldflags="-s -w" -o bin/ddb_lambda main/ddb_lambda.go
	env GOOS=linux go build -ldflags="-s -w" -o bin/fargate main/fargate.go

generate:
	barbe generate config.hcl --output dist

clean:
	rm -rf ./bin

deploy: clean build generate
	cd dist && terraform init && terraform apply -auto-approve
