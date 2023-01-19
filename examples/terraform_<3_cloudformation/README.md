# Terraform + CloudFormation = <3

This example shows how to use Barbe-serverless to make a Terraform template access a Cloudformation stack values seamlessly.

In any `*.tf` file we can use `cloudformation("stack-name").output` to access a cloudformation stack output.
```hcl
{
    Action = [
      "s3:*"
    ]
    Effect   = "Allow"
    Resource = "arn:aws:s3:::${cloudformation("tf-heart-cf").output.S3Bucket}*"
}

environment {
    variables = {
        S3_BUCKET = cloudformation("tf-heart-cf").output.S3Bucket
    }
}
```

This project has:
- a Cloudformation template `tf-heart-cf.cloudformation.json` that creates an S3 bucket
- a Terraform template `lambda.tf` deploys a lambda function that will put a file in the S3 bucket that is defined in the Cloudformation stack
- a Barbe `config.hcl` to link to the Barbe-serverless templates that make this possible

> Important note: Barbe relies on Docker/Buildkit, depending on your system you might have to remove the `sudo` in the `Makefile` 

To deploy everything
```bash
make deploy
```

To destroy it afterward you can
```bash
make destroy
```


This example is voluntarily only using pure terraform, none of the constructs that barbe-serverless provides, 
just to show the interaction with CloudFormation. 

Go checkout the rest of [Barbe-serverless](https://github.com/Plenituz/barbe-serverless) if you're tired of writing 100 lines of terraform for a simple lambda function.  
