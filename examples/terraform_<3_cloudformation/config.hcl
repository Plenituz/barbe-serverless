template {
  manifest = "https://raw.githubusercontent.com/Plenituz/barbe-serverless/main/manifest.json"
  # in case of debugging, break glass
  # manifest = "./local_manifest.json"
}

default {
  name_prefix = ["tf-heart-cf-"]
}

state_store {
  s3 {}
}


