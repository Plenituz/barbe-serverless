# The 5 minutes getting started guide

Barbe-serverless generates Terraform templates, Dockerfiles, zip archives and everything else you will need to deploy your application. It also runs most of the commands needed, terraform apply, awscli, docker push, etc.
We do not have any built in build system **yet**, so you'll need to build your application yourself (bundle your javascript, compile your Go, etc). 

Let's get started on a project

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
This example assumes that you have bundled a javascript project and put it in `build/bundle.js` with a `insertItem` function defined in the global scope.
Since Barbe doesn't mess with your build (yet), you can use any other runtime the same way.
```js
// build/bundle.js
exports.insertItem =  async function(event, context) { ... }
```

Before we add more resources, let's deploy this project. We'll need the Barbe CLI, you can find the installation instructions [here](https://github.com/Plenituz/barbe/blob/main/docs/installation.md).
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

We can also open the `.package/insert-item_lambda_package.zip` file and see that it contains the `build/bundle.js` file indicated in the `package` block.

Running `barbe generate` is not required to deploy the project, that was just to show you what was generated.
To actually deploy the project you can run
```bash
barbe apply config.hcl --output dist
```

This will generate the files, then run all the commands necessary to deploy, in our case that's just a `terraform apply` but for some project that might include pushing docker images to a registry, or running awscli commands.

Because barbe uses [Docker/Buildkit](https://github.com/moby/buildkit) internally to execute all commands in containers, that's why you don't even need to have `terraform` or awscli installed on your machine. This also means just like when you use `docker`, you might need to use `sudo` to run `barbe apply` on your computer, depending on your setup.

> Note: using `barbe apply` without a proper state store configured on your terraform project can lead to problems, try out [state_store](./references/state_store.md) to make that problem vanish.

### Default blocks and name prefix

Most of the time in projects, all our lambda functions will use the same runtime, memory, or even handler. 
Instead of copy-pasting these parameters every time, we can use the [`default` block](./default-blocks.md).

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

You might have noticed, I snuck in a little `name_prefix` on the `default` block. This is what allows us to deploy multiple environments, 
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

We can get a little fancy by adding a TTL key and autoscaling to our table. Autoscaling usually comes out a lot cheaper than on-demand pricing for DynamoDB tables have some traffic
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
This will create (or use an existing with `existing_bucket`) S3 bucket to store the Terraform state, and automatically configure terraform to use it.
```hcl
state_store {
  s3 {}
}
```


That's it for this getting started guide, here are a few links you can use next
- [The example projects directory](../examples)
- [Explore the different blocks](./references)
- [Integrating existing projects](./integrating-existing-projects.md)