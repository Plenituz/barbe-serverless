local barbe = std.extVar("barbe");
local container = std.extVar("container");
local globalDefaults = barbe.compileDefaults(container, "");


local applyRegionProvider(fullBlock, bags) =
    if !std.objectHas(fullBlock, "region") then
        bags
    else
        [
            if std.length(std.findSubstr("cr_aws", bag.Type)) > 0 || std.length(std.findSubstr("cr_[data]_aws_", bag.Type)) > 0  then
                {
                    Name: bag.Name,
                    Type: bag.Type,
                    Value: bag.Value + { provider: barbe.asTraversal("aws." + barbe.asStr(fullBlock.region))}
                }
            else
                bag
            for bag in bags if bag != null
        ]
    ;

barbe.databags([
    barbe.iterateBlocks(container, "aws_function", function(bag)
        local block = barbe.asVal(bag.Value);
        local labels = barbe.flatten([bag.Name, bag.Labels]);
        local blockDefaults = barbe.makeBlockDefault(container, globalDefaults, block);
        local validator = {};
        local fullBlock = validator + barbe.asVal(barbe.mergeTokens([barbe.asSyntax(blockDefaults), bag.Value]));
        local namePrefix = barbe.concatStrArr(std.get(fullBlock, "name_prefix", barbe.asSyntax([""])));

        local dotPackage = barbe.asVal(barbe.mergeTokens(std.get(fullBlock, "package", barbe.asSyntax([])).ArrayConst));
        local dotEnvironment = barbe.asVal(barbe.mergeTokens(std.get(fullBlock, "environment", barbe.asSyntax([])).ArrayConst));
        local dotProvisionedConc = barbe.asVal(barbe.mergeTokens(std.get(fullBlock, "provisioned_concurrency", barbe.asSyntax([])).ArrayConst));

        applyRegionProvider(fullBlock, barbe.flatten([
            {
                Name: labels[0] + "_aws_function_traversal_transform",
                Type: "traversal_transform",
                Value: {
                    ["aws_function." + labels[0]]: "aws_lambda_function." + labels[0] + "_lambda",
                }
            },
            {
                Name: labels[0] + "_lambda_package",
                Type: "zipper",
                Value: {
                    output_file: ".package/" + labels[0] + "_lambda_package.zip",
                    file_map: std.get(dotPackage, "file_map", {}),
                    include: std.get(dotPackage, "include", []),
                    exclude: std.get(dotPackage, "exclude", []),
                }
            },
            {
                Name: labels[0] + "_lambda",
                Type: "cr_aws_lambda_function",
                Value: {
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
                    filename: ".package/" + labels[0] + "_lambda_package.zip",
                    source_code_hash: barbe.asFuncCall("filebase64sha256", [".package/" + labels[0] + "_lambda_package.zip"]),

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
                }
            },
            {
                Name: labels[0] + "_lambda_logs",
                Type: "cr_aws_cloudwatch_log_group",
                Value: {
                    name: barbe.asTemplate([
                        "/aws/lambda/",
                        barbe.asTraversal("aws_lambda_function." + labels[0] + "_lambda.function_name")
                    ]),
                    retention_in_days: std.get(fullBlock, "logs_retention_days", 30),
                }
            },

            if std.objectHas(fullBlock, "provisioned_concurrency") then
                [
                    {
                        Name: labels[0] + "_alias",
                        Type: "cr_aws_lambda_alias",
                        Value: {
                            name: std.get(dotProvisionedConc, "alias_name", "provisioned"),
                            function_name: barbe.asTraversal("aws_lambda_function." + labels[0] + "_lambda.arn"),
                            function_version: barbe.asTraversal("aws_lambda_function." + labels[0] + "_lambda.version"),
                        }
                    },
                    {
                        Name: labels[0] + "_prov_conc",
                        Type: "cr_aws_lambda_provisioned_concurrency_config",
                        Value: {
                            function_name: barbe.asTraversal("aws_lambda_function." + labels[0] + "_lambda.arn"),
                            qualifier: barbe.asTraversal("aws_lambda_alias." + labels[0] + "_alias.function_name"),
                            provisioned_concurrent_executions: std.get(dotProvisionedConc, "value", std.get(dotProvisionedConc, "min", 1)),
                        }
                    },
                    if std.objectHas(dotProvisionedConc, "min") || std.objectHas(dotProvisionedConc, "max") then
                        [{
                            Name: labels[0] + "_autoscl_trgt",
                            Type: "cr_aws_appautoscaling_target",
                            Value: {
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
                            }
                        },
                        {
                            Name: labels[0] + "_autoscl_pol",
                            Type: "cr_aws_appautoscaling_policy",
                            Value: {
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
                            }
                        }]
                ],

            if std.objectHas(fullBlock, "event_s3") then
                local bucketTraversals = std.set([
                    event.bucket
                    for event in barbe.asValArrayConst(fullBlock.event_s3)
                ], function(d) barbe.asStr(d));
                [
                    local bucketTraversal = bucketTraversals[i];
                    {
                        Name: labels[0] + "_" + i + "_s3_permission",
                        Type: "cr_aws_lambda_permission",
                        Value: {
                            statement_id: "AllowExecutionFromS3Bucket",
                            action: "lambda:InvokeFunction",
                            principal: "s3.amazonaws.com",
                            function_name: barbe.asTraversal("aws_lambda_function." + labels[0] + "_lambda.function_name"),
                            source_arn: barbe.appendToTraversal(bucketTraversal, "arn"),
                        }
                    }
                    for i in std.range(0, std.length(bucketTraversals)-1)
                ]
        ]))
    )
])