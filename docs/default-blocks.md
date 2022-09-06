# `default` and `global_default`

Default blocks are a tool to help your configuration file readable and maintainable. 

Every attribute or block defined on a `default` block will automatically be inherited by all other blocks on which the `default` block takes effect.
```hcl
default {
  package {
    exclude = ["dist/*"]
  }
  runtime     = "go1.x"
  handler     = "handler"
  memory_size = 128
  timeout     = 30
}

aws_function "my-function-1" {
  # no need to define runtime, handler, timeout and memory_size here
}
aws_function "my-function-2" {
  # no need to define runtime, handler, timeout and memory_size here
}
```

Default blocks can be named. To get the attributes from a named default block, the receiving block has to specify a `copy_from` attribute 
```hcl
default {
  
}
default "lambda-defaults" {
  runtime     = "go1.x"
  handler     = "handler"
  memory_size = 128
  timeout     = 30
}

aws_function "my-function-1" {
  copy_from = "lambda-defaults"
  # no need to define runtime, handler, timeout and memory_size here
}
aws_function "my-function-2" {
  # these are needed, because copy_from is not specified, so the unnamed default block is used
  runtime     = "go1.x"
  handler     = "handler"
  memory_size = 128
  timeout     = 30
}
```

`global_default` blocks are similar to the unnamed `default` block, except it applies to all the constructs in your template, even if they specify a `copy_from`.
```hcl
global_default {
  runtime     = "go1.x"
  handler     = "handler"
  memory_size = 128
  timeout     = 30
}
default "lambda-defaults" {
  
}

aws_function "my-function-1" {
  copy_from = "lambda-defaults"
  # no need to define runtime, handler, timeout and memory_size here, we get them from the global_default block
}
```

Because of the global nature of `global_default` blocks, be careful when using them in templates that can't be easily edited. 
A good example of using `global_default` would be to specify a `name_prefix` for all the resources in your template.
```hcl
# this could be defined in an external file in the manifest
global_default {
  name_prefix = ["company-name-"]
}

default {
  name_prefix = ["production-"]
}

# this function will be named "company-name-production-my-function-1"
aws_function "my-function-1" {
  // ...
}
```
