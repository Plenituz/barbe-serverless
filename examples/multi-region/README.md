# Multi region API example

This example shows a few things:
- How to use the `for_each` construct to create resources in multiple regions
- How to use the `aws_dynamodb`'s `regions` fields to create a DynamoDB replicas in multiple regions
- Using regular terraform resources as part of a template
- Using `aws_function` to listen to streams from DynamoDB using `event_dynamodb_stream`
- Using `aws_fargate_task` to start a long-running task in Fargate

This projects uses `aws_fargate_task` which currently requires you having both the AWS CLI and docker CLI installed.
You'll also need Terraform and Barbe as any other Barbe-serverless project.

## The flow

This projects defines 3 API, one for each region ("us-west-1", "eu-west-3", "ap-northeast-2") under the url `https://global-${region}.${BASE_DOMAIN}`.
You can do a GET request on any path of each API, this will trigger a Fargate task and store an item in a DynamoDB table. 
There is also a Lambda function listening to the DynamoDB stream just logging out the events.

## Usage

Build and deploy the project
```bash
make deploy
```

Just generate the Terraform templates
```bash
make generate
# or
barbe generate config.hcl --output dist
```