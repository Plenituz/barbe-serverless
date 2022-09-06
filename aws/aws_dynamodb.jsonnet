local barbe = std.extVar("barbe");
local container = std.extVar("container");
local globalDefaults = barbe.compileDefaults(container, "");

//TODO might want to have a similar orphan list for all the event_dynamodb_stream that use an external resource as the kinesis_stream value (like a kinesis stream declared in their own terraform)
local ddbStreamEventsKinesisOrphans = barbe.flatten([
    barbe.iterateBlocks(container, "aws_function", function(bag)
        local other = barbe.asVal(bag.Value);
        if std.objectHas(other, "event_dynamodb_stream") then
            [
                {event: event, block: other}
                for event in barbe.asValArrayConst(other.event_dynamodb_stream)
                if std.objectHas(event, "type") && barbe.asStr(event.type) == "kinesis" &&
                    std.objectHas(event, "kinesis_stream") && event.kinesis_stream.Traversal[0].Name == "aws_kinesis_stream"
            ]
        else
            []
    ),
]);

local makeIndexResourceName(label, index, suffix) =
    local indexHash = std.md5(barbe.asStr(index.hash_key) + (if std.objectHas(index, "range_key") then barbe.asStr(index.range_key) else ""));
    label + indexHash + suffix
;

local makeDDBIndexName(index) =
    assert std.objectHas(index, "hash_key") : "hash_key is required for an index";
    if std.objectHas(index, "range_key") then
        barbe.appendToTemplate(index.hash_key, [barbe.asSyntax("-"), index.range_key, barbe.asSyntax("-index")])
    else
        barbe.appendToTemplate(index.hash_key, [barbe.asSyntax("-index")])
    ;

local makeAutoScalingResourceGroup(provider, tableName, groupName, settingsObj, indexObj=null, dependsOn=null) = [
    {
        Name: groupName + "_rt",
        Type: "cr_aws_appautoscaling_target",
        Value: {
            depends_on: if dependsOn != null then dependsOn,
            provider: provider,
            max_capacity: std.get(settingsObj, "max_read", std.get(settingsObj, "max", 1)),
            min_capacity: std.get(settingsObj, "min_read", std.get(settingsObj, "min", 1)),
            resource_id: barbe.asTemplate(barbe.flatten([
                "table/",
                barbe.asTraversal("aws_dynamodb_table." + tableName + ".name"),
                if indexObj != null then
                    ["/index/", makeDDBIndexName(indexObj)]
                else
                    []
            ])),
            scalable_dimension: "dynamodb:" + (if indexObj != null then "index" else "table") + ":ReadCapacityUnits",
            service_namespace: "dynamodb",
        }
    },
    {
        Name: groupName + "_rp",
        Type: "cr_aws_appautoscaling_policy",
        Value: {
            depends_on: if dependsOn != null then dependsOn,
            provider: provider,
            name: barbe.asTemplate([
                "DynamoDBReadCapacityUtilization:",
                barbe.asTraversal("aws_appautoscaling_target." + groupName + "_rt.resource_id"),
            ]),
            policy_type: "TargetTrackingScaling",
            resource_id: barbe.asTraversal("aws_appautoscaling_target." + groupName + "_rt.resource_id"),
            scalable_dimension: barbe.asTraversal("aws_appautoscaling_target." + groupName + "_rt.scalable_dimension"),
            service_namespace: barbe.asTraversal("aws_appautoscaling_target." + groupName + "_rt.service_namespace"),
            target_tracking_scaling_policy_configuration: barbe.asBlock([{
                target_value: std.get(settingsObj, "target_value_read", std.get(settingsObj, "target_value", 80)),
                predefined_metric_specification: barbe.asBlock([{
                    predefined_metric_type: "DynamoDBReadCapacityUtilization",
                }]),
            }])
        }
    },
    {
        Name: groupName + "_wt",
        Type: "cr_aws_appautoscaling_target",
        Value: {
            depends_on: if dependsOn != null then dependsOn,
            provider: provider,
            max_capacity: std.get(settingsObj, "max_write", std.get(settingsObj, "max", 1)),
            min_capacity: std.get(settingsObj, "min_write", std.get(settingsObj, "min", 1)),
            resource_id: barbe.asTemplate(barbe.flatten([
                "table/",
                barbe.asTraversal("aws_dynamodb_table." + tableName + ".name"),
                if indexObj != null then
                    ["/index/", makeDDBIndexName(indexObj)]
                else
                    []
            ])),
            scalable_dimension: "dynamodb:" + (if indexObj != null then "index" else "table") + ":WriteCapacityUnits",
            service_namespace: "dynamodb",
        }
    },
    {
        Name: groupName + "_wp",
        Type: "cr_aws_appautoscaling_policy",
        Value: {
            depends_on: if dependsOn != null then dependsOn,
            provider: provider,
            name: barbe.asTemplate([
                "DynamoDBWriteCapacityUtilization:",
                barbe.asTraversal("aws_appautoscaling_target." + groupName + "_wt.resource_id"),
            ]),
            policy_type: "TargetTrackingScaling",
            resource_id: barbe.asTraversal("aws_appautoscaling_target." + groupName + "_wt.resource_id"),
            scalable_dimension: barbe.asTraversal("aws_appautoscaling_target." + groupName + "_wt.scalable_dimension"),
            service_namespace: barbe.asTraversal("aws_appautoscaling_target." + groupName + "_wt.service_namespace"),
            target_tracking_scaling_policy_configuration: barbe.asBlock([{
                target_value: std.get(settingsObj, "target_value_write", std.get(settingsObj, "target_value", 80)),
                predefined_metric_specification: barbe.asBlock([{
                    predefined_metric_type: "DynamoDBWriteCapacityUtilization",
                }]),
            }])
        }
    }
];


