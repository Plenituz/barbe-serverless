# aws_fargate_task

Provide all the resources needed to run an AWS Fargate Task.

There is a few components you need to be aware of to make full use of this construct. aws_fargate_task is made of:
- A docker image, built locally and sent to an ECR repository, configured with the `package` and `docker` blocks.
- An ECS cluster, VPC, subnet and security group, and all their friends (route tables, nat gateway, etc...)

You can override each element of the construct if needed, but if you're unsure about what each element does, the default values are meant to get your task running with very little configuration. 

> Note: aws_fargate_task in its current state is very much a prototype, the image build process will be improved in the future:
> aws_fargate_task manages the docker build through local execution of the `docker` command, beware of breaking changes (and bugs).

---

### Example usage

#### A task using the built-in Go Dockerfile 
```hcl
aws_fargate_task "generate-report" {
    package {
      include = ["bin/main"]
    }

    docker {
      entrypoint = "./handler"
      runtime = "go"
    }
}
```

#### A task the customizes the docker build script and vpc id, but uses the built-in subnet with some modifications
```hcl
aws_fargate_task "generate-report" {
  vpc_id = aws_vpc.main.id
  subnet {
    kind = "private"
    make_nat_gateway = true
    cidr_block = "10.0.1.0/24"
  }
  docker {
    build_script = file("./build_image.sh")
  }
}
```

#### A task the customizes the Dockerfile, reduces the expiration time of the image to 7 days and uses the default VPC of the account
```hcl
aws_fargate_task "generate-report" {
  use_default_vpc = true
  
  docker {
    dockerfile_content = <<EOF
      FROM ubuntu:20.04
      COPY bin/main main
      RUN apt-get update && apt-get install -y ca-certificates
      CMD ./main
EOF
  }

  ecr_repository {
    expire_untagged_after_days = 7
  }
}
```

---

### Argument reference

`region`: (Optional, string) The region in which to create the resources

`copy_from`: (Optional, string) Name of the `default` block to inherit from, if not provided the unnamed `default` block is used

`name_prefix`: (Optional, string) Prefix appended to the resource names

`environment`: (Optional, block) An arbitrary object, each key/value pair being passed as an environment variable to the container
```hcl
environment {
  BUCKET_NAME = aws_s3.bucket.id
}
```

