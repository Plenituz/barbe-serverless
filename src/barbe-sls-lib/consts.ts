export const AWS_S3 = 'aws_s3'
export const AWS_FUNCTION = 'aws_function'
export const EVENT_S3 = 'event_s3'
export const EVENT_DYNAMODB_STREAM = 'event_dynamodb_stream'
export const AWS_DYNAMODB = 'aws_dynamodb'
export const AWS_KINESIS_STREAM = 'aws_kinesis_stream'
export const AWS_IAM_LAMBDA_ROLE = 'aws_iam_lambda_role'
export const AWS_FARGATE_TASK = 'aws_fargate_task'
export const AWS_FARGATE_SERVICE = 'aws_fargate_service'
export const AWS_NETWORK = 'aws_network'
export const STATE_STORE = 'state_store'
export const FOR_EACH = 'for_each'
export const TERRAFORM_EXECUTE = 'terraform_execute'
export const TERRAFORM_EXECUTE_GET_OUTPUT = 'terraform_execute_get_output'
export const TERRAFORM_EMPTY_EXECUTE = 'terraform_empty_execute'
export const GIT_CLONE = 'git_clone'

const BARBE_SLS_VERSION = 'v0.2.3'
export const TERRAFORM_EXECUTE_URL = `barbe-serverless/terraform_execute.js:${BARBE_SLS_VERSION}`
export const AWS_NETWORK_URL = `barbe-serverless/aws_network.js:${BARBE_SLS_VERSION}`