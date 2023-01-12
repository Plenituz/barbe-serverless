# for_each

This is a "meta block" that emits all elements of it's body several times, iterating over a given array.

---

### Example usage

```hcl
default {
  regions = ["us-west-1", "eu-west-3", "ap-northeast-2"]
}

for_each "regions" {
  aws_function "global-$${each.key}" {
    region = each.key
    package {
      include = ["bin/http_lambda"]
    }
    environment {
      GENERATED_REGION = each.key
    }
  }
}
```

The example above will create 3 functions in "us-west-1", "eu-west-3" and "ap-northeast-2"

The label of a `for_each` block is a reference to the array to be iterated, located on the `default` block.
Any label inside the `for_each` can contain `$${each.key}` (note the 2 `$`, having a regular string interpolation in labels wouldn't work in HCL) in it and will be replaced with the value of the current element of the array.
Regular attributes can also use the reference `each.key` directly.
