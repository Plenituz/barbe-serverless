import md5 from 'md5';
import { AWS_DYNAMODB, AWS_FUNCTION, EVENT_DYNAMODB_STREAM } from './barbe-sls-lib/consts';
import { applyDefaults, DatabagObjVal, preConfCloudResourceFactory, preConfTraversalTransform } from './barbe-sls-lib/lib';
import { readDatabagContainer, Databag, SugarCoatedDatabag, exportDatabags, iterateBlocks, asValArrayConst, asStr, asTraversal, asBlock, appendToTraversal, SyntaxToken, asVal, appendToTemplate, uniq, mergeTokens, asTemplate, asSyntax, onlyRunForLifecycleSteps } from './barbe-std/utils';

const container = readDatabagContainer()
onlyRunForLifecycleSteps(['pre_generate', 'generate', 'post_generate'])

const ddbStreamEventsKinesisOrphans = iterateBlocks(container, AWS_FUNCTION, (awsFuncBag) => {
    if(!awsFuncBag.Value) {
        return []
    }
    if(awsFuncBag.Value.Type !== 'object_const' || !awsFuncBag.Value.ObjectConst) {
        return []
    }
    return awsFuncBag.Value.ObjectConst.map(pair => {
        if(pair.Key !== EVENT_DYNAMODB_STREAM || !pair.Value || pair.Value.Type !== 'array_const' || !pair.Value.ArrayConst) {
            return [];
        }
        const events = asValArrayConst(pair.Value) as DatabagObjVal[];
        const orphanEvents = events.filter(event =>
            event.type &&
            asStr(event.type) === 'kinesis' &&
            event.kinesis_stream &&
            event.kinesis_stream.Traversal![0].Name === 'aws_kinesis_stream'
        );
        return orphanEvents.map(event => ({
            event: event,
            bag: awsFuncBag
        }))
    }).flat()
}).flat()

//this case is basically equivalent to having a event_kinesis directly
let orphanKinesisSourceMappings = ddbStreamEventsKinesisOrphans.map(({event, bag}, i) => {
    const [block, _] = applyDefaults(container, bag.Value!);
    const cloudResource = preConfCloudResourceFactory(block, 'resource')
    
    return cloudResource('aws_lambda_event_source_mapping', `ddb_stream_sub_orphan_${i}`, {
        batch_size: event.batch_size,
        starting_position: event.starting_position || "TRIM_HORIZON",
        enabled: event.enabled,
        function_response_types: event.function_response_types,
        parallelization_factor: event.parallelization_factor,
        maximum_batching_window_in_seconds: event.maximum_batching_window_in_seconds,
        maximum_record_age_in_seconds: event.maximum_record_age_in_seconds,
        bisect_batch_on_function_error: event.bisect_batch_on_function_error,
        tumbling_window_in_seconds: event.tumbling_window_in_seconds,
        function_name: asTraversal(`aws_lambda_function.${bag.Name}_lambda.function_name`),
        event_source_arn: appendToTraversal(event.kinesis_stream!, "arn"),
        
        destination_config: event.on_failure_destination_arn ? asBlock([{
            on_failure: asBlock([{
                destination_arn: event.on_failure_destination_arn,
            }])
        }]) : undefined,

        filter_criteria: event.filter ? asBlock([{
            filter: asBlock(asValArrayConst(event.filter).map(f => ({ pattern: f.pattern })))
        }]) : undefined
    })
})