`cpu`: (Optional, number) The number of CPU units to allocate to the container: 256, 512, 1024, 2048, 4096, where 1024 is 1 vCPU. This also impacts the memory value you are allowed to use, see [this article](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-ecs-taskdefinition.html#cfn-ecs-taskdefinition-cpu)

`memory`: (Optional, number) The amount of memory the container can allocate in MB, tighly related to the cpu value, see [this article](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-ecs-taskdefinition.html#cfn-ecs-taskdefinition-cpu)

`entrypoint`: (Optional, string) The command to run when the container is started, shortcut for `docker.entrypoint`, will be ignored if the `docker` block is present

`docker`: (Optional, block) The docker block is used to customize the docker build process, see dedicated section below for more details

`package`: (Sometimes required, block) Details on the files to include in the image, will be required if you do not override the Dockerfile using `docker.dockerfile_content`

`logs_retention_days`: (Optional, number) The number of days to keep the logs for the task executions, defaults to 30

`role`: (Optional, string) ARN of the IAM role used by the running task, Barbe-serverless will have a default role configured for you with access to all your Barbe-serverless resources

`port_mapping`: (Optional, blocks) List of port mapping objects to expose to the container

`mapped_ports`: (Optional, list of number) Shortcut for TCP ports to be mapped, every number in `mapped_ports` is the equivalent of a full port mapping object the container and host port are the given value and the protocol is TCP

`security_group_id`: (Optional, string) If provided, no security group will be auto created by the construct, instead the given security group will be used

`execution_role_arn`: (Optional, string) ARN of the execution role of the task, this is not the role that will be used by the running task. Defaults to the AWS account's `ecsTaskExecutionRole` service role. If you're unsure what this role is for, the default value will work for most cases

`use_default_vpc`: (Optional, boolean) If true, the default VPC of the account will be used to run the task. 

`vpc_id`: (Optional, string) Ignored if `use_default_vpc` is true. The VPC ID to use to run the task, if not provided, the construct will create its own VPC

`vpc`: (Optional, block) Ignored if `use_default_vpc` is true or `vpc_id` is provided. The VPC block is used to customize the VPC created by the construct

`subnet_ids`: (Optional, list of string) List of subnet IDs to use to run the task, if not provided, the construct will create 1 subnet

`subnet`: (Optional, blocks) Ignored if `subnet_ids` is provided. Each subnet block will result in a subnet created by the construct

`repository_url`: (Optional, string) The URL of the ECR repository to use to run the task, if not provided, the construct will create its ECR repository

`ecr_repository`: (Optional, block) Ignored if `repository_url` is provided. The ECR repository block is used to customize the ECR repository created by the construct


---

### The `docker` block

> Note: This section is most likely to suffer severe changes in the future, keep and excited eye out

Barbe-serverless will create a Dockerfile and script to build a docker image based on the parameters given in this block.

#### Build script

if `docker.build_script` is not provided, the following script will be run to build the image (pseudo-code):
```bash
if docker.login_command is defined {
  execute docker.login_command
}
if docker.build_command is defined {
  execute docker.build_command
} else {
  docker build -f Dockerfile --build-arg [docker.build_args...] -t [docker.tag] --network=host .
}
docker tag [docker.tag]:latest [ecr_repository]
aws ecr get-login-password | docker login --username AWS --password-stdin {ecr_url}
docker push [ecr_repository]
```

As you can see, the script can be customized, but also come with default values that will get your image built if you don't want to mess with it.

All the command overrides described in the next section have access to the following template variables:
- `${tag}`: The value of `docker.tag`
- `${ecr_repository}`: The value ecr repository url
- `${aws_region}`: The region of the task
- `${aws_account_id}`: I'll let you guess that one
- `${dockerfile_path}`: Path to the generated Dockerfile
- Any value in `docker.template_args`
- Any value in `docker.build_args`, where each key is prepended with `build_arg_`. For example if `docker.build_args = {foo: "bar"}`, you will have access to `${build_arg_foo}`

#### Dockerfile

if `docker.dockerfile_content` is not provided, a Dockerfile will be generated based on the parameters given in this block.
Based on `docker.runtime` the auto-generated Dockerfile can have 3 flavors: python, node and go.
Both python and node will use the official docker images as their base, while go will use ubuntu and rely on you providing an already built binary.


`docker` block attributes:

&nbsp;&nbsp;&nbsp;&nbsp;`build_script` (Optional, string) If provided, completely overrides the image build script

&nbsp;&nbsp;&nbsp;&nbsp;`login_command` (Optional, string) A bash command run before the build command, generally used to authenticate using `docker login` when needed

&nbsp;&nbsp;&nbsp;&nbsp;`build_command` (Optional, string) A bash command that should build the image and tag it with `${tag}`

&nbsp;&nbsp;&nbsp;&nbsp;`tag` (Optional, string) The tag of the image, defaults to the name of the aws_fargate_task block including name prefixes

&nbsp;&nbsp;&nbsp;&nbsp;`use_sudo` (Optional, boolean) If set to true all the auto-generated docker commands will use `sudo`. Note that this will cause terraform to hang if a password is asked during the build process. (tip: enter your password before running `terraform apply` using any other sudo command on the same session)

&nbsp;&nbsp;&nbsp;&nbsp;`template_args` (Optional, object) Provides arbitrary template variables to the build script

&nbsp;&nbsp;&nbsp;&nbsp;`build_args` (Optional, object) Provides arbitrary build arguments that will be passed to the `docker build` auto-generated command

&nbsp;&nbsp;&nbsp;&nbsp;`dockerfile_content` (Optional, string) Overrides the Dockerfile content

&nbsp;&nbsp;&nbsp;&nbsp;`entrypoint` (Required, string) The command to run when the container is started

&nbsp;&nbsp;&nbsp;&nbsp;`runtime` (Sometimes required, string or object) The Dockerfile content will be defined based on this value. If Barbe-serverless is not able to determine the runtime from your `entrypoint` this can be ignored, otherwise it is required. You can also optionally provide a version for the base image by turning this into an object
```hcl
# either
runtime = "python"
# or
runtime = {
  name: "python"
  # this is the version of the official python base image
  version: "3.10.5-alpine"
}
```

---

`package` block attributes:

&nbsp;&nbsp;&nbsp;&nbsp;`file_map` (Optional, object) An object mapping the file names and path on your disk to their name and path in the image. You can rename specific files or use the `*` wildcard to apply a rule to a group of files
```hcl
file_map = {
  # this will make any file on your local disk at "bin/" to be at the root directory in the image
  "bin/*" = "./*"
  # this will make any file on your local disk at "bin/" to be renamed "handler" and at the root directory in the image
  "bin/*" = "handler"
  # this will move and rename the file at "bin/handler"
  "bin/handler" = "boostrap"
}
```

&nbsp;&nbsp;&nbsp;&nbsp;`include` (Optional, list of string) A list of patterns or files to be included in the image, you can use the `*` wildcard to match a group of files. Any file that match any `exclude` pattern will not be included

&nbsp;&nbsp;&nbsp;&nbsp;`exclude` (Optional, list of string) A list of patterns or files to be excluded from the image, you can use the `*` wildcard to match a group of files


--- 

`port_mapping` block attributes:

&nbsp;&nbsp;&nbsp;&nbsp;`container_port` (Required, number) Port number of the container

&nbsp;&nbsp;&nbsp;&nbsp;`host_port` (Optional, number) Port number of the host, defaults to `container_port`

&nbsp;&nbsp;&nbsp;&nbsp;`protocol` (Optional, string) Protocol of the port, defaults to `tcp`


--- 

`vpc` block attributes:

&nbsp;&nbsp;&nbsp;&nbsp;`name` (Optional, string) Name for the VPC, defaults to the name of the aws_fargate_task block followed by `-vpc`

&nbsp;&nbsp;&nbsp;&nbsp;`cidr_block` (Optional, string) CIDR block of the VPC, defaults to `10.0.0.0/16`


--- 

`subnet` block attributes:

&nbsp;&nbsp;&nbsp;&nbsp;`name` (Optional, string) Name prefix to use for the resources associated with the subnet (NAT gateway, Internet gateway). This could lead to name collisions if you have multiple subnets in the same VPC, be careful

&nbsp;&nbsp;&nbsp;&nbsp;`kind` (Optional, string) Kind of subnet "public" or "private", defaults to "public"

&nbsp;&nbsp;&nbsp;&nbsp;`make_nat_gateway` (Optional, boolean) Ignored if kind is "public". If set to true, a NAT gateway will be created and attached to the subnet

&nbsp;&nbsp;&nbsp;&nbsp;`cidr_block` (Optional, string) CIDR block of the subnet, defaults to `cidrsubnet(vpc_id, 4, subnet.index+1)`


--- 

`ecr_repository` block attributes:

&nbsp;&nbsp;&nbsp;&nbsp;`name` (Optional, string) Name of the repository, defaults to the name of the aws_fargate_task block followed by `-ecr`

&nbsp;&nbsp;&nbsp;&nbsp;`expire_untagged_after_days` (Optional, number) Number of days after which untagged images will be automatically expired, defaults to `30`

&nbsp;&nbsp;&nbsp;&nbsp;`dont_expire_images` (Optional, boolean) If set to true, untagged images will not be automatically expired

&nbsp;&nbsp;&nbsp;&nbsp;`max_untagged_count` (Optional, number) Maximum number of untagged images to keep, this overrides both `expire_untagged_after_days` and `dont_expire_images`

&nbsp;&nbsp;&nbsp;&nbsp;`policy` (Optional, string) The policy to apply to the repository, this overrides both `max_untagged_count`, `expire_untagged_after_days` and `dont_expire_images`

---

### Accessing attributes

`aws_fargate_task.{name}.task_definition` points to the [aws_ecs_task_definition](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ecs_task_definition#attributes-reference)

`aws_fargate_task.{name}.log_group` points to the [aws_cloudwatch_log_group](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_log_group#attributes-reference)

`aws_fargate_task.{name}.cluster` points to the [aws_ecs_cluster](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ecs_cluster#attributes-reference)

`aws_fargate_task.{name}.security_group_id` points to a string value containing the ID of the security group 

`aws_fargate_task.{name}.subnet_ids` points to an array strings containing the IDs of the subnets 

`aws_fargate_task.{name}.vpc` points to the [aws_vpc](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/vpc#attributes-reference)

`aws_fargate_task.{name}.repository_url` points to a string containing the URL of the repository

`aws_fargate_task.{name}.run_task_payload` points to a string containing the json payload that can be used as the input to an ECS RunTask operation in most AWS SDKs. It looks like this:
```json
{
    "taskDefinition": "${task_definition}",
    "cluster": "${cluster}",
    "launchType": "FARGATE",
    "count": 1,
    "networkConfiguration": {
        "awsvpcConfiguration": {
            "subnets": [${subnet_ids}],
            "securityGroups": ["${security_group_id}"],
            "assignPublicIp": "ENABLED"
        }
    },
    "overrides": {
        "containerOverrides": [
            {
                "name": "${container_name}"
            }
        ]
    }
}
```

Example usage:
```golang
var parsed ecs.RunTaskInput
err := json.Unmarshal(runTaskPayload), &parsed)
if err != nil {
    panic(err)
}

parsed.Overrides.ContainerOverrides[0].Environment = []*ecs.KeyValuePair{
    {
        Name:  aws.String("MY_CUSTOM_VAR"),
        Value: aws.String("my custom value"),
    },
}
_, err = ecsClient.RunTask(&parsed)
```
