# state_store

State store is a block that facilitates creating and using a cloud storage solution as your terraform and barbe state store.
- Using this block will automatically configure terraform to use the bucket as your state store using `terraform.backend`
- The bucket can be automatically created, or an existing one can be used
- The created bucket is not part of any template or cloudformation stack, so it'll never be automatically deleted

This block supports both S3 and GCS (Google Cloud Storage)

---

### Example usage

#### A basic state_store using AWS S3, this will create a new bucket and use it as the state store
```hcl
state_store {
  s3 {}
}
```

#### Using an existing S3 bucket as the state store
```hcl
state_store {
  s3 {
    existing_bucket = "my-bucket"
    prefix = "${env.SERVICE_NAME}/"
  }
}
```

#### Specifying the region on state file key
```hcl
state_store {
  s3 {
    key = "${env.STAGE}.tfstate"
    region = "us-west-1"
  }
}
```

#### A basic state_store using GCS, this will create a new bucket and use it as the state store
```hcl
state_store {
  gcs {}
}
```

#### Using an existing GCP bucket as the state store
```hcl
state_store {
  gcs {
    existing_bucket = "my-bucket"
    prefix = "${env.SERVICE_NAME}/"
  }
}
```

---

### Argument reference

`region`: (Optional, string) The region in which to create the resources, also used as the region field for the `terraform.backend` block. If using `existing_bucket`, this must be the region of the bucket.

`copy_from`: (Optional, string) Name of the `default` block to inherit from, if not provided the unnamed `default` block is used

`name_prefix`: (Optional, string) Prefix appended to the resource names

`s3`: (Optional, block) S3 state store configuration

`gcs`: (Optional, block) GCS state store configuration


---

### S3 block reference

`existing_bucket`: (Optional, string) Name of an existing bucket to use as the state store. You will want to also specify the `region` if using an existing bucket. If not provided, a new bucket will be created 

`prefix`: (Optional, string) Prefix prepended to the state file key name on S3

`key`: (Optional, string) Name of the state file key on S3


---

### GCS block reference

`existing_bucket`: (Optional, string) Name of an existing bucket to use as the state store. You will want to also specify the `region` if using an existing bucket. If not provided, a new bucket will be created

`prefix`: (Optional, string) Prefix prepended to the state file key name on GCS

`key`: (Optional, string) Name of the state file key on GCS