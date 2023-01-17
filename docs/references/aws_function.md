# aws_function

Provides all the resources needed to create an AWS Lambda function.

Credit: Some of this documentation is inspired from these pages:
 - [Lambda event source](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_event_source_mapping)
 - [API gateway V2 stage](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/apigatewayv2_stage)

Related links:
- [aws_dynamodb](./aws_dynamodb.md)
- [aws_s3](./aws_s3.md)
- [aws_http_api](./aws_http_api.md)

---

### Example usage

#### A simple Lambda function
```hcl
aws_function "do-something" {
  handler     = "bin/something_doer"
  runtime     = "go1.x"
  memory_size = 256
  timeout     = 900
  
  package {
    include = ["bin/something_doer"]
  }
}
```

#### A more elaborate project setup with a Lambda and a DynamoDB table
```hcl
default {
  package {
    file_map = {
      "bin/*" = "handler"
    }
  }
  handler     = "handler"
  runtime     = "go1.x"
  memory_size = 256
  timeout     = 900
}

aws_function "get-file-info" {
  package {
    include = ["bin/get_file_info"]
  }
  
  environment {
    DDB_NAME = aws_dynamodb.files-table.name
  }
}

aws_function "stream-handler" {
  package {
    include = ["bin/stream_handler"]
  }

  event_dynamodb_stream {
    table = aws_dynamodb.files-table
    batch_size = 1
  }
}

aws_dynamodb "files-table" {
  hash_key = "fileId"
}
```

#### A Lambda listening to S3 events
```hcl
aws_function "s3-triggers" {
  handler     = "bin/s3_triggers"
  runtime     = "go1.x"
  memory_size = 256
  timeout     = 900
  package {
    include = ["bin/s3_triggers"]
  }

  event_s3 {
    bucket = aws_s3.bucket
    events = ["s3:ObjectCreated:*", "s3:ObjectRemoved:*"]
  }
}

aws_s3 "bucket" {}
```

#### A Lambda listening to HTTP events
```hcl
aws_function "handle-request" {
  handler     = "bin/handler"
  runtime     = "go1.x"
  memory_size = 256
  timeout     = 900
  package {
    include = ["bin/handler"]
  }

  # This can also be declared on the aws_http_api resource, see below
  event_http_route "GET /profile" {
    aws_http_api = aws_http_api.session-api
  }
}

aws_http_api "session-api" {
  # Alternatively, this would also work:
  # route "GET /profile" {
  #   aws_function = aws_function.handle-request
  # }
}
```


### Argument reference

`region`: (Optional, string) The region in which to create the resources

`copy_from`: (Optional, string) Name of the `default` block to inherit from, if not provided the unnamed `default` block is used

`name_prefix`: (Optional, string) Prefix appended to the resource names

`handler`: (Required, string) The name of the function's entrypoint

`runtime`: (Required, string) The function's [runtime](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html)

`package`: (Required, block) Details on the files to include in the function's package

`memory_size`: (Optional, integer) The amount of memory, in MB, that is allocated to your Lambda function, defaults to 128 MB

`timeout`: (Optional, integer) The function maximum execution time in seconds, defaults to 900 seconds

`description`: (Optional, string) A description of the function

`ephemeral_storage`: (Optional, integer) The size of the function’s /tmp directory in MB

`role`: (Optional, string) The ARN of the IAM role that Lambda assumes when it executes your function, Barbe-serverless will have a default role configured for you with access to all your Barbe-serverless resources

`architecture`: (Optional, string) The function's instruction set [architecture](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-lambda-function.html#cfn-lambda-function-architectures)

`layers`: (Optional, list of strings) A list of function layers ARN to add to the function's execution environment

`logs_retention_days`: (Optional, integer) The number of days to retain logs for this function, defaults to 30 days

`event_s3`: (Optional, blocks) Each event_s3 block configures an S3 event trigger

`event_dynamodb_stream`: (Optional, blocks) Each event_dynamodb_stream block configures a DynamoDB stream subscription

`event_http_route`: (Optional, blocks) Each event_http_route block configures a route on an aws_http_api. Note that you can also declare all your routes on the aws_http_api block directly

