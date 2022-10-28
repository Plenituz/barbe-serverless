local barbe = std.extVar("barbe");
local env = std.extVar("env");
local container = std.extVar("container");

barbe.databags([
//    {
//        Type: "buildkit_run_in_container",
//        Name: "terraform_apply_" + bag.Name,
//        Value: {
//            require_confirmation: !std.objectHas(container, "cr_[terraform]"),
//            message:
//                if !std.objectHas(container, "cr_[terraform]") then
//                    "WARNING: using `barbe apply` without an external backend for terraform (such as state_store) WILL lead to your terraform state being lost if the terraform template fails to apply. Run terraform apply anyway? [yes/no]\n"
//                else
//                    "Applying Terraform plan, stopping the process now can lead to orphan resources"
//                ,
//            no_cache: true,
//            dockerfile: |||
//               FROM hashicorp/terraform:%(tf_version)s
//               COPY --from=src ./%(output_dir)s /src
//               WORKDIR /src
//
//               ENV GOOGLE_OAUTH_ACCESS_TOKEN="%(gcp_access_token)s"
//
//               ENV AWS_ACCESS_KEY_ID="%(aws_access_key_id)s"
//               ENV AWS_SECRET_ACCESS_KEY="%(aws_secret_access_key)s"
//               ENV AWS_SESSION_TOKEN="%(aws_session_token)s"
//               ENV AWS_REGION="%(aws_region)s"
//
//               RUN terraform init -input=false
//               RUN terraform apply -auto-approve -input=false %(extra_args)s
//
//               # if a tf backend is defined, this file wont be created,
//               # but buildkit will still try to export it, so we create it here
//               RUN touch terraform.tfstate
//            ||| % {
//                tf_version: "latest",
//                output_dir: std.extVar("barbe_output_dir"),
//
//                local gcpAccessToken =
//                    if std.get(std.get(container, "gcp_token", {}), "terraform_credentials", null) != null then
//                        barbe.asStr(barbe.asVal(container.gcp_token.terraform_credentials[0].Value).access_token)
//                    else
//                        ""
//                ,
//                local awsCredentials =
//                    if std.get(std.get(container, "aws_credentials", {}), "terraform_credentials", null) != null then
//                        barbe.asVal(container.aws_credentials.terraform_credentials[0].Value)
//                    else
//                        {
//                            access_key_id: "",
//                            secret_access_key: "",
//                            session_token: "",
//                        }
//                ,
//                gcp_access_token: gcpAccessToken,
//                aws_access_key_id: barbe.asStr(awsCredentials.access_key_id),
//                aws_secret_access_key: barbe.asStr(awsCredentials.secret_access_key),
//                aws_session_token: barbe.asStr(awsCredentials.session_token),
//                aws_region: std.get(env, "AWS_REGION", "us-east-1"),
//                extra_args:
//                    if std.objectHas(container, "terraform_variable_value") then
//                        std.join(" ", [
//                            '-var="' + key + '=' + barbe.asStr(container.terraform_variable_value[key][0].Value) + '"'
//                            for key in std.objectFields(container.terraform_variable_value)
//                        ])
//                    else
//                        ""
//                    ,
//
//            },
//            exported_files: [
//                "terraform.tfstate",
//                ".terraform.lock.hcl",
//                ".terraform",
//            ],
//        }
//    },
    barbe.iterateBlocks(container, "terraform_execute", function(bag)
        local block = barbe.asVal(bag.Value);
        local mode = barbe.asStr(std.get(block, "mode", barbe.asSyntax("apply")));
        assert mode == "apply" || mode == "destroy": "terraform_execute mode must be either 'apply' or 'destroy'";
        {
            Type: "buildkit_run_in_container",
            Name: "terraform_" + mode + "_" + bag.Name,
            Value: {
                require_confirmation: std.get(block, "require_confirmation", null),
                message: std.get(block, "message", null),
                no_cache: std.get(block, "no_cache", null),
                dockerfile: |||
                   FROM hashicorp/terraform:%(tf_version)s
                   RUN apk add jq

                   COPY --from=src ./%(dir)s /src
                   WORKDIR /src

                   ENV GOOGLE_OAUTH_ACCESS_TOKEN="%(gcp_access_token)s"

                   ENV AWS_ACCESS_KEY_ID="%(aws_access_key_id)s"
                   ENV AWS_SECRET_ACCESS_KEY="%(aws_secret_access_key)s"
                   ENV AWS_SESSION_TOKEN="%(aws_session_token)s"
                   ENV AWS_REGION="%(aws_region)s"

                   RUN terraform init -input=false
                   RUN terraform %(command)s -auto-approve -input=false %(extra_args)s
                   RUN terraform output -json > terraform_output.json
                   RUN cat terraform_output.json | jq 'to_entries | map({ "key": .key, "value": .value.value })' > terraform_output_%(id)s.json

                   %(tail_end)s
                ||| % {
                    tf_version: "latest",
                    id: bag.Name,
                    dir: barbe.asStr(block.dir),
                    command: mode

                    local gcpAccessToken =
                        if std.get(std.get(container, "gcp_token", {}), "terraform_credentials", null) != null then
                            barbe.asStr(barbe.asVal(container.gcp_token.terraform_credentials[0].Value).access_token)
                        else
                            ""
                    ,
                    local awsCredentials =
                        if std.get(std.get(container, "aws_credentials", {}), "terraform_credentials", null) != null then
                            barbe.asVal(container.aws_credentials.terraform_credentials[0].Value)
                        else
                            {
                                access_key_id: "",
                                secret_access_key: "",
                                session_token: "",
                            }
                    ,
                    gcp_access_token: gcpAccessToken,
                    aws_access_key_id: barbe.asStr(awsCredentials.access_key_id),
                    aws_secret_access_key: barbe.asStr(awsCredentials.secret_access_key),
                    aws_session_token: barbe.asStr(awsCredentials.session_token),
                    aws_region: std.get(env, "AWS_REGION", "us-east-1"),
                    extra_args:
                        if std.objectHas(block, "variable_values") then
                            std.join(" ", [
                                '-var="' + barbe.asStr(pair.key) + '=' + barbe.asStr(pair.value) + '"'
                                for pair in barbe.asValArrayConst(block.variable_values)
                            ])
                        else
                            ""
                        ,
                    tail_end:
                        if mode == "destroy" then
                            "RUN touch tmp"
                        else
                            |||
                                # if a tf backend is defined, this file wont be created,
                                # but buildkit will still try to export it, so we create it here
                                RUN touch terraform.tfstate
                            |||
                        ,
                },
                read_back:
                    if mode == "apply" then
                        "terraform_output_" + bag.Name + ".json"
                    else
                        null
                    ,
                exported_files:
                    if mode == "destroy" then
                        "tmp"
                    else
                        [
                            "terraform.tfstate",
                            ".terraform.lock.hcl",
                            ".terraform",
                            "terraform_output_" + bag.Name + ".json"
                        ]
                    ,
            }
        }
])