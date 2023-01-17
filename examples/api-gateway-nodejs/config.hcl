template {
  manifest = "../../manifest.json"
}

default {
  package {
    include = ["dist/build.js"]
    file_map = {
      "dist/*" = "*"
    }
  }
  name_prefix = ["${env.STAGE}-user-api-"]
  environment {
    USERS_TABLE = aws_dynamodb.users.name
  }

  runtime     = "nodejs16.x"
  memory_size = 128
  timeout     = 30
}

state_store {
  s3 {}
}

aws_function "get-user" {
  handler = "build.getUser"
}

aws_function "post-user" {
  handler = "build.storeUser"
}

aws_dynamodb "users" {
  auto_scaling {
    min = 1
    max = 10
  }

  hash_key = "userId"
}

aws_http_api "user-api" {
  domain {
    name = "${env.STAGE}-users.${env.BASE_DOMAIN}"
  }

  route "GET /user" {
    aws_function = aws_function.get-user
  }
  route "POST /user" {
    aws_function = aws_function.post-user
  }
}