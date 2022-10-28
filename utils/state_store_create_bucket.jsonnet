local barbe = std.extVar("barbe");
local env = std.extVar("env");
local container = std.extVar("container");
local globalDefaults = barbe.compileDefaults(container, "");

assert std.objectHas(container, "aws_credentials") : "No AWS credentials found";
assert std.objectHas(container.aws_credentials, "terraform_credentials") : "No AWS credentials found with name 'terraform_credentials', most likely the manifest has been tampered with";
local awsCredentials = barbe.asVal(container.aws_credentials.terraform_credentials[0].Value);


barbe.databags([
    barbe.iterateBlocks(container, "state_store", function(bag)
        local block = barbe.asVal(bag.Value);
        local labels = barbe.flatten([bag.Name, bag.Labels]);
        local blockDefaults = barbe.makeBlockDefault(container, globalDefaults, block);
        local fullBlock = barbe.asVal(barbe.mergeTokens([barbe.asSyntax(blockDefaults), bag.Value]));
        local namePrefix = barbe.concatStrArr(std.get(fullBlock, "name_prefix", barbe.asSyntax([""])));
        local dotS3 = barbe.asVal(barbe.mergeTokens(std.get(fullBlock, "s3", barbe.asSyntax([])).ArrayConst));

        if std.objectHas(fullBlock, "s3") then
            local madeBucketName = barbe.asStr(barbe.appendToTemplate(namePrefix, [barbe.asSyntax("state-store")]));
            [
                if !std.objectHas(dotS3, "existing_bucket") then
                    {
                        Type: "buildkit_run_in_container",
                        Name: "s3_bucket_creator_" + madeBucketName,
                        Value: {
                            message: "Storing terraform state in S3 bucket '" + madeBucketName + "'",
                            no_cache: true,
                            dockerfile: |||
                                FROM amazon/aws-cli:%(aws_cli_version)s

                                ENV AWS_ACCESS_KEY_ID="%(access_key_id)s"
                                ENV AWS_SECRET_ACCESS_KEY="%(secret_access_key)s"
                                ENV AWS_SESSION_TOKEN="%(session_token)s"
                                ENV AWS_REGION="%(aws_region)s"
                                ENV AWS_PAGER=""

                                RUN aws s3api create-bucket --bucket %(bucket_name)s --output json || true
                            ||| % {
                                //TODO version selection
                                aws_cli_version: "latest",
                                access_key_id: barbe.asStr(awsCredentials.access_key_id),
                                secret_access_key: barbe.asStr(awsCredentials.secret_access_key),
                                session_token: barbe.asStr(awsCredentials.session_token),
                                aws_region: std.get(env, "AWS_REGION", "us-east-1"),
                                bucket_name: madeBucketName,
                            },
                        }
                    }
                else
                    []
                ,
            ]
        else
            []
        ,
    ),
])