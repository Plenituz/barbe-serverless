local barbe = std.extVar("barbe");
local env = std.extVar("env");
local container = std.extVar("container");


assert std.objectHas(container, "aws_credentials") : "No AWS credentials found";
assert std.objectHas(container.aws_credentials, "terraform_credentials") : "No AWS credentials found with name 'terraform_credentials', most likely the manifest has been tampered with";
local awsCredentials = barbe.asVal(container.aws_credentials.terraform_credentials[0].Value);

barbe.databags([
    {
        Type: "buildkit_run_in_container_apply",
        Name: "terraform_apply",
        Value: {
            require_confirmation: !std.objectHas(container, "cr_[terraform]"),
            message:
                if !std.objectHas(container, "cr_[terraform]") then
                    "WARNING: using `barbe apply` without an external backend for terraform (such as state_store) WILL lead to your terraform state being lost if the terraform template fails to apply. Run terraform apply anyway? [yes/no]\n"
                else
                    "Applying Terraform plan, stopping the process now can lead to orphan resources"
                ,
            no_cache: true,
            dockerfile: |||
               FROM hashicorp/terraform:%(tf_version)s
               COPY --from=src ./ /src
               WORKDIR /src/%(output_dir)s

               ENV AWS_ACCESS_KEY_ID="%(access_key_id)s"
               ENV AWS_SECRET_ACCESS_KEY="%(secret_access_key)s"
               ENV AWS_SESSION_TOKEN="%(session_token)s"
               ENV AWS_REGION="%(aws_region)s"

               RUN terraform init -input=false
               RUN terraform apply -auto-approve -input=false

               # if a tf backend is defined, this file wont be created,
               # but buildkit will still try to export it, so we create it here
               RUN touch terraform.tfstate
            ||| % {
                tf_version: "latest",
                output_dir: std.extVar("barbe_output_dir"),
                access_key_id: barbe.asStr(awsCredentials.access_key_id),
                secret_access_key: barbe.asStr(awsCredentials.secret_access_key),
                session_token: barbe.asStr(awsCredentials.session_token),
                aws_region: std.get(env, "AWS_REGION", "us-east-1"),
            },
            exported_files: [
                "terraform.tfstate",
                ".terraform.lock.hcl",
                ".terraform",
            ],
        }
    }
])