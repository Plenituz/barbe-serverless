# Integrating existing projects

Once of Barbe's superpower is the ability to pull values from existing projects, such as Serverless framework configs or Cloudformation stacks. 

This is what it looks like
```hcl
cloudformation("stack-name").resources.MyTable.Properties.TableName
cloudformation("stack-name").output.MyOutput

serverless_framework.custom.myBucketName
serverless_framework.service
serverless_framework("./other-project").resources.Resources.MyBucket.Properties.BucketName
```

Here is example of Terraform pulling from Cloudformation on a full project: [here](../examples/terraform_%3C3_cloudformation)

### `cloudformation(stackName)`

This function can give you access to 2 things

#### The cloudformation stack's outputs with `cloudformation(stackName).output`

This is the concrete values of the outputs you declared in the Cloudformation template. 
It's a flat map of string to value, so you can do `cloudformation(stackName).output.MyOutput` to get the value of the output named `MyOutput` 

#### The cloudformation stack's template resources with `cloudformation("stack-name").resources`

This is the raw Cloudformation template, this includes functions like `Fn::GetAtt` and `Ref` functions, so some values might not be available.

> Tip: If you're not sure what the path to a value might be, include a call to `cloudformation(stackName).*` in your template and run `barbe generate`.
> This will generate a json file in your output directory (even if the generation fails), this is what Barbe uses to find the values.

### `serverless_framework` and `serverless_framework(path)`

This function give you access a Serverless framework's computed config file. This is what you get when you run `serverless print --format json` on a project.

If you use `serverless_framework.*` directly, it will look for a `serverless.yml` file in the current directory. If you use `serverless_framework(path)` it will look for a `serverless.yml` file in the directory at `path`.

> Remember: you don't even need to have the Serverless framework CLI installed to use this function