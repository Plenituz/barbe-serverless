# aws_kinesis_stream

Provide a Kinesis data stream. The main advantages of using this construct instead of a `aws_kinesis_stream` resource is the interaction with the `aws_dynamodb` and `aws_iam_lambda_role` constructs.

Credit: Some of this documentation is inspired from these pages:
- [AWS Kinesis stream](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/kinesis_stream)

---

### Example usage

#### A basic kinesis stream
```hcl
aws_kinesis_stream "my-stream" {}
```

---

### Argument reference

`region`: (Optional, string) The region in which to create the resources

`copy_from`: (Optional, string) Name of the `default` block to inherit from, if not provided the unnamed `default` block is used

`name_prefix`: (Optional, string) Prefix appended to the resource names

`shard_count`: (Optional, integer) The number of shards that the stream will use. If the stream_mode is "PROVISIONED"

`retention_period`: (Optional, integer) Length of time data records are accessible after they are added to the stream

`shard_level_metrics`: (Optional, list) A list of shard-level CloudWatch metrics which can be enabled for the stream

`enforce_consumer_deletion`: (Optional, boolean) A boolean that indicates all registered consumers should be deregistered from the stream so that the stream can be destroyed without error

`encryption_type`: (Optional, string) The encryption type to use. The only acceptable values are "NONE" or "KMS"

`kms_key_id`: (Optional, string) The GUID for the customer-managed KMS key to use for encryption. You can also use a Kinesis-owned master key by specifying the alias "alias/aws/kinesis"

`stream_mode`: (Optional, string) pecifies the capacity mode of the stream. Must be either "PROVISIONED" or "ON_DEMAND"

---

### Accessing attributes

`aws_kinesis_stream.{name}` points to the [aws_kinesis_stream](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/kinesis_stream#attributes-reference)
