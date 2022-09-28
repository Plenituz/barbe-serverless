# Barbe-serverless

Barbe-serverless is a serverless application development solution that fits right in with you existing project. 
Define DynamoDB tables, Lambda functions, APIs and more, all batteries included, even extra ones for your other toys.

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
- Enhance your existing projects: use regular Terraform, pull values directly from your Cloudformation stack, Serverless Framework config, and more*. Best part is, you don't even need to have any of their CLI installed to do so.
```hcl
aws_fargate_task "task-runner" {
  environment {
    S3_BUCKET = serverless_framework.custom.myBucketName
    DDB_TABLE = cloudformation("my-stack-${env.STAGE}").resources.MyTable.Properties.TableName
  }
}
resource "aws_route53_record" "client_domain" {
  name = "example.com"
  type = "CNAME"
  // ...
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
- Built in auto-scaling for DynamoDB capacity and more. On demand is dangerous for your wallet.
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

Quick links:
- [Getting started in 5 minutes](./docs/getting-started.md)
- [Example projects](./examples)
- [Installation](./docs/installation.md)
- [Documentation](./docs/README.md)


## What's inside?

Barbe-serverless sits on the shoulder of giants, inheriting all the superpowers they come with, including:
- Fast, flexible, multi-cloud deployment from [Terraform](https://github.com/hashicorp/terraform) (frankly, I'm just tired of dealing with my grumpy ex-wife Cloudformation)
- Easy config management, extensibility, and integration with existing tools/frameworks with [Barbe](https://github.com/Plenituz/barbe)
- Run your deployment on any machine with a single command thanks to [builkit](https://github.com/moby/buildkit)

> Barbe-serverless is in pretty early stage, be on the lookout for breaking changes and new exciting features, come have fun with it!


## Project goals

We want Barbe-serverless to fit in your existing project instead of forcing you to use Barbe-serverless for every aspect of it.

Of course Barbe-serverless is (or will be) great as an all-in-one tool, but we know how development works: having an existing codebase shouldn't lock you out of using Barbe-serverless.
And using Barbe-serverless shouldn't lock you out of using other technologies. In fact, Barbe's main goal is to make it easy to glue together several technologies.

We do this by:
- Making it easy to pull data from other tools like [Serverless Framework or Cloudformation](./docs/integrating-existing-projects.md), 
- Making sure `barbe generate` and `barbe apply` can [run on any computer the same way](./docs/articles/buildkit.md), without having to install anything else.

If we succeed, it means trying Barbe-serverless is such a small commitment that even discussing it is more effort than just trying it out.

## Ready to get started?

If you're just curious about what a project looks like, head to the [examples](./examples) directory. 
Otherwise, get started with the [installation](./docs/installation.md) and [guide](./docs/getting-started.md).

## Ideas? Essential feature missing? Just a question or some feedback?

Feel free to open an issue for **any** reason, would love to hear from you!
You can also send me cat pictures on twitter DM @pinezul