function awsDynamodbIterator(bag: Databag): (Databag | SugarCoatedDatabag)[] {
    if(!bag.Value) {
        return []
    }
    const [block, namePrefix] = applyDefaults(container, bag.Value);
    if(!block.hash_key) {
        throw new Error(`DynamoDB table '${bag.Name}' has no hash_key`)
    }

    let regions: SyntaxToken[] = []
    let regionVal = block.regions || block.region
    if(!regionVal) {
        regions = []
    } else if(regionVal.Type === 'array_const') {
        regions = asVal(regionVal)
    } else {
        regions = [regionVal]
    }
    const regionMap = {}
    regions.forEach(region => regionMap[asStr(region)] = true)
    const provider = regions.length === 0 ? undefined : asTraversal(`aws.${asStr(regions[0])}`)
    const dotAutoScaling = asVal(mergeTokens(block.auto_scaling?.ArrayConst || []))

    const cloudResource = preConfCloudResourceFactory(block, 'resource', { provider })
    const traversalTransform = preConfTraversalTransform(bag)
    const indexResourceName = (gsi: DatabagObjVal, suffix: string) => {
        let toHash = asStr(gsi.hash_key!)
        if(gsi.range_key) {
            toHash += asStr(gsi.range_key)
        }
        return `${bag.Name}_${md5(toHash)}_${suffix}`
    }
    const ddbIndexName = (gsi: DatabagObjVal) => {
        if(gsi.range_key){
            return appendToTemplate(gsi.hash_key!, ['-', gsi.range_key, '-index'])
        }
        return appendToTemplate(gsi.hash_key!, ['-index'])
    }
    const indexDotAutoScaling = (gsi: DatabagObjVal): DatabagObjVal => {
        return asVal(mergeTokens([
            ...(block.auto_scaling?.ArrayConst || []),
            ...(gsi.auto_scaling?.ArrayConst || [])
        ]))
    }
    const makeAutoScalingResourceGroup = (params: {
        cloudResource: (type: string, name: string, value: string) => Databag, 
        prefix: string,
        dotAutoScaling: {[k: string]: any | undefined},
        gsi?: DatabagObjVal,
        dependsOn?: SyntaxToken[],
    }) => {
        return [
            cloudResource('aws_appautoscaling_target', `${params.prefix}_rt`, {
                depends_on: params.dependsOn,
                max_capacity: params.dotAutoScaling.max_read || params.dotAutoScaling.max || 1,
                min_capacity: params.dotAutoScaling.min_read || params.dotAutoScaling.min || 1,
                resource_id: asTemplate([
                    'table/',
                    asTraversal(`aws_dynamodb_table.${bag.Name}_aws_dynamodb.name`),
                    ...(params.gsi ? [
                        '/index/',
                        ddbIndexName(params.gsi)
                    ] : [])
                ]),
                service_namespace: "dynamodb",
                scalable_dimension: `dynamodb:${params.gsi ? 'index' : 'table'}:ReadCapacityUnits`,
            }),
            cloudResource('aws_appautoscaling_policy', `${params.prefix}_rp`, {
                depends_on: params.dependsOn,
                name: asTemplate([
                    "DynamoDBReadCapacityUtilization:",
                    asTraversal(`aws_appautoscaling_target.${params.prefix}_rt.resource_id`),
                ]),
                policy_type: "TargetTrackingScaling",
                resource_id: asTraversal(`aws_appautoscaling_target.${params.prefix}_rt.resource_id`),
                scalable_dimension: asTraversal(`aws_appautoscaling_target.${params.prefix}_rt.scalable_dimension`),
                service_namespace: asTraversal(`aws_appautoscaling_target.${params.prefix}_rt.service_namespace`),
                target_tracking_scaling_policy_configuration: asBlock([{
                    target_value: params.dotAutoScaling.target_value_read || params.dotAutoScaling.target_value || 80,
                    predefined_metric_specification: asBlock([{
                        predefined_metric_type: "DynamoDBReadCapacityUtilization",
                    }]),
                }])
            }),
            cloudResource('aws_appautoscaling_target', `${params.prefix}_wt`, {
                depends_on: params.dependsOn,
                max_capacity: params.dotAutoScaling.max_write || params.dotAutoScaling.max || 1,
                min_capacity: params.dotAutoScaling.min_write || params.dotAutoScaling.min || 1,
                resource_id: asTemplate([
                    'table/',
                    asTraversal(`aws_dynamodb_table.${bag.Name}_aws_dynamodb.name`),
                    ...(params.gsi ? [
                        '/index/',
                        ddbIndexName(params.gsi)
                    ] : [])
                ]),
                service_namespace: "dynamodb",
                scalable_dimension: `dynamodb:${params.gsi ? 'index' : 'table'}:WriteCapacityUnits`,
            }),
            cloudResource('aws_appautoscaling_policy', `${params.prefix}_wp`, {
                depends_on: params.dependsOn,
                name: asTemplate([
                    "DynamoDBWriteCapacityUtilization:",
                    asTraversal(`aws_appautoscaling_target.${params.prefix}_wt.resource_id`),
                ]),
                policy_type: "TargetTrackingScaling",
                resource_id: asTraversal(`aws_appautoscaling_target.${params.prefix}_wt.resource_id`),
                scalable_dimension: asTraversal(`aws_appautoscaling_target.${params.prefix}_wt.scalable_dimension`),
                service_namespace: asTraversal(`aws_appautoscaling_target.${params.prefix}_wt.service_namespace`),
                target_tracking_scaling_policy_configuration: asBlock([{
                    target_value: params.dotAutoScaling.target_value_write || params.dotAutoScaling.target_value || 80,
                    predefined_metric_specification: asBlock([{
                        predefined_metric_type: "DynamoDBWriteCapacityUtilization",
                    }]),
                }])
            }),
        ]
    }
    const makeRegionalReplica = (region: SyntaxToken) => {
        const regionStr = asStr(region)
        const provider = asTraversal(`aws.${regionStr}`)
        const cloudResource = preConfCloudResourceFactory(block, 'resource', { provider })
        const cloudData = preConfCloudResourceFactory(block, 'data', { provider })
        let localDatabags: SugarCoatedDatabag[] = [
            cloudResource('aws_dynamodb_table_replica', `${bag.Name}_${regionStr}_aws_dynamodb_replica`, (() => {
                let dependsOn: SyntaxToken[] = []
                if(block.auto_scaling) {
                    dependsOn.push(
                        asTraversal(`aws_appautoscaling_policy.${bag.Name}_aws_ddb_table_as_rp`),
                        asTraversal(`aws_appautoscaling_policy.${bag.Name}_aws_ddb_table_as_wp`),
                    )
                    if (dotGlobalSecondaryIndex) {
                        dependsOn.push(
                            ...dotGlobalSecondaryIndex.map(gsi => [
                                asTraversal(`aws_appautoscaling_policy.${indexResourceName(gsi, 'aws_ddb_table_ind_as_rp')}`),
                                asTraversal(`aws_appautoscaling_policy.${indexResourceName(gsi, 'aws_ddb_table_ind_as_wp')}`),
                            ]).flat(),
                        )
                    }
                }
                return {
                    global_table_arn: asTraversal(`aws_dynamodb_table.${bag.Name}_aws_dynamodb.arn`),
                    depends_on: dependsOn
                }
            })()),
            cloudData('aws_dynamodb_table', `${bag.Name}_${regionStr}_aws_dynamodb_replica`, {
                name: asTraversal(`aws_dynamodb_table.${bag.Name}_aws_dynamodb.name`),
                depends_on: [
                    asTraversal(`aws_dynamodb_table_replica.${bag.Name}_${regionStr}_aws_dynamodb_replica`)
                ]
            }),
        ]
        if(block.auto_scaling) {
            localDatabags.push(
                ...makeAutoScalingResourceGroup({
                    cloudResource,
                    dotAutoScaling,
                    prefix: `${bag.Name}_aws_ddb_replica_${regionStr}_as`,
                    dependsOn: [
                        asTraversal(`aws_dynamodb_table_replica.${bag.Name}_${regionStr}_aws_dynamodb_replica`)
                    ],
                })
            )
            if (dotGlobalSecondaryIndex) {
                localDatabags.push(
                    ...dotGlobalSecondaryIndex.map(gsi => makeAutoScalingResourceGroup({
                        cloudResource,
                        dotAutoScaling: indexDotAutoScaling(gsi),
                        prefix: indexResourceName(gsi, `aws_ddb_replica_${regionStr}_ind_as`),
                        dependsOn: [
                            asTraversal(`aws_dynamodb_table_replica.${bag.Name}_${regionStr}_aws_dynamodb_replica`)
                        ],
                    })).flat(),
                )
            }
        }
        return localDatabags
    }


    const ddbStreamEvents = iterateBlocks(container, AWS_FUNCTION, (awsFuncBag) => {
        if(!awsFuncBag.Value) {
            return []
        }
        if(awsFuncBag.Value.Type !== 'object_const' || !awsFuncBag.Value.ObjectConst) {
            return []
        }
        return awsFuncBag.Value.ObjectConst.map(pair => {
            if(pair.Key !== EVENT_DYNAMODB_STREAM || !pair.Value || pair.Value.Type !== 'array_const' || !pair.Value.ArrayConst) {
                return [];
            }
            const events = asValArrayConst(pair.Value) as DatabagObjVal[];
            const myEvents = events.filter(event =>
                event.table &&
                event.table.Traversal &&
                event.table.Traversal[1] &&
                event.table.Traversal[1].Name === bag.Name
            );
            return myEvents.map(event => ({
                event: event,
                bag: awsFuncBag
            }))
        }).flat()
    }).flat()
    const dotGlobalSecondaryIndex: DatabagObjVal[] | undefined = block.global_secondary_index ? asValArrayConst(block.global_secondary_index) : undefined
    
    type AttrCandidate = { 
        type: SyntaxToken | string, 
        name: SyntaxToken | string 
    }
    let attributeCandidates: AttrCandidate[] = [
        {
            name: block.hash_key,
            type: block.hash_key_type || 'S'
        }
    ]
    if (block.range_key) {
        attributeCandidates.push({
            name: block.range_key,
            type: block.range_key_type || 'S'
        })
    }
    if (dotGlobalSecondaryIndex) {
        attributeCandidates.push(
            ...dotGlobalSecondaryIndex.map((gsi, i) => {
                if(!gsi.hash_key) {
                    throw new Error(`DynamoDB global secondary index '${bag.Name}.global_secondary_index[${i}]' has no hash_key`)
                }
                let gsiAttrs: AttrCandidate[] = [
                    {
                        name: gsi.hash_key,
                        type: gsi.hash_key_type || 'S'
                    }
                ]
                if (gsi.range_key) {
                    gsiAttrs.push({
                        name: gsi.range_key,
                        type: gsi.range_key_type || 'S'
                    })
                }
                return gsiAttrs
            }).flat()
        )
    }
    const attributes = uniq(attributeCandidates, c => asStr(c.name))

    let databags = [
        traversalTransform('aws_dynamodb_traversal_transform', {
            [`aws_dynamodb.${bag.Name}`]: `aws_dynamodb_table.${bag.Name}_aws_dynamodb`
        }),
        cloudResource('aws_dynamodb_table', `${bag.Name}_aws_dynamodb`, {
            name: appendToTemplate(namePrefix, [bag.Name]),
            billing_mode: block.billing_mode || 'PROVISIONED',
            read_capacity: block.read_capacity || 1,
            write_capacity: block.write_capacity || 1,
            hash_key: block.hash_key,
            range_key: block.range_key,
            // streams are required when:
            // - a dynamodb stream event handler exists
            // - using multi region replicas
            stream_enabled: block.stream_enabled || ddbStreamEvents.length > 0 || regions.length > 1,
            stream_view_type: block.stream_view_type || (ddbStreamEvents.length > 0 || regions.length > 1 ? 'NEW_AND_OLD_IMAGES' : undefined),
            table_class: block.table_class,
            attribute: asBlock(attributes),
            ttl: block.ttl_key ? asBlock([{
                enabled: true,
                attribute_name: block.ttl_key
            }]) : undefined,
            global_secondary_index: dotGlobalSecondaryIndex ? asBlock(dotGlobalSecondaryIndex.map(gsi => ({
                name: ddbIndexName(gsi),
                hash_key: gsi.hash_key,
                range_key: gsi.range_key,
                read_capacity: gsi.read_capacity || 1,
                write_capacity: gsi.write_capacity || 1,
                projection_type: gsi.projection_type || 'ALL'
            }))) : undefined,
            lifecycle: block.auto_scaling ? asBlock([{
                ignore_changes: [
                    asTraversal('read_capacity'), 
                    asTraversal('write_capacity'),
                    asTraversal('global_secondary_index')
                ].concat(regions.length > 1 ? [asTraversal('replica')] : [])
            }]) : undefined,
            point_in_time_recovery: block.enable_point_in_time_recovery ? asBlock([{
                enabled: block.enable_point_in_time_recovery
            }]) : undefined,
        }),
        ...ddbStreamEvents.map(({event, bag: otherBag}, i) => {
            //otherBag is an aws_function block
            if(!otherBag.Value) {
                return []
            }
            const [otherBlock, _] = applyDefaults(container, otherBag.Value);
            let localCloudResource = cloudResource

            if(regions.length > 0) {
                if(!otherBlock.region) {
                    throw new Error(`DynamoDB stream event handler on 'aws_function.${otherBag.Name}' must have a region specified because the table 'aws_dynamodb.${bag.Name}' has one or more regions specified`)
                }
                const otherRegion = asStr(otherBlock.region)
                if(!(otherRegion in regions)) {
                    throw new Error(`the function 'aws_function.${otherBag.Name}' is in region '${otherRegion}' but is trying to subscribe to dynamodb streams on table 'aws_dynamodb.${bag.Name}' only available in regions: ${Object.keys(regionMap).map(r => `'${r}'`).join(', ')}`)
                }
                const provider = asTraversal(`aws.${otherRegion}`)
                localCloudResource = preConfCloudResourceFactory(block, 'resource', { provider })
            }
            const regionStr = asStr(otherBlock.region || 'noreg')

            let localDatabags = [
                localCloudResource('aws_lambda_event_source_mapping', `${bag.Name}_${i}_ddb_stream`, {
                    batch_size: event.batch_size,
                    starting_position: event.starting_position || 'TRIM_HORIZON',
                    enabled: event.enabled,
                    function_response_types: event.function_response_types,
                    parallelization_factor: event.parallelization_factor,
                    maximum_batching_window_in_seconds: event.maximum_batching_window_in_seconds,
                    maximum_record_age_in_seconds: event.maximum_record_age_in_seconds,
                    bisect_batch_on_function_error: event.bisect_batch_on_function_error,
                    maximum_retry_attempts: event.maximum_retry_attempts,
                    tumbling_window_in_seconds: event.tumbling_window_in_seconds,
                    function_name: asTraversal(`aws_lambda_function.${otherBag.Name}_lambda.function_name`),
                    destination_config: event.on_failure_destination_arn ? asBlock([{
                        on_failure: asBlock([{
                            destination_arn: event.on_failure_destination_arn
                        }])
                    }]) : undefined,
                    event_source_arn: (() => {
                        let sourceArn: SyntaxToken
                        if(!event.type || asStr(event.type) === 'dynamodb') {
                            if (!event.table) {
                                throw new Error(`'aws_function.${otherBag.Name}.table' must be specified if 'aws_function.${otherBag.Name}.type' is empty or 'dynamodb'`)
                            }
                            sourceArn = appendToTraversal(event.table!, 'stream_arn')
                        } else if (asStr(event.type) === 'kinesis') {
                            if (!event.stream) {
                                throw new Error(`Kinesis stream event handler on 'aws_function.${otherBag.Name}' must have a stream specified`)
                            }
                            sourceArn = asTraversal(`aws_kinesis_stream.${bag.Name}_${regionStr}_aws_kinesis_stream.arn`)
                        } else {
                            throw new Error(`'${asStr(event.type)}' is an invalid value for 'aws_function.${otherBag.Name}.type'`)
                        }
                        return sourceArn
                    })(),
                    filter_criteria: event.filter ? asBlock([{
                        filter: asBlock(asValArrayConst(event.filter).map(f => ({
                            pattern: f.pattern,
                        })))
                    }]) : undefined
                })
            ]
            if (event.type && asStr(event.type) === 'kinesis') {
                localDatabags.push(
                    //this is not a cloud resource, it relies on the `aws_kinesis.ts` component
                    //this is done because that way the aws_iam component can detect it and populate the iam role accordingly
                    {
                        Type: 'aws_kinesis_stream',
                        Name: `${bag.Name}_${regionStr}_aws_kinesis_stream`,
                        Value: asSyntax({
                            region: otherBlock.region,
                            name: asTemplate([
                                asTraversal(`aws_dynamodb_table.${bag.Name}_aws_dynamodb.name`),
                                '-ddb-stream-dest'
                            ]),
                            shard_count: 1,
                        })
                    },
                    localCloudResource('aws_dynamodb_kinesis_streaming_destination', `${bag.Name}_${regionStr}_ddb_kinesis_dest`, {
                        stream_arn: asTraversal(`aws_kinesis_stream.${bag.Name}_${regionStr}_aws_kinesis_stream.arn`),
                        table_name: asTraversal(`aws_dynamodb_table.${bag.Name}_aws_dynamodb.name`),
                    })
                )
            }
            return localDatabags
        }).flat()
    ]
    if (block.kinesis_stream) {
        databags.push(
            cloudResource('aws_dynamodb_kinesis_streaming_destination', `${bag.Name}_ddb_kinesis_dest`, {
                stream_arn: appendToTraversal(block.kinesis_stream, 'arn'),
                table_name: asTraversal(`aws_dynamodb_table.${bag.Name}_aws_dynamodb.name`),
            })
        )
    }
    if (regions.length > 1) {
        databags.push(
            ...regions.map((region, i) => {
                if(i === 0) {
                    //the first region is the primary region
                    return []
                }
                return makeRegionalReplica(region)
            }).flat()
        )
    }
    if (block.auto_scaling) {
        databags.push(
            ...makeAutoScalingResourceGroup({
                cloudResource,
                prefix: `${bag.Name}_aws_ddb_table_as`,
                dotAutoScaling,
            })
        )
        if (dotGlobalSecondaryIndex) {
            databags.push(
                ...dotGlobalSecondaryIndex.map((gsi, i) => makeAutoScalingResourceGroup({
                    cloudResource,
                    prefix: indexResourceName(gsi, 'aws_ddb_table_ind_as'),
                    dotAutoScaling: indexDotAutoScaling(gsi),
                    gsi,
                })).flat()
            )
        }
    }

    return databags
}


exportDatabags([
    ...iterateBlocks(container, AWS_DYNAMODB, awsDynamodbIterator).flat(),
    ...orphanKinesisSourceMappings,
])

