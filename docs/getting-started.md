# The 5 minutes getting started guide

Barbe-serverless is a Barbe template that generates Terraform files. We do not have any built in build/deploy system **yet**, 
so you'll need to build your application yourself and to run `terraform` once the Terraform files are generated. 

For now let's get started on a project

### The basic project setup

Let's start by creating a `config.hcl` file, the name can be anything. 
The first thing you will need is a `template` block to indicate to the barbe CLI what template to use. 
```hcl
# config.hcl
template {
  manifest = "https://raw.githubusercontent.com/Plenituz/barbe-serverless/main/manifest.json"
}
```

That's all the scaffolding we'll need for now, let's add a [Lambda function](./references/aws_function.md)
```hcl
# config.hcl
template {
  manifest = "https://raw.githubusercontent.com/Plenituz/barbe-serverless/main/manifest.json"
}

aws_function "insert-item" {
  runtime     = "nodejs16.x"
  handler     = ".build/bundle.insertItem"
  memory_size = 128
  timeout     = 30
  
  # This block tells Barbe-serverless what to put in the lambda function's ZIP file when deploying
  package {
    include = ["build/bundle.js"]
  }
}
```

The block we added will create a Lambda function named `insert-item`, the ZIP package of the function will contain the file at `build/bundle.js`. 
This example assumes that you have built a javascript project and put it in `build/bundle.js` with a `insertItem` function defined in the global scope.
Since Barbe doesn't mess with your build (yet), you can use any other runtime the same way.
```js
// build/bundle.js
exports.insertItem =  async function(event, context) { ... }
```

Before we add more resources, let's deploy this project. The first thing we'll need is the Barbe CLI, you can find the installation instructions [here](https://github.com/Plenituz/barbe/blob/main/docs/installation.md).
Then we can run
```bash
barbe generate config.hcl --output dist
```

This will generate everything we need in the `dist` directory, let's take a look inside. Here is what was generated so far:
```
dist/
├── generated.tf
└── .package
    └── insert-item_lambda_package.zip
```

Opening the `generated.tf` file, we can see that it contains Terraform definitions for our Lambda function, amongst other things like a log group and an IAM role.
We don't need to know about all the details, but it's good to understand where to look in case you need to debug or double check something
```hcl
resource "aws_lambda_function" "insert-item_lambda" {
  architectures    = ["x86_64"]
  role             = aws_iam_role.default_lambda_role.arn
  filename         = ".package/insert-item_lambda_package.zip"
  memory_size      = 128
  package_type     = "Zip"
  runtime          = "nodejs16.x"
  function_name    = "insert-item"
  handler          = "src/insert-item.handler"
  source_code_hash = filebase64sha256(".package/insert-item_lambda_package.zip")
  lifecycle {
    ignore_changes = [architectures]
  }
  publish = true
  timeout = 30
}
```

We can also open the `.package/insert-item_lambda_package.zip` file and see that it contains the file indicated in the `package` block.

Once we have the Terraform files generated, we can run `terraform init` and `terraform apply` in the `dist` directory, just like you would on any terraform project
```bash
cd dist
terraform init
terraform apply -auto-approve
```

### Default blocks and name prefix

Most of the time in projects, all our lambda functions will use the same runtime, memory, or even handler. 
Instead of copy-pasting these parameters every time, we can use the `default` block to set them for all our lambda functions.

```hcl
# config.hcl
template {
  manifest = "https://raw.githubusercontent.com/Plenituz/barbe-serverless/main/manifest.json"
}

default {
  name_prefix = ["cool-project-prod"]
  runtime     = "nodejs16.x"
  memory_size = 128
  timeout     = 30
  package {
    include = ["build/bundle.js"]
  }
}

aws_function "insert-item" {
  handler     = "build/bundle.insertItem"
}
aws_function "read-item" {
  handler     = "build/bundle.readItem"
}
```

In the snippet above, we added a `default` block, everything in that block will be applied to all other Barbe-serverless constructs in the project, this includes our `aws_function` blocks.
We also added a new function, since both our functions use the same javascript bundle, we can just change the value of `handler` to tell AWS which javascript function to execute.

You might have noticed, I snuck a little `name_prefix` on the `default` block. This is what allows us to deploy multiple environments, 
the `name_prefix` is a string that will go in front of the name of the resources, so changing it is will give us the same template but with differently named resources.

You can go further and use an environment variable in the `name_prefix` to make it dynamic, for example:
```hcl
name_prefix = ["cool-project-${env.STAGE}"]
```

To learn more about default blocks take a look at [this guide](./default-blocks.md) 


### Adding resources

Let's add a [DynamoDB table](./references/aws_dynamodb.md) to our project.
```hcl
aws_dynamodb "item-store" {
  hash_key = "itemIds"
}
```

That's all we need for a basic table, if we update the code in our Lambda function, we can insert and delete items from the table right away.
We can get a little fancy by adding a TTL key and autoscaling to our table.
```hcl
aws_dynamodb "item-store" {
  hash_key = "itemIds"
  ttl_key  = "ttl"

  auto_scaling {
    min = 1
    max = 10
  }
}
```

One last thing we can add to make managing the Terraform state easier is a [`state_store`](./references/state_store.md) block.
```hcl
state_store {
  s3 {}
}
```

After adding this, running `barbe generate` will ask if you want to create a bucket with a name based on your `name_prefix`. 
Once created, the bucket will automatically be used by terraform to store the state of your project. 
You can also use an existing bucket by specifying its name under `existing_bucket`.

That's it for this getting started, here are a few links you can use next
- [The example projects directory](../examples)
- [Explore the different constructs](./references)