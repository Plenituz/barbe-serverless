# aws_s3

Provide an AWS S3 Bucket. Any bucket declared using this block will be accessible by any aws_iam_lambda_role.
You can use the native aws_s3_bucket_* resources with the bucket for things like lifecycle configuration, logging, acl, etc...

Related links:
- event_s3 block on [aws_function](./aws_function.md)

---

### Example usage

#### A basic bucket with versioning enabled
```hcl
aws_s3 "bucket-name" {
  versioning_enabled = true
}
```

#### A bucket with a lifecycle rule
```hcl
aws_s3 "file-storage" {}

resource "aws_s3_bucket_lifecycle_configuration" "file_storage_lifecycle" {
  bucket = aws_s3.file-storage.id
  rule {
    id = "1"
    status = "Enabled"

    filter {
      prefix = "cache"
    }

    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
}
```

#### A bucket with a cors rule
```hcl
aws_s3 "bucket" {
  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET"]
    allowed_origins = ["*"]
    max_age_seconds = 3000
  }
}
```
---

### Argument reference

`region`: (Optional, string) The region in which to create the bucket

`copy_from`: (Optional, string) Name of the `default` block to inherit from, if not provided the unnamed `default` block is used

`name_prefix`: (Optional, string) Prefix appended to the bucket name

`force_destroy`: (Optional, boolean) A boolean that indicates all objects (including any locked objects) should be deleted from the bucket so that the bucket can be destroyed without error. These objects are not recoverable.

`object_lock_enabled`: (Optional, boolean) Indicates whether this bucket has an Object Lock configuration enabled. This argument is not supported in all regions or partitions. You can also create your own [aws_s3_bucket_object_lock_configuration](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_object_lock_configuration) instead 

`versioning_enabled`: (Optional, boolean) Indicates whether this bucket has Versioning enabled. You can also create your own [aws_s3_bucket_versioning](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_versioning) instead

`cors_rule`: (Optional, block) List of cors configuration for the bucket. You can also create your own [s3_bucket_cors_configuration](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_cors_configuration) instead

---

`cors_rule` block attributes:

&nbsp;&nbsp;&nbsp;&nbsp;`allowed_headers`: (Optional) Set of Headers that are specified in the Access-Control-Request-Headers header.

&nbsp;&nbsp;&nbsp;&nbsp;`allowed_methods`: (Required) Set of HTTP methods that you allow the origin to execute. Valid values are GET, PUT, HEAD, POST, and DELETE.

&nbsp;&nbsp;&nbsp;&nbsp;`allowed_origins`: (Required) Set of origins you want customers to be able to access the bucket from.

&nbsp;&nbsp;&nbsp;&nbsp;`expose_headers`: (Optional) Set of headers in the response that you want customers to be able to access from their applications (for example, from a JavaScript XMLHttpRequest object).

&nbsp;&nbsp;&nbsp;&nbsp;`id`: (Optional) Unique identifier for the rule. The value cannot be longer than 255 characters.

&nbsp;&nbsp;&nbsp;&nbsp;`max_age_seconds`: (Optional) The time in seconds that your browser is to cache the preflight response for the specified resource.

---

### Accessing attributes

`aws_s3.{name}` points to the [aws_s3_bucket resource](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket#attributes-reference)

`aws_s3.{name}.cors` pointer to the [aws_s3_bucket_cors_configuration resource](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_cors_configuration#attributes-reference), if defined

`aws_s3.{name}.object_lock` pointer to the [aws_s3_bucket_object_lock_configuration resource](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_object_lock_configuration#attributes-reference), if defined

`aws_s3.{name}.versioning` pointer to the [aws_s3_bucket_versioning resource](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket_versioning#attributes-reference), if defined
