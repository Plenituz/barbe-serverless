local barbe = std.extVar("barbe");
local env = std.extVar("env");
local container = std.extVar("container");
local globalDefaults = barbe.compileDefaults(container, "");
local state = std.extVar("state");

local isSimpleTemplate(token) =
    if std.isString(token) || token.Type == "literal_value" then
        true
    else if token == null || token.Type != "template" then
        false
    else
        !std.member([
            if part.Type == "literal_value" then
                true
            else if part.Type == "template" then
                isSimpleTemplate(part)
            else
                false
            for part in token.Parts
        ], false)
    ;

local steps = [
    function(container) barbe.databags([
        barbe.iterateBlocks(container, "state_store", function(bag)
            local block = barbe.asVal(bag.Value);
            local labels = barbe.flatten([bag.Name, bag.Labels]);
            local blockDefaults = barbe.makeBlockDefault(container, globalDefaults, block);
            local fullBlock = barbe.asVal(barbe.mergeTokens([barbe.asSyntax(blockDefaults), bag.Value]));
            local namePrefix = barbe.concatStrArr(std.get(fullBlock, "name_prefix", barbe.asSyntax([""])));
            local dotS3 = barbe.asVal(barbe.mergeTokens(std.get(fullBlock, "s3", barbe.asSyntax([])).ArrayConst));
            local bucketNameTemplate = barbe.appendToTemplate(namePrefix, [barbe.asSyntax("state-store")]);

            //if there is an env var or something in the name, this component might get called before the env var was baked in
            if !isSimpleTemplate(bucketNameTemplate) then
                //TODO message + delete message if found?
                //cause right now this will just fail silently if the user put a dynamic value in the bucket name
                null
            else if std.objectHas(fullBlock, "s3") then
                local madeBucketName = barbe.asStr(bucketNameTemplate);
                {
                    Name: "",
                    Type: "cr_[terraform]",
                    Value: {
                        backend: barbe.asBlock([{
                            labels: ["s3"],
                            bucket: std.get(dotS3, "existing_bucket", madeBucketName),
                            key: barbe.appendToTemplate(
                                std.get(dotS3, "prefix", barbe.asSyntax("")),
                                [std.get(dotS3, "key", barbe.appendToTemplate(namePrefix, [barbe.asSyntax("state.tfstate")]))]
                            ),
                            region: std.get(dotS3, "region", "us-east-1")
                        }])
                    }
                }
            else if std.objectHas(fullBlock, "gcs") then
                local madeBucketName = barbe.asStr(bucketNameTemplate);
                {
                    Name: "",
                    Type: "cr_[terraform]",
                    Value: {
                        backend: barbe.asBlock([{
                            labels: ["gcs"],
                            bucket: std.get(dotS3, "existing_bucket", madeBucketName),
                            prefix: barbe.appendToTemplate(
                                std.get(dotS3, "prefix", barbe.asSyntax("")),
                                [std.get(dotS3, "key", barbe.appendToTemplate(namePrefix, [barbe.asSyntax("state.tfstate")]))]
                            ),
                        }])
                    }
                }
            else
                []
            ,
        ),
    ]),
    function(container) barbe.databags([
        {
            Name: "state_store_credentials",
            Type: "aws_credentials_request",
            Value: {}
        },
        {
            Name: "state_store_credentials",
            Type: "gcp_token_request",
            Value: {}
        },
    ]),
    function(container) barbe.databags([
        barbe.iterateBlocks(container, "state_store", function(bag)
            assert std.objectHas(container, "aws_credentials") : "No AWS credentials found";
            assert std.objectHas(container.aws_credentials, "state_store_credentials") : "No AWS credentials found with name 'state_store_credentials', something is seriously wrong";
            local awsCredentials = barbe.asVal(container.aws_credentials.state_store_credentials[0].Value);
            local block = barbe.asVal(bag.Value);
            local labels = barbe.flatten([bag.Name, bag.Labels]);
            local blockDefaults = barbe.makeBlockDefault(container, globalDefaults, block);
            local fullBlock = barbe.asVal(barbe.mergeTokens([barbe.asSyntax(blockDefaults), bag.Value]));
            local namePrefix = barbe.concatStrArr(std.get(fullBlock, "name_prefix", barbe.asSyntax([""])));
            local dotS3 = barbe.asVal(barbe.mergeTokens(std.get(fullBlock, "s3", barbe.asSyntax([])).ArrayConst));
            local dotGcs = barbe.asVal(barbe.mergeTokens(std.get(fullBlock, "gcs", barbe.asSyntax([])).ArrayConst));
            local bucketNameTemplate = barbe.appendToTemplate(namePrefix, [barbe.asSyntax("state-store")]);

            //if there is an env var or something in the name, this component might get called before the env var was baked in
            if !isSimpleTemplate(bucketNameTemplate) then
                //TODO message + delete message if found?
                //cause right now this will just fail silently if the user put a dynamic value in the bucket name
                null
            else if std.objectHas(fullBlock, "s3") then
                local madeBucketName = barbe.asStr(bucketNameTemplate);
                [
                    if !std.objectHas(dotS3, "existing_bucket") && !std.objectHas(state, "state_store_s3_bucket_created") || !std.objectHas(state.state_store_s3_bucket_created, madeBucketName) then
                        [{
                            Type: "buildkit_run_in_container",
                            Name: "s3_bucket_creator_" + madeBucketName,
                            Value: {
                                display_name: "Creating state_store S3 bucket - " + madeBucketName,
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
                        },
                        {
                            Type: "barbe_state(put_in_object)",
                            Name: "state_store_s3_bucket_created",
                            Value: {
                                [madeBucketName]: true,
                            },
                        }]
                    else
                        []
                    ,
                ]
            else if std.objectHas(fullBlock, "gcs") then
                local madeBucketName = barbe.asStr(bucketNameTemplate);
                local gcpProject = std.get(dotGcs, "project", std.get(env, "CLOUDSDK_CORE_PROJECT", null));
                [
                    if isSimpleTemplate(gcpProject) && !std.objectHas(dotGcs, "existing_bucket") && !std.objectHas(state, "state_store_gcs_bucket_created") || !std.objectHas(state.state_store_gcs_bucket_created, madeBucketName) then
                        [{
                            Type: "buildkit_run_in_container",
                            Name: "gcs_bucket_creator_" + madeBucketName,
                            Value: {
                                display_name: "Creating state_store GCS bucket - " + madeBucketName,
                                message: "Storing terraform state in GCS bucket '" + madeBucketName + "'",
                                no_cache: true,
                                dockerfile: |||
                                    FROM google/cloud-sdk:%(gcp_sdk_version)s

                                    ENV CLOUDSDK_AUTH_ACCESS_TOKEN="%(gcp_access_token)s"
                                    ENV CLOUDSDK_CORE_DISABLE_PROMPTS=1

                                    RUN gcloud storage buckets create gs://%(bucket_name)s --project %(gcp_project)s --quiet || true
                                ||| % {
                                    //TODO version selection
                                    gcp_sdk_version: "slim",
                                    gcp_access_token: barbe.asStr(barbe.asVal(container.gcp_token.state_store_credentials[0].Value).access_token),
                                    bucket_name: madeBucketName,
                                    // only do that if the dotGcs.project is an simple template
                                    gcp_project: barbe.asStr(gcpProject)
                                },
                            }
                        },
                        {
                            Type: "barbe_state(put_in_object)",
                            Name: "state_store_gcs_bucket_created",
                            Value: {
                                [madeBucketName]: true,
                            },
                        }]
                    else
                        []
                    ,
                ]
            else
                []
            ,
        ),
    ]),
    function(container) barbe.databags([
        barbe.iterateBlocks(container, "state_store", function(bag)
            local awsCredentials = barbe.asVal(container.aws_credentials.state_store_credentials[0].Value);
            local block = barbe.asVal(bag.Value);
            local labels = barbe.flatten([bag.Name, bag.Labels]);
            local blockDefaults = barbe.makeBlockDefault(container, globalDefaults, block);
            local fullBlock = barbe.asVal(barbe.mergeTokens([barbe.asSyntax(blockDefaults), bag.Value]));
            local namePrefix = barbe.concatStrArr(std.get(fullBlock, "name_prefix", barbe.asSyntax([""])));
            local dotS3 = barbe.asVal(barbe.mergeTokens(std.get(fullBlock, "s3", barbe.asSyntax([])).ArrayConst));
            local dotGcs = barbe.asVal(barbe.mergeTokens(std.get(fullBlock, "gcs", barbe.asSyntax([])).ArrayConst));
            local bucketNameTemplate = barbe.appendToTemplate(namePrefix, [barbe.asSyntax("state-store")]);

            //if there is an env var or something in the name, this component might get called before the env var was baked in
            if !isSimpleTemplate(bucketNameTemplate) then
                null
            else if std.objectHas(fullBlock, "s3") then
                local madeBucketName = barbe.asStr(bucketNameTemplate);
                [
                    if !std.objectHas(dotS3, "existing_bucket") then
                        {
                            Name: "s3",
                            Type: "barbe_state_store",
                            Value: {
                                bucket: madeBucketName,
                                key: barbe.appendToTemplate(
                                    std.get(dotS3, "prefix", barbe.asSyntax("")),
                                    [std.get(dotS3, "key", barbe.appendToTemplate(namePrefix, [barbe.asSyntax("barbe_state.json")]))]
                                ),
                                region: std.get(dotS3, "region", "us-east-1")
                            }
                        }
                    else
                        []
                    ,
                ]
            else if std.objectHas(fullBlock, "gcs") then
                local madeBucketName = barbe.asStr(bucketNameTemplate);
                [
                    if !std.objectHas(dotGcs, "existing_bucket") then
                        {
                            Name: "gcs",
                            Type: "barbe_state_store",
                            Value: {
                                bucket: madeBucketName,
                                key: barbe.appendToTemplate(
                                    std.get(dotGcs, "prefix", barbe.asSyntax("")),
                                    [std.get(dotGcs, "key", barbe.appendToTemplate(namePrefix, [barbe.asSyntax("barbe_state.json")]))]
                                ),
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
];

barbe.pipelines([{
    pre_generate: steps,
    generate: steps,
    post_generate: steps,
}])