.PHONY: build clean deploy

build:
	env GOOS=linux go build -ldflags="-s -w" -o dist/bin/put_file src/put_file.go

clean:
	rm -rf ./bin

deploy: clean build
	aws cloudformation deploy --stack-name "tf-heart-cf" --template-file tf-heart-cf.cloudformation.json
	sudo barbe apply config.hcl *.tf --output dist --log-level debug
