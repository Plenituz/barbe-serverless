# aws_dynamodb

Provide a Global DynamoDB table with optionally:
- Auto scaling
- Global secondary indexes
- Replicas

A few notes on the default values:
- Hash/range keys are string type by default
- The table is in provisioned capacity mode with a read/write capacity of 1 by default
- If any aws_function block listens to the streams of this table or multi regions are provided, the streams will automatically be enabled

Important note for use with Kinesis streams:
If a lambda function defines a `event_dynamodb_stream` with type `kinesis` and it's `kinesis_stream` attribute is reference to an `aws_dynamodb` (`kinesis_stream = aws_dynamodb.my-table`), a Kinesis stream will be automatically created and used.
This stream is not customizable (due to being declared implicitly), it is therefore only useful for prototyping. 
We highly recommend to declare your own `aws_kinesis_stream` block and set `kinesis_stream = aws_kinesis_stream.my-stream` on the `aws_dynamodb` block instead.


Related links:
- event_dynamodb_stream block on [aws_function](./aws_function.md)

---

### Example usage

#### A basic table with auto-scaling, 2 indexes and TTL enabled
```hcl
aws_dynamodb "files-table" {
  auto_scaling {
    min = 10
    max = 100
  }

  hash_key = "fileId"
  ttl_key  = "ttl"

  global_secondary_index {
    hash_key = "location"
  }
  global_secondary_index {
    hash_key = "originType"
    range_key = "insertionTime"
    range_key_type = "N"
  }
}
```

#### A table and a lambda function listening to it's streams
```hcl
aws_dynamodb "files-table" {
  hash_key = "fileId"
}

aws_function "stream-handler" {
  event_dynamodb_stream {
    table      = aws_dynamodb.files-table
    batch_size = 100
  }
}
```

### A table with replicas in 3 different regions
```hcl
aws_dynamodb "request-log" {
  regions = ["us-east-1", "us-west-1", "us-west-2"]
  
  auto_scaling {
    //auto scaling is required for multi-region replicas
    min = 10
    max = 100
  }

  hash_key = "logId"
}
```

---

### Argument reference

`regions` or `region`: (Optional, list of strings or string) The list of regions (or single region) in which to create the table. If several regions are provided, auto scaling needs to be enabled for the replicas to be created.
If a list is given, the first element is the primary region and the rest are the replicas.

`copy_from`: (Optional, string) Name of the `default` block to inherit from, if not provided the unnamed `default` block is used

`name_prefix`: (Optional, string) Prefix appended to the bucket name

`billing_mode`: (Optional, string) DynamoDB billing mode. `PAY_PER_REQUEST` or `PROVISIONED`. Defaults to `PROVISIONED`

`read_capacity`: (Optional, number) The read capacity for the table. Defaults to 1

`write_capacity`: (Optional, number) The write capacity for the table. Defaults to 1

`hash_key`: (Required, string) The name of the hash key

`hash_key_type`: (Optional, string) The type of the hash key, "S" (string), "N" (number) or "B" (binary), default to "S"

`range_key`: (Optional, string) The name of the range key

`range_key_type`: (Optional, string) The type of the range key, "S" (string), "N" (number) or "B" (binary), default to "S"

`stream_enabled`: (Optional, boolean) Overrides the default stream enabled behavior. Setting this to false can prevent other resources from listening to the streams and break your build

`stream_view_type`: (Optional, string) The stream view type: "KEYS_ONLY", "NEW_IMAGE", "OLD_IMAGE" or "NEW_AND_OLD_IMAGES". Defaults to "NEW_AND_OLD_IMAGES"

`table_class`: (Optional, string) The table class: "STANDARD" or "STANDARD_INFREQUENT_ACCESS"

`ttl_key`: (Optional, string) The name of the TTL key, if defined TTL is enabled on the table.

`enable_point_in_time_recovery`: (Optional, boolean) Enable point in time recovery on the table

`kinesis_stream`: (Optional, reference to an object) The name of the Kinesis stream to send the streams to. example: `aws_kinesis_stream.my-stream`

`global_secondary_index`: (Optional, blocks) The list of global secondary indexes to create on the table

`auto_scaling`: (Optional, single block) auto-scaling attributes for the table


---

`global_secondary_index` attributes:

&nbsp;&nbsp;&nbsp;&nbsp;`hash_key`: (Required, string) The name of the hash key

&nbsp;&nbsp;&nbsp;&nbsp;`hash_key_type`: (Optional, string) The type of the hash key, "S" (string), "N" (number) or "B" (binary), default to "S"

&nbsp;&nbsp;&nbsp;&nbsp;`range_key`: (Optional, string) The name of the range key

&nbsp;&nbsp;&nbsp;&nbsp;`range_key_type`: (Optional, string) The type of the range key, "S" (string), "N" (number) or "B" (binary), default to "S"

&nbsp;&nbsp;&nbsp;&nbsp;`read_capacity`: (Optional, number) The read capacity for the table. Defaults to 1

&nbsp;&nbsp;&nbsp;&nbsp;`write_capacity`: (Optional, number) The write capacity for the table. Defaults to 1

&nbsp;&nbsp;&nbsp;&nbsp;`projection_type`: (Optional, string) The projection type: "KEYS_ONLY", "INCLUDE" or "ALL". Defaults to "ALL"

&nbsp;&nbsp;&nbsp;&nbsp;`auto_scaling`: (Optional, single block) auto-scaling attributes for the index, inherits the table's auto-scaling attributes if not defined


---

`auto_scaling` attributes:

&nbsp;&nbsp;&nbsp;&nbsp;`max`: (Optional, number) The max capacity for both read and write, can be individually overridden by `max_read` and `max_write`

&nbsp;&nbsp;&nbsp;&nbsp;`min`: (Optional, number) The min capacity for both read and write, can be individually overridden by `min_read` and `min_write`

&nbsp;&nbsp;&nbsp;&nbsp;`max_read`: (Optional, number) The max capacity for read, takes precedence over `max` if provided

&nbsp;&nbsp;&nbsp;&nbsp;`max_write`: (Optional, number) The max capacity for write, takes precedence over `max` if provided

&nbsp;&nbsp;&nbsp;&nbsp;`min_read`: (Optional, number) The min capacity for read, takes precedence over `min` if provided

&nbsp;&nbsp;&nbsp;&nbsp;`min_write`: (Optional, number) The min capacity for write, takes precedence over `min` if provided

&nbsp;&nbsp;&nbsp;&nbsp;`target_value`: (Optional, number) The target value for the auto-scaling policy, defaults to 80% of the desired capacity. Can be individually overridden by `target_value_read` and `target_value_write`

&nbsp;&nbsp;&nbsp;&nbsp;`target_value_read`: (Optional, number) The target value for the auto-scaling policy for read, takes precedence over `target_value` if provided

&nbsp;&nbsp;&nbsp;&nbsp;`target_value_write`: (Optional, number) The target value for the auto-scaling policy for write, takes precedence over `target_value` if provided


---

### Accessing attributes

`aws_dynamodb.{name}` points to the [aws_dynamodb_table](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/dynamodb_table#attributes-reference)
