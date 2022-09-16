
data "archive_file" "handler_code" {
    type = "zip"
    source_file = "bin/put_file"
    output_path = "put_file.zip"
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
data "aws_partition" "current" {}

resource "aws_iam_role" "lambda_exec_role" {
    name = "my-lambda-role"

    assume_role_policy = jsonencode({
        Version = "2012-10-17"
        Statement = [
            {
                Action = "sts:AssumeRole"
                Effect = "Allow"
                Sid    = ""
                Principal = {
                    Service = "lambda.amazonaws.com"
                }
            },
        ]
    })

    inline_policy {
        name = "my_inline_policy"

        policy = jsonencode({
            Version = "2012-10-17"
            Statement = [
                {
                    Action = [
                        "logs:CreateLogStream",
                        "logs:CreateLogGroup",
                    ]
                    Effect   = "Allow"
                    Resource = [
                        "arn:${data.aws_partition.current.partition}:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/my-lambda*:*",
                    ]
                },
                {
                    Action = [
                        "logs:PutLogEvents"
                    ]
                    Effect   = "Allow"
                    Resource = [
                        "arn:${data.aws_partition.current.partition}:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/my-lambda*:*",
                    ]
                },
                {
                    Action = [
                        "s3:*"
                    ]
                    Effect   = "Allow"
                    Resource = "arn:aws:s3:::${cloudformation("tf-heart-cf").output.S3Bucket}*"
                }
            ]
        })
    }
}

resource "aws_lambda_function" "handler_lambda" {
    depends_on = [aws_cloudwatch_log_group.handler_logs]
    filename = "put_file.zip"
    function_name = "my-lambda"
    role = aws_iam_role.lambda_exec_role.arn
    handler = "put_file"
    runtime = "go1.x"
    memory_size = 128
    timeout = 900
    publish = true
    environment {
        variables = {
            S3_BUCKET = cloudformation("tf-heart-cf").output.S3Bucket
        }
    }
    source_code_hash = data.archive_file.handler_code.output_base64sha256
}

resource "aws_cloudwatch_log_group" "handler_logs" {
    name = "/aws/lambda/my-lambda"
    retention_in_days = 30
}