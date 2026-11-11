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
- Always forget about updating your IAM roles? No worries, we'll take care of it
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

Interested? Need some help? Reach out on [Discord](https://hub.barbe.app/discord)!

Quick links:
- [Getting started in 5 minutes](./docs/getting-started.md)
- [Example projects](./examples)
- [Installation](./docs/installation.md)
- [Documentation](./docs/README.md)

## Fargate service image deployments

- `aws_fargate_service` resolves the selected ECR repository's `latest` image to a digest for its task definition. Applying after publishing a different image creates a task-definition revision and updates the service, including when `dont_redeploy_on_apply = true`.
- `repository_url` selects an existing private ECR repository for publishing and digest resolution. The lookup and ECR login use that repository's account and region; the service does not create or manage its retention policy.
- Building or copying to `repository_url` requires a concrete URL because publishing runs before the main Terraform apply. Terraform expressions in the URL can be used with `container_image.skip_build = true`.
- An `image` with `copy_image = false` is used unchanged, including its tag or digest. This mode does not create an ECR repository, look up a digest, or build or copy an image. Changing a tag's contents alone does not create a task-definition revision.
- `container_image.skip_build = true` skips repository updates as well as image building and publishing. Set it to `false` to apply repository changes, including retention policy updates. The main Terraform apply still resolves the existing `latest` image to its digest.
- Fargate-managed repositories retain images by default so active deployments and rollback revisions remain pullable after `latest` moves. Retained images continue to consume ECR storage until explicitly removed.
- Explicit `ecr_repository` retention settings override that default. Before enabling cleanup, ensure the policy retains every image needed by active deployments and supported rollbacks. A digest reference does not prevent ECR from deleting an image.

## Sharing Fargate infrastructure

Reference another service with `infrastructure_from` to reuse its ECS cluster, VPC, subnets, NAT gateways, and load balancer. Each service keeps its own task definition, deployment, security group, logs, image repository, and scaling settings.

```hcl
aws_fargate_service "compiler" {
  infrastructure_from = aws_fargate_service.mcp
  cpu = 1024
  memory = 2048
  desired_count = 1
  task_accessibility = "private"
  mapped_ports = [8080]

  secrets {
    COMPILER_TOKEN = aws_secretsmanager_secret_version.compiler.arn
  }

  load_balancer {
    path_patterns = ["/internal/compile"]
    priority = 100
    deregistration_delay = 30
    health_check {
      path = "/health"
      matcher = "204"
    }
  }

  health_check_grace_period_seconds = 30
  wait_for_steady_state = true
  deployment_circuit_breaker {
    enable = true
    rollback = true
  }

  container_image {
    dockerfile = "compiler/Dockerfile"
  }
}
```

- The referenced service must own the infrastructure in the same configuration. Configure its network and domain there. The sharing service inherits its region.
- For shared HTTP routing, the owner must have an application load balancer with one mapped container port. The new service also has one mapped port. Barbe uses the owner's HTTPS listener when it has a domain, otherwise HTTP.
- Each route needs `path_patterns` and a `priority` unique on that listener. The path is forwarded unchanged. The owner's default route keeps serving its original service.
- Shared services default to private subnets without a public IP. Their mapped ports accept traffic from the shared load balancer's security group. `task_accessibility` and `assign_public_ip` can override placement and IP assignment.
- Omit `load_balancer` for workers that only need the shared cluster and network.
- `secrets` maps container environment variable names to complete Secrets Manager ARNs. Reference a secret version's ARN to order initial deployment after its value is created. Values stay out of task-definition environment variables.
- When `secrets` is present, Barbe creates an execution role with image-pull, logging, and access to those secrets. If you supply `execution_role_arn`, that role must already have the required permissions. Secrets encrypted with a customer-managed KMS key require a supplied role with decrypt access.
- ECS reads secret values when tasks start; rotate running tasks after updating a secret value.
- `role` remains the application task role; use `role = null` for containers that do not call AWS APIs.
- Deployment controls include `health_check_grace_period_seconds`, `wait_for_steady_state`, and `deployment_circuit_breaker`. Standard ECS deployment defaults apply unless minimum/maximum healthy percentages or `platform_version` are supplied.

Run the component's focused generation checks with `node src/aws_fargate_service_v2.test.mjs`.


## What's inside?

Barbe-serverless sits on the shoulder of giants, inheriting all the superpowers they come with, including:
- Fast, flexible, multi-cloud deployment from [Terraform](https://github.com/hashicorp/terraform) (frankly, I'm just tired of dealing with my grumpy ex-wife Cloudformation)
- Easy config management, extensibility, and integration with existing tools/frameworks with [Barbe](https://github.com/Plenituz/barbe)
- Run your deployment on any machine with a single command thanks to [buildkit](https://github.com/moby/buildkit)

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

Reach out on [Discord](https://hub.barbe.app/discord)!
