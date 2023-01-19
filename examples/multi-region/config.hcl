template {
  manifest = "../../manifest.json"
}

default {
  # default region for single region resources
  region = default.regions[0]
  # used by for_each and aws_dynamodb which supports multi region with replicas
  regions = ["us-west-1", "eu-west-3", "ap-northeast-2"]
  package {
    exclude  = ["barbe_dist/*"]
    file_map = {
      "bin/*" = "handler"
    }
  }
  name_prefix = ["${env.STAGE}-task-runner-"]
  environment {
    LOG_TABLE_NAME = aws_dynamodb.request-log.name
  }

  runtime     = "go1.x"
  handler     = "handler"
  memory_size = 128
  timeout     = 30
}

state_store {
  s3 {}
}

aws_function "request-log-stream-handler" {
  package {
    include = ["bin/ddb_lambda"]
  }

  event_dynamodb_stream {
    table = aws_dynamodb.request-log
    batch_size = 1
  }
}

aws_dynamodb "request-log" {
  auto_scaling {
    min = 1
    max = 10
  }

  hash_key = "logId"
  ttl_key  = "ttl"

  global_secondary_index {
    hash_key = "originType"
    range_key = "insertionTime"
    range_key_type = "N"
  }
  global_secondary_index {
    hash_key = "eventDetails"
  }
  global_secondary_index {
    hash_key = "aya"
  }
}

for_each "regions" {

  aws_http_api "global-api-$${each.key}" {
    region = each.key
    access_logs {}
    cors_enabled = true
    domain {
      name = "global-${each.key}.${env.BASE_DOMAIN}"
    }

    route "ANY /{proxy+}" {
      aws_function = aws_function["global-${each.key}"]
    }
  }

  aws_function "global-$${each.key}" {
    region = each.key
    package {
      include = ["bin/http_lambda"]
    }
    environment {
      GENERATED_REGION = each.key
      RUN_TASK_PAYLOAD = aws_fargate_task["global-task-${each.key}"].run_task_payload
    }
  }

  aws_fargate_task "global-task-$${each.key}" {
    region = each.key

    package {
      include = ["bin/fargate"]
    }
    docker {
      entrypoint = "./handler"
      runtime = "go"
      use_sudo = true
    }
  }
}