# Multi-stage and using name_prefix

- All Barbe-serverless blocks support using a `name_prefix` attribute. 
- This attribute allows you to specify a prefix that will be applied to all the underlying resources that will be created by the construct.
- `name_prefix` is an array of string that gets concatenated together, so you can define part of the `name_prefix` on `global_default`, and another path on a `default` and/or on the construct itself.
- You can use environment variables in the `name_prefix` to make your deployment flexible. If you do so, you will most likely want to take advantage of `state_store` or define your own `terraform` block to avoid having your local state be re-used by the different stages

### Example

```hcl
global_default {
  name_prefix = ["service-name-"]
}

default {
  name_prefix = ["${env.STAGE}-"]
}

# this will create a resource with the name "service-name-${env.STAGE}-my-function"
aws_function "my-function" {
  //...
}
```