`environment`: (Optional, block) An arbitrary object, each key/value pair being passed as an environment variable to the function
```hcl
environment {
  BUCKET_NAME = aws_s3.bucket.id
}
```

`provisioned_concurrency`: (Optional, block) The provisioned concurrency configuration for the function, also handles auto-scaling it


---

`event_s3` block attributes:

&nbsp;&nbsp;&nbsp;&nbsp;`events` (Optional, list of strings) The [S3 events](https://docs.aws.amazon.com/AmazonS3/latest/userguide/notification-how-to-event-types-and-destinations.html#supported-notification-event-types) to trigger the function, defaults to "s3:*"

&nbsp;&nbsp;&nbsp;&nbsp;`prefix` (Optional, string) If provided, only object keys that begin with the specified prefix will trigger the event

&nbsp;&nbsp;&nbsp;&nbsp;`suffix` (Optional, string) If provided, only object keys that ends the specified suffix will trigger the event


---

`event_dynamodb_stream` block attributes:

&nbsp;&nbsp;&nbsp;&nbsp;`type` (Optional, string) "dynamodb" or "kinesis", defaults to "dynamodb", the type of the stream subscription

&nbsp;&nbsp;&nbsp;&nbsp;`kinesis_stream` (Optional, reference) Required if `type` is "kinesis", can be:
- A reference to a kinesis stream resource
```hcl
event_dynamodb_stream {
  type = "kinesis"
  kinesis_stream = aws_kinesis_stream.my-stream
}
```
- A reference to a DynamoDB table resource, only if using the auto-generated kinesis stream see [aws_dynamodb](./aws_dynamodb.md)
```hcl
event_dynamodb_stream {
  type = "kinesis"
  kinesis_stream = aws_dynamodb.my-table
}
```

&nbsp;&nbsp;&nbsp;&nbsp;`batch_size` (Optional, integer) The number of records to send in each batch

&nbsp;&nbsp;&nbsp;&nbsp;`starting_position` (Optional, string) The position in the stream where to start reading: "AT_TIMESTAMP" (Kinesis only), "LATEST", or "TRIM_HORIZON", defaults to "TRIM_HORIZON"

&nbsp;&nbsp;&nbsp;&nbsp;`enabled` (Optional, boolean) Whether to enable the stream subscription

&nbsp;&nbsp;&nbsp;&nbsp;`function_response_types` (Optional, string) A list of current response type enums applied to the event source mapping for [AWS Lambda checkpointing](https://docs.aws.amazon.com/lambda/latest/dg/with-ddb.html#services-ddb-batchfailurereporting). Valid values: "ReportBatchItemFailures"

&nbsp;&nbsp;&nbsp;&nbsp;`parallelization_factor` (Optional, integer) The number of batches to process from each shard concurrently, from 1 to 10

&nbsp;&nbsp;&nbsp;&nbsp;`maximum_batching_window_in_seconds` (Optional, integer) The maximum amount of time to gather records before invoking the function, between 0 and 300

&nbsp;&nbsp;&nbsp;&nbsp;`maximum_record_age_in_seconds` (Optional, integer) The maximum age of a record that Lambda sends to a function for processing

&nbsp;&nbsp;&nbsp;&nbsp;`bisect_batch_on_function_error` (Optional, boolean) If the function returns an error, split the batch in two and retry

&nbsp;&nbsp;&nbsp;&nbsp;`tumbling_window_in_seconds` (Optional, boolean) The duration in seconds of a processing window for [AWS Lambda streaming analytics](https://docs.aws.amazon.com/lambda/latest/dg/with-kinesis.html#services-kinesis-windows)

&nbsp;&nbsp;&nbsp;&nbsp;`on_failure_destination_arn` (Optional, string) ARN of the resource to which to send the failed invocations

&nbsp;&nbsp;&nbsp;&nbsp;`filter` (Optional, string) A filter pattern, see [Filter Rule Syntax](https://docs.aws.amazon.com/lambda/latest/dg/invocation-eventfiltering.html#filtering-syntax)


---

`event_http_route` block attributes:

The label of the event_http_route block is used as the route key
```hcl
event_http_route "GET /profile" {
  aws_http_api = aws_http_api.session-api
}
```

Note that you can also declare all your routes on the [aws_http_api](./aws_http_api.md) resource directly. Declaring a route twice will cause issues.

&nbsp;&nbsp;&nbsp;&nbsp;`aws_http_api` (Optional, reference) Reference to the aws_http_api resource on which the route should be defined, if not provided, the default (unnamed) http api will be used

&nbsp;&nbsp;&nbsp;&nbsp;`detailed_metrics_enabled` (Optional, boolean) Whether detailed metrics are enabled for the route

&nbsp;&nbsp;&nbsp;&nbsp;`logging_level` (Optional, string) Affects the log entries pushed to Amazon CloudWatch Logs. Valid values: "ERROR", "INFO", "OFF".

&nbsp;&nbsp;&nbsp;&nbsp;`throttling_burst_limit` (Optional, integer) The throttling burst limit for the route, defaults to either the `throttling_burst_limit` on the aws_http_api resource or 5000 if not set

&nbsp;&nbsp;&nbsp;&nbsp;`throttling_rate_limit` (Optional, integer) The throttling rate limit for the route, defaults to either the `throttling_rate_limit` on the aws_http_api resource or 10000 if not set

&nbsp;&nbsp;&nbsp;&nbsp;`authorizer` (Optional, reference) Reference to either a `jwt_authorizer` or `lambda_authorizer` declared on the aws_http_api resource
```hcl
event_http_route "GET /profile" {
    authorizer = jwt_authorizer.my-jwt-authorizer
}
event_http_route "GET /profile" {
  authorizer = lambda_authorizer.my-custom-authorizer
}
```

&nbsp;&nbsp;&nbsp;&nbsp;`payload_format_version` (Optional, string) The format of the payload sent to the Lambda function, defaults to "2.0"

&nbsp;&nbsp;&nbsp;&nbsp;`timeout_milliseconds` (Optional, number) The timeout of the HTTP request in milliseconds, defaults to 30000


---

`package` block attributes:

&nbsp;&nbsp;&nbsp;&nbsp;`file_map` (Optional, object) An object mapping the file names and path on your disk to their name and path in the function's package. You can rename specific files or use the `*` wildcard to apply a rule to a group of files
```hcl
file_map = {
  # this will make any file on your local disk at "bin/" to be at the root directory in the function's package
  "bin/*" = "./*"
  # this will make any file on your local disk at "bin/" to be renamed "handler" and at the root directory in the function's package
  "bin/*" = "handler"
  # this will move and rename the file at "bin/handler"
  "bin/handler" = "boostrap"
}
```

&nbsp;&nbsp;&nbsp;&nbsp;`include` (Optional, list of string) A list of patterns or files to be included in the function's package, you can use the `*` wildcard to match a group of files. Any file that match any `exclude` pattern will not be included

&nbsp;&nbsp;&nbsp;&nbsp;`exclude` (Optional, list of string) A list of patterns or files to be excluded from the function's package, you can use the `*` wildcard to match a group of files

&nbsp;&nbsp;&nbsp;&nbsp;`packaged_file` (Optional, string) If provided, disable the built in packaging, and use the value provided as the path to the function's package (it should be a zip file containing the function's code or binary)

---

`provisioned_concurrency` block attributes:

&nbsp;&nbsp;&nbsp;&nbsp;`alias_name` (Optional, string) Name of the alias for the version of the Lambda that will have the provisioned concurrency configuration applied to it, defaults to "provisioned"

&nbsp;&nbsp;&nbsp;&nbsp;`value` (Optional, number) The fixed number of concurrency units reserved for this version, used if `min` and `max` are not provided 

&nbsp;&nbsp;&nbsp;&nbsp;`min` (Optional, number) The minimum number of auto-scaled concurrency units to reserve, if either `min` or `max` is provided, autoscaling is enabled

&nbsp;&nbsp;&nbsp;&nbsp;`max` (Optional, number) The maximum number of auto-scaled concurrency units to reserve, if either `min` or `max` is provided, autoscaling is enabled

---

### Accessing attributes

`aws_function.{name}` points to the [aws_lambda_function](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_function#attributes-reference)
