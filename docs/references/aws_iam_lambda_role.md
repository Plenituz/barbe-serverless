# aws_iam_lambda_role

Provide an IAM role that can be assumed by the Lambda function and/or a Fargate task (depending on which is defined in your template).
The IAM role comes pre-populated with full access to all the Barbe-serverless resources used in your project. You can add additional permissions to the role if needed.

Even if not declared, a default role is created and used for all Lambda function and Fargate tasks in your project unless overridden.

You can always declare a completely new `aws_iam_role` resource from scratch to not have all the pre-populated permissions.

---

### Example usage

#### Adding permissions to the default role
```hcl
aws_iam_lambda_role {
  statements = [
    {
      Action: "cognito-idp:*",
      Effect: "Allow",
      Resource: "*"
    }
  ]
}
```

#### Declaring a new role and using it for a Lambda function
```hcl
aws_iam_lambda_role "my-other-role" {
  // this still comes pre-populated with the access to your resources
}

aws_function "my-function" {
  role = aws_iam_lambda_role.my-other-role.arn
}
```

---

### Argument reference

`name_prefix`: (Optional, string) Prefix appended to the resource names

`assumable_by`: (Optional, string or list of string) List (or single value) of principals that can assume the role, will be added in addition to the default "lambda.amazonaws.com" or/and "ecs-tasks.amazonaws.com"

`statements`: (Optional, list of objects) List of IAM statements to add to the role, in the IAM policy format

---

### Accessing attributes

`aws_iam_lambda_role.{name}` points to the [aws_iam_role](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_role#attributes-reference)
