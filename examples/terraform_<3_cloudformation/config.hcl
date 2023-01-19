template {
  manifest = "../../manifest.json"
}

default {
  name_prefix = ["tf-heart-cf-"]
}

state_store {
  s3 {}
}


