# Using environment variables

- You can refer to environment variables in your configuration using the `env` traversal
```hcl
aws_function "my-function" {
  region = env.AWS_REGION
}
```

- Any environment variable that is referred to but not defined in your environment will trigger an error when generating the template.
- Also note that the environment variables values are **written into** the generated Terraform template. If you use `env.MY_VAR`, the generated files will contain the actual value of MY_VAR, not a reference that would be resolved when running `terraform apply`.
```hcl
aws_dynamodb "request-log" {
  hash_key = env.HASH_KEY
}

# with HASH_KEY="my-hash-key", the block above becomes:
resource "aws_dynamodb_table" "request-log" {
  hash_key = "my-hash-key"
}
```