barbe.databags([
    //this case is basically equivalent to having a event_kinesis directly
    [
        local tuple = ddbStreamEventsKinesisOrphans[streamIndex];
        local funcLabel = tuple.bag.Name;
        //TODO apply defaults to tuple.event?
        local tupleFullBlock = barbe.asVal(barbe.mergeTokens([barbe.asSyntax(barbe.makeBlockDefault(container, globalDefaults, tuple.bag.Value)), barbe.asSyntax(tuple.bag.Value)]));
        {
            Name: "ddb_stream_sub_orphan_" + streamIndex,
            Type: "cr_aws_lambda_event_source_mapping",
            Value: {
                //TODO output an error if the region is not in the list of region of the dynamodb
                provider: barbe.asTraversal("aws." + barbe.asStr(tupleFullBlock.region)),
                batch_size: std.get(tuple.event, "batch_size", null),
                starting_position: std.get(tuple.event, "starting_position", "TRIM_HORIZON"),
                enabled: std.get(tuple.event, "enabled", null),
                function_response_types: std.get(tuple.event, "function_response_types", null),
                parallelization_factor: std.get(tuple.event, "parallelization_factor", null),
                maximum_batching_window_in_seconds: std.get(tuple.event, "maximum_batching_window_in_seconds", null),
                maximum_record_age_in_seconds: std.get(tuple.event, "maximum_record_age_in_seconds", null),
                bisect_batch_on_function_error: std.get(tuple.event, "bisect_batch_on_function_error", null),
                tumbling_window_in_seconds: std.get(tuple.event, "tumbling_window_in_seconds", null),
                function_name: barbe.asTraversal("aws_lambda_function." + funcLabel + "_lambda.function_name"),
                destination_config:
                    if std.objectHas(tuple.event, "on_failure_destination_arn") then
                        barbe.asBlock([{
                            on_failure: barbe.asBlock([{
                                destination_arn: tuple.event.on_failure_destination_arn,
                            }])
                        }])
                    else
                        null
                    ,
                event_source_arn: barbe.appendToTraversal(tuple.event.kinesis_stream, "arn"),
                filter_criteria:
                    if std.objectHas(tuple.event, "filter") then
                        barbe.asBlock([{
                            filter: barbe.asBlock([
                                { pattern: f.pattern }
                                for f in barbe.asValArrayConst(tuple.event.filter)
                            ]),
                        }])
                    else
                        null
                    ,
            }
        }
        for streamIndex in std.range(0, std.length(ddbStreamEventsKinesisOrphans)-1)
    ]
    ,
    barbe.iterateBlocks(container, "aws_dynamodb", function(bag)
        local block = barbe.asVal(bag.Value);
        local labels = barbe.flatten([bag.Name, bag.Labels]);
        local blockDefaults = barbe.makeBlockDefault(container, globalDefaults, block);
        local validator = {
            hash_key: error "<showuser>hash_key is required on 'aws_dynamodb." + labels[0] + "'</showuser>",
        };
        local fullBlock = validator + barbe.asVal(barbe.mergeTokens([barbe.asSyntax(blockDefaults), bag.Value]));
        local namePrefix = barbe.concatStrArr(std.get(fullBlock, "name_prefix", barbe.asSyntax([""])));


        local regVal = std.get(fullBlock, "regions", std.get(fullBlock, "region", null));
        //regions will always be an array or null
        local regions =
            if regVal == null then
                null
            else if regVal.Type == "array_const" then
                local r = barbe.asVal(regVal);
                if std.length(r) == 0 then
                    std.trace("'aws_dynamodb." + labels[0] + ".region' is an empty array, that's probably unintentional", null)
                else
                    r
            else
                [regVal]
            ;
        local provider =
            if regions == null then
                null
            else
                barbe.asTraversal("aws." + barbe.asStr(regions[0]))
            ;

        local ddbStreamEvents = barbe.flatten([
            barbe.iterateBlocks(container, "aws_function", function(bag)
                local other = barbe.asVal(bag.Value);
                if std.objectHas(other, "event_dynamodb_stream") then
                    [
                        {event: event, bag: bag}
                        for event in barbe.asValArrayConst(other.event_dynamodb_stream)
                        if (std.objectHas(event, "table") && event.table.Traversal[1].Name == labels[0])
                    ]
                else
                    []
            ),
        ]);

        [
            {
                Name: labels[0] + "_aws_dynamodb_traversal_transform",
                Type: "traversal_transform",
                Value: {
                    ["aws_dynamodb." + labels[0]]: "aws_dynamodb_table." + labels[0] + "_aws_dynamodb"
                }
            },
            {
                Name: labels[0] + "_aws_dynamodb",
                Type: "cr_aws_dynamodb_table",
                Value: {
                    provider: provider,
                    name: barbe.appendToTemplate(namePrefix, [barbe.asSyntax(labels[0])]),
                    billing_mode: "PROVISIONED",
                    read_capacity: std.get(fullBlock, "read_capacity", 1),
                    write_capacity: std.get(fullBlock, "write_capacity", 1),
                    hash_key: fullBlock.hash_key,
                    range_key: std.get(fullBlock, "range_key", null),
                    stream_enabled: std.get(fullBlock, "stream_enabled", std.length(ddbStreamEvents) > 0 || (regions != null && std.length(regions) > 1)),
                    stream_view_type: std.get(
                        fullBlock, "stream_view_type",
                        if std.length(ddbStreamEvents) > 0 || (regions != null && std.length(regions) > 1) then "NEW_AND_OLD_IMAGES" else null
                    ),
                    table_class: std.get(fullBlock, "table_class", null),
                    attribute: barbe.asBlock(std.set(barbe.flatten([
                        {
                            name: fullBlock.hash_key,
                            type: std.get(fullBlock, "hash_key_type", "S"),
                        },
                        if std.objectHas(fullBlock, "range_key") then
                            {
                                name: fullBlock.range_key,
                                type: std.get(fullBlock, "range_key_type", "S"),
                            }
                        else
                            []
                        ,
                        if std.objectHas(fullBlock, "global_secondary_index") then
                            local gsi = barbe.asValArrayConst(fullBlock.global_secondary_index);
                            [
                                local index = gsi[i];
                                [
                                    {
                                        name: std.get(index, "hash_key", error "<showuser>aws_dynamodb." + labels[0] + ".global_secondary_index.[" + i + "]: hash_key is required</showuser>"),
                                        type: std.get(index, "hash_key_type", "S"),
                                    },
                                    if std.objectHas(index, "range_key") then
                                        {
                                            name: index.range_key,
                                            type: std.get(index, "range_key_type", "S"),
                                        }
                                    else
                                        []
                                    ,
                                ]
                                for i in std.range(0, std.length(gsi)-1)
                            ]
                        else
                            []
                        ,
                    ]), function(o) barbe.asStr(o.name))),
                    ttl:
                        if std.objectHas(fullBlock, "ttl_key") then
                            barbe.asBlock([{
                                enabled: true,
                                attribute_name: fullBlock.ttl_key,
                            }])
                        else
                            null
                        ,
                    global_secondary_index:
                        if std.objectHas(fullBlock, "global_secondary_index") then
                            local gsi = barbe.asValArrayConst(fullBlock.global_secondary_index);
                            barbe.asBlock([
                                {
                                    local index = gsi[i],
                                    name:
                                        if std.objectHas(index, "range_key") then
                                            barbe.appendToTemplate(index.hash_key, [barbe.asSyntax("-"), index.range_key, barbe.asSyntax("-index")])
                                        else
                                            barbe.appendToTemplate(index.hash_key, [barbe.asSyntax("-index")])
                                        ,
                                    hash_key: std.get(index, "hash_key", error "<showuser>aws_dynamodb." + labels[0] + ".global_secondary_index.[" + i + "]: hash_key is required</showuser>"),
                                    range_key: std.get(index, "range_key", null),
                                    read_capacity: std.get(index, "read_capacity", 1),
                                    write_capacity: std.get(index, "write_capacity", 1),
                                    projection_type: std.get(index, "projection_type", "ALL"),
                                }
                                for i in std.range(0, std.length(gsi)-1)
                            ])
                        else
                            null
                        ,
                    lifecycle:
                        if std.objectHas(fullBlock, "auto_scaling") then
                            barbe.asBlock([{
                                ignore_changes: barbe.flatten([
                                    barbe.asTraversal("read_capacity"),
                                    barbe.asTraversal("write_capacity"),
                                    if regions != null && std.length(regions) > 1 then
                                       barbe.asTraversal("replica")
                                    else
                                        []
                                    ,
                                ])
                            }])
                        else
                            null
                        ,
                    point_in_time_recovery:
                        if std.objectHas(fullBlock, "enable_point_in_time_recovery") then
                            barbe.asBlock([{
                                enabled: fullBlock.enable_point_in_time_recovery,
                            }])
                        else
                            null
                        ,
                }
            },
            if std.objectHas(fullBlock, "kinesis_stream") then
                {
                    Name: labels[0] + "_ddb_kinesis_dest",
                    Type: "cr_aws_dynamodb_kinesis_streaming_destination",
                    Value: {
                        provider: provider,
                        stream_arn: barbe.appendToTraversal(fullBlock.kinesis_stream, "arn"),
                        table_name: barbe.asTraversal("aws_dynamodb_table." + labels[0] + "_aws_dynamodb.name"),
                    }
                }
            ,
            if regions != null && std.length(regions) > 1 then
                [
                    local regionStr = barbe.asStr(regions[regionIndex]);
                    local provider = barbe.asTraversal("aws." + regionStr);
                    [
                        {
                            Name: labels[0]+ "_" + regionStr + "_aws_dynamodb_replica",
                            Type: "cr_aws_dynamodb_table_replica",
                            Value: {
                                provider: provider,
                                global_table_arn: barbe.asTraversal("aws_dynamodb_table." + labels[0] + "_aws_dynamodb.arn"),
                                depends_on:
                                    if !std.objectHas(fullBlock, "auto_scaling") then
                                        null
                                    else
                                        barbe.flatten([
                                            barbe.asTraversal("aws_appautoscaling_policy." + labels[0] + "_aws_ddb_table_as_rp"),
                                            barbe.asTraversal("aws_appautoscaling_policy." + labels[0] + "_aws_ddb_table_as_wp"),
                                            if std.objectHas(fullBlock, "global_secondary_index") then
                                                [
                                                    local indexAutoscaling = barbe.asVal(barbe.mergeTokens(std.flattenArrays([fullBlock.auto_scaling.ArrayConst, std.get(index, "auto_scaling", barbe.asSyntax([])).ArrayConst])));
                                                    [
                                                        barbe.asTraversal("aws_appautoscaling_policy." + makeIndexResourceName(labels[0], index, "_aws_ddb_table_ind_as_rp")),
                                                        barbe.asTraversal("aws_appautoscaling_policy." + makeIndexResourceName(labels[0], index, "_aws_ddb_table_ind_as_wp")),
                                                    ]
                                                    for index in barbe.asValArrayConst(fullBlock.global_secondary_index)
                                                ]
                                            else
                                                []
                                            ,
                                        ])
                                    ,
                            }
                        },
                        {
                            Name: labels[0]+ "_" + regionStr + "_aws_dynamodb_replica",
                            Type: "cr_[data]_aws_dynamodb_table",
                            Value: {
                                depends_on: [
                                    barbe.asTraversal("aws_dynamodb_table_replica." + labels[0] + "_" + regionStr + "_aws_dynamodb_replica")
                                ],
                                provider: provider,
                                name: barbe.asTraversal("aws_dynamodb_table." + labels[0] + "_aws_dynamodb.name")
                            }
                        },
                        if std.objectHas(fullBlock, "auto_scaling") then
                            local dotAutoscaling = barbe.asVal(barbe.mergeTokens(fullBlock.auto_scaling.ArrayConst));
                            [
                                makeAutoScalingResourceGroup(
                                    provider=provider,
                                    tableName=labels[0] + "_aws_dynamodb",
                                    groupName=labels[0] + "_aws_ddb_replica_" + regionStr + "_as",
                                    settingsObj=dotAutoscaling,
                                    dependsOn=[barbe.asTraversal("aws_dynamodb_table_replica." + labels[0]+ "_" + regionStr + "_aws_dynamodb_replica")],
                                ),
                                if std.objectHas(fullBlock, "global_secondary_index") then
                                    [
                                        local indexAutoscaling = barbe.asVal(barbe.mergeTokens(std.flattenArrays([fullBlock.auto_scaling.ArrayConst, std.get(index, "auto_scaling", barbe.asSyntax([])).ArrayConst])));
                                        [
                                            makeAutoScalingResourceGroup(
                                                provider=provider,
                                                tableName=labels[0] + "_aws_dynamodb",
                                                groupName=makeIndexResourceName(labels[0], index, "_aws_ddb_replica_" + regionStr + "_ind_as"),
                                                settingsObj=indexAutoscaling,
                                                indexObj=index,
                                                dependsOn=[barbe.asTraversal("aws_dynamodb_table_replica." + labels[0]+ "_" + regionStr + "_aws_dynamodb_replica")],
                                            )
                                        ]
                                        for index in barbe.asValArrayConst(fullBlock.global_secondary_index)
                                    ]
                            ]
                    ]
                    for regionIndex in std.range(1, std.length(regions)-1)
                ]
            ,

            if std.objectHas(fullBlock, "auto_scaling") then
                local dotAutoscaling = barbe.asVal(barbe.mergeTokens(fullBlock.auto_scaling.ArrayConst));
                [
                    makeAutoScalingResourceGroup(
                        provider=provider,
                        tableName=labels[0] + "_aws_dynamodb",
                        groupName=labels[0] + "_aws_ddb_table_as",
                        settingsObj=dotAutoscaling,
                    ),
                    if std.objectHas(fullBlock, "global_secondary_index") then
                        [
                            local indexAutoscaling = barbe.asVal(barbe.mergeTokens(std.flattenArrays([fullBlock.auto_scaling.ArrayConst, std.get(index, "auto_scaling", barbe.asSyntax([])).ArrayConst])));
                            makeAutoScalingResourceGroup(
                                provider=provider,
                                tableName=labels[0] + "_aws_dynamodb",
                                groupName=makeIndexResourceName(labels[0], index, "_aws_ddb_table_ind_as"),
                                settingsObj=indexAutoscaling,
                                indexObj=index,
                            )
                            for index in barbe.asValArrayConst(fullBlock.global_secondary_index)
                        ],
                ],

            [
                local tuple = ddbStreamEvents[streamIndex];
                local funcLabel = tuple.bag.Name;
                local tupleFullBlock = barbe.asVal(barbe.mergeTokens([barbe.asSyntax(barbe.makeBlockDefault(container, globalDefaults, tuple.bag.Value)), barbe.asSyntax(tuple.bag.Value)]));
                [{
                    Name: labels[0] + "_" + streamIndex + "_ddb_stream_sub",
                    Type: "cr_aws_lambda_event_source_mapping",
                    Value: {
                        //TODO output an error if the region is not in the list of region of the dynamodb
                        provider:
                            if regions != null && !std.member([barbe.asStr(r) for r in regions], barbe.asStr(tupleFullBlock.region)) then
                                error "<showuser> the function 'aws_function." + funcLabel + "' is in region '" + barbe.asStr(tupleFullBlock.region) + "' but is trying to subscribe to dynamodb streams on table 'aws_dynamodb." + labels[0] + "' only available in regions: " + std.join(", ", ["'" + barbe.asStr(r) + "'" for r in regions]) + "</showuser>"
                            else
                                barbe.asTraversal("aws." + barbe.asStr(tupleFullBlock.region)),
                        batch_size: std.get(tuple.event, "batch_size", null),
                        starting_position: std.get(tuple.event, "starting_position", "TRIM_HORIZON"),
                        enabled: std.get(tuple.event, "enabled", null),
                        function_response_types: std.get(tuple.event, "function_response_types", null),
                        parallelization_factor: std.get(tuple.event, "parallelization_factor", null),
                        maximum_batching_window_in_seconds: std.get(tuple.event, "maximum_batching_window_in_seconds", null),
                        maximum_record_age_in_seconds: std.get(tuple.event, "maximum_record_age_in_seconds", null),
                        bisect_batch_on_function_error: std.get(tuple.event, "bisect_batch_on_function_error", null),
                        tumbling_window_in_seconds: std.get(tuple.event, "tumbling_window_in_seconds", null),
                        function_name: barbe.asTraversal("aws_lambda_function." + funcLabel + "_lambda.function_name"),
                        destination_config:
                            if std.objectHas(tuple.event, "on_failure_destination_arn") then
                                barbe.asBlock([{
                                    on_failure: barbe.asBlock([{
                                        destination_arn: tuple.event.on_failure_destination_arn,
                                    }])
                                }])
                            else
                                null
                            ,
                        event_source_arn:
                            if !std.objectHas(tuple.event, "type") || barbe.asStr(tuple.event.type) == "dynamodb" then
                                if regions == null || barbe.asStr(tupleFullBlock.region) == barbe.asStr(regions[0]) then
                                    barbe.appendToTraversal(tuple.event.table, "stream_arn")
                                else
                                    barbe.asTraversal("data.aws_dynamodb_table." + labels[0] + "_" + std.md5(barbe.asStr(tupleFullBlock.region)) + "_aws_dynamodb_replica.stream_arn")
                            else if barbe.asStr(tuple.event.type) == "kinesis" then
                                barbe.asTraversal("aws_kinesis_stream." + labels[0] + "_" + barbe.asStr(tupleFullBlock.region) + "_aws_kinesis_stream.arn")
                            else
                                error "<showuser>'" + barbe.asStr(tuple.event.type) + "' is an invalid value for 'aws_function." + funcLabel + ".event_dynamodb_stream[" + streamIndex + "].type', value must be 'dynamodb' or 'kinesis'</showuser>"
                            ,
                        filter_criteria:
                            if std.objectHas(tuple.event, "filter") then
                                barbe.asBlock([{
                                    filter: barbe.asBlock([
                                        { pattern: f.pattern }
                                        for f in barbe.asValArrayConst(tuple.event.filter)
                                    ]),
                                }])
                            else
                                null
                            ,
                    }
                },
                if std.objectHas(tuple.event, "type") && barbe.asStr(tuple.event.type) == "kinesis" then
                    [{
                        //"_aws_kinesis_stream" is important, see aws_kinesis_stream block below
                        Name: labels[0] + "_" + barbe.asStr(tupleFullBlock.region) + "_aws_kinesis_stream",
                        Type: "cr_aws_kinesis_stream",
                        Value: {
                            provider: barbe.asTraversal("aws." + barbe.asStr(tupleFullBlock.region)),
                            name: barbe.asTemplate([
                                barbe.asTraversal("aws_dynamodb_table." + labels[0] + "_aws_dynamodb.name"),
                                "-ddb-stream-dest"
                            ]),
                            shard_count: 1,
                        }
                    },
                    //this block is only so the aws_iam.jsonnet file that runs in the next step knows about this
                    //kinesis stream and adds the iam permissions properly. This is also the reason we have to have the
                    //"_aws_kinesis_stream" suffix at the end of the name
                    {
                        Name: labels[0] + "_" + barbe.asStr(tupleFullBlock.region),
                        Type: "aws_kinesis_stream",
                        Value: {}
                    },
                    {
                        Name: labels[0] + "_" + barbe.asStr(tupleFullBlock.region) + "_ddb_kinesis_dest",
                        Type: "cr_aws_dynamodb_kinesis_streaming_destination",
                        Value: {
                            provider: barbe.asTraversal("aws." + barbe.asStr(tupleFullBlock.region)),
                            stream_arn: barbe.asTraversal("aws_kinesis_stream." + labels[0] + "_" + barbe.asStr(tupleFullBlock.region) + "_aws_kinesis_stream.arn"),
                            table_name: barbe.asTraversal("aws_dynamodb_table." + labels[0] + "_aws_dynamodb.name"),
                        }
                    }]
                ,
                ]
                for streamIndex in std.range(0, std.length(ddbStreamEvents)-1)
            ]
        ]
    )
])