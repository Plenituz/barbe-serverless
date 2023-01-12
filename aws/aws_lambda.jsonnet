local barbe = std.extVar("barbe");
local container = std.extVar("container");
local globalDefaults = barbe.compileDefaults(container, "");

local cloudResourceAbstractFactory(region, dir, id) =
    function(kind)
    function(type, name, value)
        local bag = barbe.cloudResourceRaw(dir, id, kind, type, name, value);
        if region != null && (kind == "data" || kind == "resource") then
            {
                Name: bag.Name,
                Type: bag.Type,
                Value: bag.Value + { provider: barbe.asTraversal("aws." + barbe.asStr(region))}
            }
        else
            bag
        ;

barbe.databags([
    barbe.iterateBlocks(container, "aws_function", function(bag)
        local block = barbe.asVal(bag.Value);
        local labels = barbe.flatten([bag.Name, bag.Labels]);
        local blockDefaults = barbe.makeBlockDefault(container, globalDefaults, block);
        local validator = {};
        local fullBlock = validator + barbe.asVal(barbe.mergeTokens([barbe.asSyntax(blockDefaults), bag.Value]));
        local namePrefix = barbe.concatStrArr(std.get(fullBlock, "name_prefix", barbe.asSyntax([""])));
        
        //this are meant for other components to use more than for actual end users
        local cloudResourceDir = 
            if !std.objectHas(fullBlock, "cloudresource_dir") then
                null
            else
                barbe.asStr(fullBlock.cloudresource_dir)
            ;
        local cloudResourceId = 
            if !std.objectHas(fullBlock, "cloudresource_id") then
                null
            else
                barbe.asStr(fullBlock.cloudresource_id)
            ;
        local cloudResourceKindFactory = cloudResourceAbstractFactory(
            std.get(fullBlock, "region", null),
            cloudResourceDir,
            cloudResourceId
        );
        local cloudResourceDirStrPrefix = 
            if cloudResourceDir != null then
                cloudResourceDir + "/"
            else
                ""
            ;
        local cloudResource = cloudResourceKindFactory("resource");
        local cloudData = cloudResourceKindFactory("data");

        local dotPackage = barbe.asVal(barbe.mergeTokens(std.get(fullBlock, "package", barbe.asSyntax([])).ArrayConst));
        local dotEnvironment = barbe.asVal(barbe.mergeTokens(std.get(fullBlock, "environment", barbe.asSyntax([])).ArrayConst));
        local dotProvisionedConc = barbe.asVal(barbe.mergeTokens(std.get(fullBlock, "provisioned_concurrency", barbe.asSyntax([])).ArrayConst));
        local packageLocation = 
            if std.objectHas(dotPackage, "packaged_file") then
                dotPackage.packaged_file
            else
                ".package/" + labels[0] + "_lambda_package.zip"
            ;
        barbe.flatten([
            {
                Name: labels[0] + "_aws_function_traversal_transform",
                Type: "traversal_transform",
                Value: {
                    ["aws_function." + labels[0]]: "aws_lambda_function." + labels[0] + "_lambda",
                    ["aws_function." + labels[0] + ".function_url"]: "aws_lambda_function_url." + labels[0] + "_lambda_url.function_url",
                }
            },
            cloudResource("aws_s3_bucket", "deployment_bucket", {
                bucket: barbe.appendToTemplate(namePrefix, [barbe.asSyntax("deploy-bucket")]),
                force_destroy: true,
            }),
            if !std.objectHas(dotPackage, "packaged_file") then
                {
                    Name: labels[0] + "_" + cloudResourceId + cloudResourceDir + "_lambda_package",
                    Type: "zipper",
                    Value: {
                        output_file: cloudResourceDirStrPrefix + ".package/" + labels[0] + "_lambda_package.zip",
                        file_map: std.get(dotPackage, "file_map", {}),
                        include: std.get(dotPackage, "include", []),
                        exclude: std.get(dotPackage, "exclude", []),
                    }
                },
            cloudResource("aws_s3_object", labels[0] + "_package", {
                bucket: barbe.asTraversal("aws_s3_bucket.deployment_bucket.id"),
                key: barbe.appendToTemplate(namePrefix, [labels[0] + "_lambda_package.zip"]),
                source: packageLocation,
                etag: barbe.asFuncCall("filemd5", [packageLocation]),
            }),
            cloudData("aws_caller_identity", "current", {}),
            cloudResource("aws_lambda_function", labels[0] + "_lambda", {
                function_name: barbe.appendToTemplate(namePrefix, [barbe.asSyntax(labels[0])]),
                package_type: "Zip",
                publish: true,
                description: std.get(fullBlock, "description", null),
                handler: std.get(fullBlock, "handler", null),
                runtime: std.get(fullBlock, "runtime", null),
                memory_size: std.get(fullBlock, "memory_size", 128),
                timeout: std.get(fullBlock, "timeout", 900),
                ephemeral_storage: std.get(fullBlock, "ephemeral_storage", null),
                role: std.get(fullBlock, "role", barbe.asTraversal("aws_iam_role.default_lambda_role.arn")),
                architectures: [std.get(fullBlock, "architecture", "x86_64")],
                layers: std.get(fullBlock, "layers", null),
                s3_bucket: barbe.asTraversal("aws_s3_bucket.deployment_bucket.id"),
                s3_key: barbe.asTraversal("aws_s3_object." + labels[0] + "_package.id"),
                source_code_hash: barbe.asFuncCall("filebase64sha256", [packageLocation]),

                // "architectures" causes a re-deploys even when unchanged, so we kind of have to add this
                // this technically forces users to delete/recreate lambda functions if they change the architecture
                // but it's probably a rare thing to do/a bad idea anyway
                lifecycle: barbe.asBlock([{
                    ignore_changes: [
                        barbe.asTraversal("architectures")
                    ]
                }]),
                environment:
                    if std.objectHas(fullBlock, "environment") then
                        barbe.asBlock([{
                            variables: barbe.removeLabels(dotEnvironment)
                        }])
                    else
                        null
                    ,
            }),
            if barbe.asVal(std.get(fullBlock, "function_url_enabled", barbe.asSyntax(false))) then
                cloudResource("aws_lambda_function_url", labels[0] + "_lambda_url", {
                    function_name: barbe.asTraversal("aws_lambda_function." + labels[0] + "_lambda.function_name"),
                    authorization_type: "NONE",
                }),

            cloudResource("aws_cloudwatch_log_group", labels[0] + "_lambda_logs", {
                name: barbe.asTemplate([
                    "/aws/lambda/",
                    barbe.asTraversal("aws_lambda_function." + labels[0] + "_lambda.function_name")
                ]),
                retention_in_days: std.get(fullBlock, "logs_retention_days", 30),
            }),

            if std.objectHas(fullBlock, "provisioned_concurrency") then
                [
                    cloudResource("aws_lambda_alias", labels[0] + "_alias", {
                        name: std.get(dotProvisionedConc, "alias_name", "provisioned"),
                        function_name: barbe.asTraversal("aws_lambda_function." + labels[0] + "_lambda.arn"),
                        function_version: barbe.asTraversal("aws_lambda_function." + labels[0] + "_lambda.version"),
                    }),
                    cloudResource("aws_lambda_provisioned_concurrency_config", labels[0] + "_prov_conc", {
                        function_name: barbe.asTraversal("aws_lambda_function." + labels[0] + "_lambda.arn"),
                        qualifier: barbe.asTraversal("aws_lambda_alias." + labels[0] + "_alias.function_name"),
                        provisioned_concurrent_executions: std.get(dotProvisionedConc, "value", std.get(dotProvisionedConc, "min", 1)),
                    }),
                    if std.objectHas(dotProvisionedConc, "min") || std.objectHas(dotProvisionedConc, "max") then
                        [
                            cloudResource("aws_appautoscaling_target", labels[0] + "_autoscl_trgt", {
                                max_capacity: std.get(dotProvisionedConc, "max", 1),
                                min_capacity: std.get(dotProvisionedConc, "min", 1),
                                resource_id: barbe.asTemplate([
                                    "function:",
                                    barbe.asTraversal("aws_lambda_function." + labels[0] + "_lambda.function_name"),
                                    ":",
                                    barbe.asTraversal("aws_lambda_alias." + labels[0] + "_alias.name")
                                ]),
                                scalable_dimension: "lambda:function:ProvisionedConcurrency",
                                service_namespace: "lambda",
                                role_arn: barbe.asTemplate([
                                    "arn:aws:iam::",
                                    barbe.asTraversal("data.aws_caller_identity.current.account_id"),
                                    ":role/aws-service-role/lambda.application-autoscaling.amazonaws.com/AWSServiceRoleForApplicationAutoScaling_LambdaConcurrency"
                                ]),
                            }),
                            cloudResource("aws_appautoscaling_policy", labels[0] + "_autoscl_pol", {
                                name: barbe.asTemplate([
                                    "ProvConcAutoScal:",
                                    barbe.asTraversal("aws_lambda_function." + labels[0] + "_lambda.function_name"),
                                ]),
                                scalable_dimension: "lambda:function:ProvisionedConcurrency",
                                service_namespace: "lambda",
                                policy_type: "TargetTrackingScaling",
                                resource_id: barbe.asTraversal("aws_appautoscaling_target." + labels[0] + "_autoscl_trgt.resource_id"),
                                target_tracking_scaling_policy_configuration: barbe.asBlock([{
                                    //TODO make these configurable eventually
                                    target_value: 0.75,
                                    scale_in_cooldown: 120,
                                    scale_out_cooldown: 0,
                                    customized_metric_specification: barbe.asBlock([{
                                        metric_name: "ProvisionedConcurrencyUtilization",
                                        namespace: "AWS/Lambda",
                                        statistic: "Maximum",
                                        unit: "Count",
                                        dimensions: barbe.asBlock([
                                            {
                                                name: "FunctionName",
                                                value: barbe.asTraversal("aws_lambda_function." + labels[0] + "_lambda.function_name"),
                                            },
                                            {
                                                name: "Resource",
                                                value: barbe.asTemplate([
                                                    barbe.asTraversal("aws_lambda_function." + labels[0] + "_lambda.function_name"),
                                                    ":",
                                                    barbe.asTraversal("aws_lambda_alias." + labels[0] + "_alias.name")
                                                ])
                                            },
                                        ])
                                    }]),
                                }])
                            })
                        ]
                ],

            if std.objectHas(fullBlock, "event_s3") then
                local bucketTraversals = std.set([
                    event.bucket
                    for event in barbe.asValArrayConst(fullBlock.event_s3)
                ], function(d) barbe.asStr(d));
                [
                    local bucketTraversal = bucketTraversals[i];
                    cloudResource("aws_lambda_permission", labels[0] + "_" + i + "_s3_permission", {
                        statement_id: "AllowExecutionFromS3Bucket",
                        action: "lambda:InvokeFunction",
                        principal: "s3.amazonaws.com",
                        function_name: barbe.asTraversal("aws_lambda_function." + labels[0] + "_lambda.function_name"),
                        source_arn: barbe.appendToTraversal(bucketTraversal, "arn"),
                    })
                    for i in std.range(0, std.length(bucketTraversals)-1)
                ]
        ])
    )
])