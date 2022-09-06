# aws_http_api

Provides all the resources needed to create an AWS HTTP API Gateway

Credit: Some of this documentation is inspired from these pages:
 - [API gateway V2 stage](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/apigatewayv2_stage)
 - [AWS API gateway V2 authorizer](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/apigatewayv2_authorizer)
 - [AWS API gateway V2 domain name](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/apigatewayv2_domain_name)

Related links:
- event_http_api block on [aws_function](./aws_function.md)

Note: If your projects only uses 1 aws_http_api, you can omit the name. Additionally, all event_http_api that do not have a reference to a aws_http_api will be added to the default unnamed aws_http_api.

```hcl
# unnamed http api
aws_http_api {
  //...
}

# named http api
aws_http_api "my-api" {
  //...
}
```

---

### Example usage

#### Using the unnamed aws_http_api
```hcl
aws_http_api {
  access_logs {}
  domain {
    name = "api.example.com"
  }

  route "ANY /{proxy+}" {
    aws_function = aws_function.leftover-routes
  }
}

aws_function "leftover-routes" {
  //...
}

aws_function "get-profile" {
  event_http_api "GET /profile" {}
}
```

#### Using a named aws_http_api
```hcl
aws_http_api "app-api" {
  access_logs {}
  domain {
    name = "app-api.example.com"
    certificate_domain = "*.example.com"
  }
  cors_enabled = true
}
aws_function "get-profile" {
  event_http_api "GET /profile" {
    aws_http_api = aws_http_api.app-api
  }
}
```

#### APIs with authorizers
```hcl
aws_http_api "app-api" {
  jwt_authorizer "my-jwt-authorizer" {
    audience = ["example"]
    issuer   = "https://${aws_cognito_user_pool.example.endpoint}"
  }
  
  route "ANY /{proxy+}" {
    authorizer = jwt_authorizer.my-jwt-authorizer
    aws_function = aws_function.all-routes
  }
}

aws_http_api "admin-api" {
  lambda_authorizer "my-custom-authorizer" {
    aws_function = aws_function.my-custom-auth
  }

  route "ANY /{proxy+}" {
    authorizer = lambda_authorizer.my-custom-authorizer
    aws_function = aws_function.all-routes
  }
}
```

### Argument reference

`region`: (Optional, string) The region in which to create the resources

`copy_from`: (Optional, string) Name of the `default` block to inherit from, if not provided the unnamed `default` block is used

`name_prefix`: (Optional, string) Prefix appended to the resource names

`description`: (Optional, string) A description of the API

`disable_execute_api_endpoint`: (Optional, boolean) Whether clients can invoke the API by using the default execute-api endpoint, defaults to true if a `domain` is provided, false otherwise

`cors_enabled`: (Optional, boolean) If true, equivalent to having an empty cors_configuration block, meaning CORS is enabled with all the default settings

`cors_configuration`: (Optional, block) The cross-origin resource sharing (CORS) configuration

`stage_name`: (Optional, string) Custom name for the name of the stage, defaults to "$default"

`detailed_metrics_enabled`: (Optional, boolean) Whether detailed metrics are enabled for the routes, can be overridden on a per-route basis

`throttling_burst_limit`: (Optional, integer) The throttling burst limit for the routes, defaults to 5000, can be overridden on a per-route basis

`throttling_rate_limit`: (Optional, integer) The throttling rate limit for the routes, defaults to 10000, can be overridden on a per-route basis

`access_logs`: (Optional, block) Configuration for the access logs, if the block is present, the access logs are enabled

`route`: (Optional, blocks) List of routes, each block's label is the route key

`jwt_authorizer`: (Optional, blocks) List of JWT authorizer, each block's label is the name of the authorizer

`lambda_authorizer`: (Optional, blocks) List of Lambda authorizer, each block's label is the name of the authorizer

`domain`: (Optional, block) The domain name configuration

---

`access_logs` block attributes:

&nbsp;&nbsp;&nbsp;&nbsp;`destination_arn` (Optional, string) ARN of the destination to send the access logs to, by default a CloudWatch log group is created and used as the destination

&nbsp;&nbsp;&nbsp;&nbsp;`retention_in_days` (Optional, integer) The number of days the access logs are kept, defaults to 30

&nbsp;&nbsp;&nbsp;&nbsp;`format` (Optional, string) The format of the logs, defaults to:
```json
{"requestId":"$context.requestId","extendedRequestId":"$context.extendedRequestId","ip":"$context.identity.sourceIp","caller":"$context.identity.caller","user":"$context.identity.user","requestTime":"$context.requestTime","httpMethod":"$context.httpMethod","resourcePath":"$context.resourcePath","status":"$context.status","protocol":"$context.protocol","responseLength":"$context.responseLength","errorMessage":"$context.error.message","errorResponseType":"$context.error.responseType","errorMessageString":$context.error.messageString}
```


---

`route` block attributes:

