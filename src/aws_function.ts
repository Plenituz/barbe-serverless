import { AWS_FUNCTION } from "./barbe-sls-lib/consts";
import { applyDefaults, compileBlockParam, DatabagObjVal, preConfCloudResourceFactory, preConfTraversalTransform } from "./barbe-sls-lib/lib";
import { asStr, Databag, exportDatabags, iterateBlocks, readDatabagContainer, SugarCoatedDatabag, asTraversal, appendToTemplate, asFuncCall, asBlock, asVal, asTemplate, asValArrayConst, appendToTraversal, onlyRunForLifecycleSteps } from './barbe-std/utils';

const container = readDatabagContainer()
onlyRunForLifecycleSteps(['pre_generate', 'generate', 'post_generate'])

function awsFunctionIterator(bag: Databag): (Databag | SugarCoatedDatabag)[] {
    if (!bag.Value) {
        return [];
    }
    const [block, namePrefix] = applyDefaults(container, bag.Value!);
    const cloudResourceId = block.cloudresource_id ? asStr(block.cloudresource_id) : undefined
    const cloudResourceDir = block.cloudresource_dir ? asStr(block.cloudresource_dir) : undefined
    const cloudResource = preConfCloudResourceFactory(block, 'resource')
    const cloudData = preConfCloudResourceFactory(block, 'data')
    const traversalTransform = preConfTraversalTransform(bag)

    const dotPackage = compileBlockParam(block, 'package')
    const packageLocation = dotPackage.packaged_file || `.package/${bag.Name}_lambda_package.zip`
    const dotEnvironment = compileBlockParam(block, 'environment')
    const dotProvisionedConc = compileBlockParam(block, 'provisioned_concurrency')
    let packageType: 'Image' | 'Zip' = 'Zip'
    if (block.image_uri) {
        packageType = 'Image'
    }

    let databags: SugarCoatedDatabag[] = [
        //we need to duplicate this in case this component is imported without the aws_base component
        cloudData("aws_caller_identity", "current", {}),

        traversalTransform('aws_function_traversal_transform', {
            [`aws_function.${bag.Name}`]: `aws_lambda_function.${bag.Name}_lambda`,
            [`aws_function.${bag.Name}.function_url`]: `aws_lambda_function_url.${bag.Name}_lambda_url.function_url`
        }),
        cloudResource("aws_lambda_function", `${bag.Name}_lambda`, {
            function_name: appendToTemplate(namePrefix, [bag.Name]),
            package_type: packageType,
            publish: true,
            description: block.description || undefined,
            handler: packageType === 'Image' ? undefined : (block.handler || undefined),
            runtime: packageType === 'Image' ? undefined : (block.runtime || undefined),
            memory_size: block.memory_size || 128,
            timeout: block.timeout || 900,
            ephemeral_storage: block.ephemeral_storage || undefined,
            role: block.role || asTraversal('aws_iam_role.default_lambda_role.arn'),
            architectures: [block.architecture || 'x86_64'],
            layers: packageType === 'Image' ? undefined : (block.layers || undefined),
            s3_bucket: packageType === 'Zip' ? asTraversal("aws_s3_bucket.deployment_bucket.id") : undefined,
            s3_key: packageType === 'Zip' ? asTraversal(`aws_s3_object.${bag.Name}_package.id`) : undefined,
            source_code_hash: packageType === 'Zip' ? asFuncCall("filebase64sha256", [packageLocation]) : undefined,
            image_uri: packageType === 'Image' ? block.image_uri : undefined,

            // "architectures" causes a re-deploys even when unchanged, so we kind of have to add this.
            // this technically forces users to delete/recreate lambda functions if they change the architecture
            // but it's probably a rare thing to do/a bad idea anyway
            lifecycle: asBlock([{
                ignore_changes: [
                    asTraversal("architectures")
                ]
            }]),
            environment: block.environment ? asBlock([{ variables: dotEnvironment }]) : undefined
        }),
        cloudResource("aws_cloudwatch_log_group", `${bag.Name}_lambda_logs`, {
            name: asTemplate([
                "/aws/lambda/",
                asTraversal(`aws_lambda_function.${bag.Name}_lambda.function_name`)
            ]),
            retention_in_days: block.logs_retention_days || 30,
        }),
    ]
    if(packageType === 'Zip') {
        databags.push(
            //TODO allow using existing bucket
            cloudResource("aws_s3_bucket", "deployment_bucket", {
                bucket: appendToTemplate(namePrefix, ["deploy-bucket"]),
                force_destroy: true,
            }),
            cloudResource("aws_s3_object", `${bag.Name}_package`, {
                bucket: asTraversal("aws_s3_bucket.deployment_bucket.id"),
                key: appendToTemplate(namePrefix, [`${bag.Name}_lambda_package.zip`]),
                source: packageLocation,
                etag: asFuncCall("filemd5", [packageLocation]),
            }),
        )
        if(!dotPackage.packaged_file) {
            databags.push({
                Name: `${bag.Name}_${cloudResourceId}${cloudResourceDir}_lambda_package`,
                Type: 'zipper',
                Value: {
                    output_file: `${cloudResourceDir ? `${cloudResourceDir}/` : ''}${packageLocation}`,
                    file_map: dotPackage.file_map || {},
                    include: dotPackage.include || [],
                    exclude: dotPackage.exclude || [],
                }
            })
        }
    }
    if(block.function_url_enabled && asVal(block.function_url_enabled)) {
        databags.push(
            cloudResource("aws_lambda_function_url", bag.Name + "_lambda_url", {
                function_name: asTraversal(`aws_lambda_function.${bag.Name}_lambda.function_name`),
                authorization_type: "NONE",
            }),
        )
    }
    if(block.maximum_retry_attempts || block.maximum_event_age_in_seconds) {
        databags.push(cloudResource("aws_lambda_function_event_invoke_config", `${bag.Name}_retry`, {
            function_name: asTraversal(`aws_lambda_function.${bag.Name}_lambda.function_name`),
            maximum_event_age_in_seconds: block.maximum_event_age_in_seconds,
            maximum_retry_attempts: block.maximum_retry_attempts,
        }))
    }
    if(block.provisioned_concurrency) {
        databags.push(
            cloudResource("aws_lambda_alias", `${bag.Name}_alias`, {
                name: dotProvisionedConc.alias_name || "provisioned",
                function_name: asTraversal(`aws_lambda_function.${bag.Name}_lambda.arn`),
                function_version: asTraversal(`aws_lambda_function.${bag.Name}_lambda.version`),
            }),
            cloudResource("aws_lambda_provisioned_concurrency_config", `${bag.Name}_prov_conc`, {
                function_name: asTraversal(`aws_lambda_function.${bag.Name}_lambda.arn`),
                qualifier: asTraversal(`aws_lambda_alias.${bag.Name}_alias.name`),
                provisioned_concurrent_executions: dotProvisionedConc.value || dotProvisionedConc.min || 1,
            }),
        )
        if(dotProvisionedConc.min || dotProvisionedConc.max) {
            databags.push(
                cloudResource("aws_appautoscaling_target", `${bag.Name}_autoscl_trgt`, {
                    max_capacity: dotProvisionedConc.max || 1,
                    min_capacity: dotProvisionedConc.min || 1,
                    resource_id: asTemplate([
                        "function:",
                        asTraversal(`aws_lambda_function.${bag.Name}_lambda.function_name`),
                        ":",
                        asTraversal(`aws_lambda_alias.${bag.Name}_alias.name`)
                    ]),
                    scalable_dimension: "lambda:function:ProvisionedConcurrency",
                    service_namespace: "lambda",
                    role_arn: asTemplate([
                        "arn:aws:iam::",
                        asTraversal("data.aws_caller_identity.current.account_id"),
                        ":role/aws-service-role/lambda.application-autoscaling.amazonaws.com/AWSServiceRoleForApplicationAutoScaling_LambdaConcurrency"
                    ]),
                }),
                cloudResource("aws_appautoscaling_policy", `${bag.Name}_autoscl_pol`, {
                    name: asTemplate([
                        "ProvConcAutoScal:",
                        asTraversal(`aws_lambda_function.${bag.Name}_lambda.function_name`),
                    ]),
                    scalable_dimension: "lambda:function:ProvisionedConcurrency",
                    service_namespace: "lambda",
                    policy_type: "TargetTrackingScaling",
                    resource_id: asTraversal(`aws_appautoscaling_target.${bag.Name}_autoscl_trgt.resource_id`),
                    target_tracking_scaling_policy_configuration: asBlock([{
                        //TODO make these configurable eventually
                        target_value: 0.75,
                        scale_in_cooldown: 120,
                        scale_out_cooldown: 0,
                        customized_metric_specification: asBlock([{
                            metric_name: "ProvisionedConcurrencyUtilization",
                            namespace: "AWS/Lambda",
                            statistic: "Maximum",
                            unit: "Count",
                            dimensions: asBlock([
                                {
                                    name: "FunctionName",
                                    value: asTraversal(`aws_lambda_function.${bag.Name}_lambda.function_name`),
                                },
                                {
                                    name: "Resource",
                                    value: asTemplate([
                                        asTraversal(`aws_lambda_function.${bag.Name}_lambda.function_name`),
                                        ":",
                                        asTraversal(`aws_lambda_alias.${bag.Name}_alias.name`)
                                    ])
                                },
                            ])
                        }]),
                    }])
                })
            )
        }
    }
    if(block.event_s3) {
        const bucketTraversalsStr = Array.from(new Set(
            asValArrayConst(block.event_s3)
                .map((event: DatabagObjVal) => event.bucket!)
                .filter(t => t)
                .map(asStr)
        ))
        databags.push(
            //using the index instead of a hash will make the resource potentially be recreated if the order of the buckets changes
            //but it also prevents duplicate resources when the traversal transformed are applied.
            //if we use a hash we would get a resource for aws_s3.bucket.name and one for aws_s3_bucket.bucket.name
            ...bucketTraversalsStr.map((traversalStr, i) => cloudResource("aws_lambda_permission", `${bag.Name}_${i}_s3_permission`, {
                statement_id: "AllowExecutionFromS3Bucket",
                action: "lambda:InvokeFunction",
                principal: "s3.amazonaws.com",
                function_name: asTraversal(`aws_lambda_function.${bag.Name}_lambda.function_name`),
                source_arn: appendToTraversal(asTraversal(traversalStr), "arn"),
            }))
        )
    }
    if(block.event_sqs) {
        const eventSqss = asValArrayConst(block.event_sqs)
        databags.push(
            ...eventSqss.map((event, i) => cloudResource("aws_lambda_event_source_mapping", `${bag.Name}_${i}_sqs_mapping`, {
                event_source_arn: event.queue_arn,
                enabled: event.enabled,
                function_name: asTraversal(`aws_lambda_function.${bag.Name}_lambda.arn`),
                batch_size: event.batch_size || 1,
                starting_position: event.starting_position || "TRIM_HORIZON",
                function_response_types: event.function_response_types,
                parallelization_factor: event.parallelization_factor,
                maximum_batching_window_in_seconds: event.maximum_batching_window_in_seconds,
                maximum_record_age_in_seconds: event.maximum_record_age_in_seconds,
                bisect_batch_on_function_error: event.bisect_batch_on_function_error,
                tumbling_window_in_seconds: event.tumbling_window_in_seconds,
                destination_config: event.on_failure_destination_arn ? asBlock([{
                    on_failure: asBlock([{
                        destination_arn: event.on_failure_destination_arn,
                    }])
                }]) : undefined,
                filter_criteria: event.filter ? asBlock([{
                    filter: asBlock(asValArrayConst(event.filter).map(f => ({ pattern: f.pattern })))
                }]) : undefined
            }))
        )
    }
    if(block.event_schedule) {
        const eventSchedules = asValArrayConst(block.event_schedule)
        databags.push(
            ...eventSchedules.flatMap((event, i) => [
                cloudResource('aws_cloudwatch_event_rule', `${bag.Name}_${i}_schedule`, {
                    name: appendToTemplate(namePrefix, [bag.Name, '-schedule-', i]),
                    schedule_expression: event.schedule_expression,
                }),
                cloudResource('aws_cloudwatch_event_target', `${bag.Name}_${i}_schedule_target`, {
                    rule: asTraversal(`aws_cloudwatch_event_rule.${bag.Name}_${i}_schedule.name`),
                    target_id: 'InvokeLambda',
                    arn: asTraversal(`aws_lambda_function.${bag.Name}_lambda.arn`),
                }),
                cloudResource('aws_lambda_permission', `${bag.Name}_${i}_schedule_permission`, {
                    statement_id: 'AllowExecutionFromEventBridge',
                    action: 'lambda:InvokeFunction',
                    principal: 'events.amazonaws.com',
                    function_name: asTraversal(`aws_lambda_function.${bag.Name}_lambda.arn`),
                    source_arn: asTraversal(`aws_cloudwatch_event_rule.${bag.Name}_${i}_schedule.arn`),
                })
            ])
        )
    }

    return databags
}

exportDatabags(iterateBlocks(container, AWS_FUNCTION, awsFunctionIterator).flat())

