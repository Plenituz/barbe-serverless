# Barbe-serverless

Barbe-serverless is a serverless application development solution, that's even simpler to use than clicking around the AWS console. 
Define DynamoDB tables, lambda functions, APIs and more, all batteries included.

Barbe-serverless sits on the shoulder of giants, inheriting all the superpowers they come with, including:
- Fast, flexible, multi-cloud deployment from [Terraform](https://github.com/hashicorp/terraform) (frankly, I'm just tired of dealing with my grumpy ex-wife Cloudformation)
- Easy config management, extensibility, and integration with existing tools/frameworks with [Barbe](https://github.com/Plenituz/barbe)
- More to come soon with the integration of [Dagger](https://github.com/dagger/dagger) making your project so easy to build/deploy from anywhere you'll think it's a joke (it's not)

> Barbe-serverless is in pretty early stage, be on the lookout for breaking changes and new exciting features, come have fun with it!

Here is a few problems Barbe-serverless solves for you:
- Multi region is built in, change a string, change the region
```hcl
aws_function "save-user" {
  region = "eu-west-3"
}

//DynamoDB replicas managed automatically
aws_dynamodb "user-store" {
  regions = ["eu-west-3", "us-east-1", "ap-northeast-1"]
}

//or if you want multi-region for the same resource
for_each "regions" {
  aws_function "get-user-$${each.key}" {
    region = each.key
  }
}
```
- Always forget about updating your IAM roles? No worries spaghettis, we'll take care of it
```hcl
aws_dynamodb "user-store" {
  //...
}
aws_s3 "asset-storage" {
  //...
}

aws_function "my-func" {
  //This function's IAM role automatically has access to the user-store table and asset-storage bucket,
}
```
- Built in auto-scaling for DynamoDB capacity and more. Enough manually checking that box in the AWS console out of copy-pasting laziness.
```hcl
aws_dynamodb "user-store" {
  auto_scaling {
    min_read = 10
    max = 500
  }
}
aws_function "my-func" {
  provisioned_concurrency {
    min = 10
    max = 200
  }
}
```
- Ever wanted Lambdas to run more than 15 minutes? How about one off Fargate tasks without having to define a full plate of networking resources?
```hcl
aws_fargate_task "long-running-task" {
  package {
    include = ["bin/fargate"]
  }
  docker {
    entrypoint = "./handler"
    runtime = "go"
  }
}
```
- Plug in events to your functions easily, as expected
```hcl
aws_function "my-func" {
  event_dynamodb_stream {
    table = aws_dynamodb.request-log
    batch_size = 1
  }
  event_http_route "GET /user" {
    aws_http_api = aws_http_api.user-api
  }
}
```


### Soon to come
- Integrate existing projects/templates/files with simple syntax, for example interacting with your existing serverless framework project
```hcl
aws_fargate_task "task-runner" {
  environment {
    S3_BUCKET = serverless.resources.Resources.MyBucket.Properties.Name
    DDB_TABLE = cloudformation.MyTable.Properties.Name
  }
}
```
- Customizable but pre-populated Dagger plan making your builds and deployments work anywhere with 1 command
- Barbe-serverless currently focuses on AWS only, but other cloud providers will come in the future
- Something you want to see here? Let us know!

Quick links:
- [Getting started in 5 minutes](./docs/getting-started.md)
- [Example projects](./examples)
- [Installation](./docs/installation.md)
- [Documentation](./docs/README.md)

## Ready to get started?

If you're just curious about what a project looks like, head to the [examples](./examples) directory. 
Otherwise, get started with the [installation](./docs/installation.md) and [guide](./docs/README.md).

## Ideas? Essential feature missing? Just a question or some feedback?

Feel free to open an issue for **any** reason, would love to hear from you!
You can also send me marriage proposals on twitter DM @pinezul