&nbsp;&nbsp;&nbsp;&nbsp;`aws_function` (Required, reference) Reference to the aws_function resource that will be invoked

&nbsp;&nbsp;&nbsp;&nbsp;`detailed_metrics_enabled` (Optional, boolean) Whether detailed metrics are enabled for the route

&nbsp;&nbsp;&nbsp;&nbsp;`logging_level` (Optional, string) Affects the log entries pushed to Amazon CloudWatch Logs. Valid values: "ERROR", "INFO", "OFF".

&nbsp;&nbsp;&nbsp;&nbsp;`throttling_burst_limit` (Optional, integer) The throttling burst limit for the route, defaults to either the `throttling_burst_limit` on the aws_http_api resource or 5000 if not set

&nbsp;&nbsp;&nbsp;&nbsp;`throttling_rate_limit` (Optional, integer) The throttling rate limit for the route, defaults to either the `throttling_rate_limit` on the aws_http_api resource or 10000 if not set

&nbsp;&nbsp;&nbsp;&nbsp;`authorizer` (Optional, reference) Reference to either a `jwt_authorizer` or `lambda_authorizer` declared on the aws_http_api resource
```hcl
route "GET /profile" {
    authorizer = jwt_authorizer.my-jwt-authorizer
}
route "GET /profile" {
  authorizer = lambda_authorizer.my-custom-authorizer
}
```

&nbsp;&nbsp;&nbsp;&nbsp;`payload_format_version` (Optional, string) The format of the payload sent to the Lambda function, defaults to "2.0"

&nbsp;&nbsp;&nbsp;&nbsp;`timeout_milliseconds` (Optional, number) The timeout of the HTTP request in milliseconds, defaults to 30000


---

`jwt_authorizer` block attributes:

&nbsp;&nbsp;&nbsp;&nbsp;`identity_sources` (Optional, list of strings) List of identity sources to be used for the authorizer, defaults to `["$request.header.Authorization"]`  

&nbsp;&nbsp;&nbsp;&nbsp;`audience` (Optional, list of strings) A list of the intended recipients of the JWT. A valid JWT must provide an aud that matches at least one entry in this list.  

&nbsp;&nbsp;&nbsp;&nbsp;`issuer` (Optional, string) The base domain of the identity provider that issues JSON Web Tokens, such as the endpoint attribute of the aws_cognito_user_pool resource.  


---

`lambda_authorizer` block attributes:

&nbsp;&nbsp;&nbsp;&nbsp;`aws_function` (Required, reference) Reference to the aws_function resource that will be invoked

&nbsp;&nbsp;&nbsp;&nbsp;`identity_sources` (Optional, list of strings) A list of one or more mapping expressions of the specified request parameters, defaults to `["$request.header.Authorization"]`

&nbsp;&nbsp;&nbsp;&nbsp;`result_ttl_in_seconds` (Optional, list of strings) The time to live (TTL) for cached authorizer results, in seconds. If it equals 0, authorization caching is disabled. If it is greater than 0, API Gateway caches authorizer responses. The maximum value is 3600, or 1 hour.

&nbsp;&nbsp;&nbsp;&nbsp;`payload_format_version` (Optional, string) The format of the payload sent to the Authorizer Lambda function, defaults to "2.0"

&nbsp;&nbsp;&nbsp;&nbsp;`enable_simple_responses` (Optional, boolean) Whether the authorizer returns a response in a simple format. If enabled, the Lambda can return a boolean value instead of an IAM policy


---

`domain` block attributes:

&nbsp;&nbsp;&nbsp;&nbsp;`name` (Required, string) The domain name to be associated with the API

&nbsp;&nbsp;&nbsp;&nbsp;`certificate_domain` (Optional, string) Domain name of an existing ACM certificate on your AWS account, if not provided a new certificate is created and validated using DNS validation 

&nbsp;&nbsp;&nbsp;&nbsp;`certificate_arn` (Optional, string) The ARN of the certificate to be used for the domain name, overrides both `certificate_domain` if provided

&nbsp;&nbsp;&nbsp;&nbsp;`zone` (Sometimes required, string) The zone of the domain name, required if Barbe-serverless cannot determine the zone from the domain name

&nbsp;&nbsp;&nbsp;&nbsp;`endpoint_type` (Optional, string) The endpoint type of the domain name, defaults to "REGIONAL" (currently only "REGIONAL" is supported)

&nbsp;&nbsp;&nbsp;&nbsp;`security_policy` (Optional, string) The security policy of the domain name, defaults to "TLS_1_2" (currently only "TLS_1_2" is supported)

&nbsp;&nbsp;&nbsp;&nbsp;`ownership_verification_certificate_arn` (Optional, string) ARN of the AWS-issued certificate used to validate custom domain ownership (when `certificate_arn` is issued via an ACM Private CA)

---

### Accessing attributes

`aws_http_api.{name}` points to the [aws_apigatewayv2_api](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/apigatewayv2_api#attributes-reference)
