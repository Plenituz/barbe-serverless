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
                    Value: bag.Value + { provider: barbe.asTraversal("aws." + barbe.asStr(fullBlock.region)) }
                }
            else
                bag
            for bag in bags if bag != null
        ]
    ;


barbe.databags([
    barbe.iterateBlocks(container, "aws_s3", function(bag)
        local block = barbe.asVal(bag.Value);
        local labels = barbe.flatten([bag.Name, bag.Labels]);
        local blockDefaults = barbe.makeBlockDefault(container, globalDefaults, block);
        local fullBlock = barbe.asVal(barbe.mergeTokens([barbe.asSyntax(blockDefaults), bag.Value]));
        local namePrefix = barbe.concatStrArr(std.get(fullBlock, "name_prefix", barbe.asSyntax([""])));

        local allEventS3 = barbe.flatten([
            barbe.iterateBlocks(container, "aws_function", function(bag)
                local other = barbe.asVal(bag.Value);
                if std.objectHas(other, "event_s3") then
                    [
                        if std.objectHas(event, "bucket") && event.bucket.Traversal[1].Name == labels[0] then
                            {event: event, block: other}
                        else
                            []
                        for event in barbe.asValArrayConst(other.event_s3)
                    ]
                else
                    []
            )
        ]);

        applyRegionProvider(fullBlock, barbe.flatten([
            {
                Name: labels[0] + "_aws_s3_traversal_transform",
                Type: "traversal_transform",
                Value: {
                    ["aws_s3." + labels[0]]: "aws_s3_bucket." + labels[0] + "_s3"
                }
            },
            {
                Name: labels[0] + "_s3",
                Type: "cr_aws_s3_bucket",
                Value: {
                    bucket: barbe.appendToTemplate(namePrefix, [barbe.asSyntax(labels[0])]),
                    force_destroy: std.get(fullBlock, "force_destroy", null),
                }
            },
            if std.objectHas(fullBlock, "object_lock_enabled") then
                [
                    {
                        Name: labels[0] + "_aws_s3_object_lock_traversal_transform",
                        Type: "traversal_transform",
                        Value: {
                            ["aws_s3." + labels[0] + ".object_lock"]: "aws_s3_bucket_object_lock_configuration." + labels[0] + "_s3_object_lock"
                        }
                    },
                    {
                        Name: labels[0] + "_s3_object_lock",
                        Type: "cr_aws_s3_bucket_object_lock_configuration",
                        Value: {
                            bucket: barbe.asTraversal("aws_s3_bucket." + labels[0] + "_s3.bucket"),
                            object_lock_enabled: fullBlock.object_lock_enabled
                        }
                    }
                ]
            ,
            if std.objectHas(fullBlock, "versioning_enabled") && barbe.asVal(fullBlock.versioning_enabled) == true then
                [
                    {
                        Name: labels[0] + "_aws_s3_versioning_traversal_transform",
                        Type: "traversal_transform",
                        Value: {
                            ["aws_s3." + labels[0] + ".versioning"]: "aws_s3_bucket_versioning." + labels[0] + "_s3_versioning"
                        }
                    },
                    {
                        Name: labels[0] + "_s3_versioning",
                        Type: "cr_aws_s3_bucket_versioning",
                        Value: {
                            bucket: barbe.asTraversal("aws_s3_bucket." + labels[0] + "_s3.bucket"),
                            versioning_configuration: barbe.asBlock([{
                                status: "Enabled"
                            }])
                        }
                    }
                ]
            ,
            if std.objectHas(fullBlock, "cors_rule") then
                [
                    {
                        Name: labels[0] + "_aws_s3_cors_traversal_transform",
                        Type: "traversal_transform",
                        Value: {
                            ["aws_s3." + labels[0] + ".cors"]: "aws_s3_bucket_cors_configuration." + labels[0] + "_s3_cors"
                        }
                    },
                    {
                        Name: labels[0] + "_s3_cors",
                        Type: "cr_aws_s3_bucket_cors_configuration",
                        Value: {
                            bucket: barbe.asTraversal("aws_s3_bucket." + labels[0] + "_s3.bucket"),
                            cors_rule: barbe.asBlock([
                                {
                                    id: std.get(item, "id", null),
                                    allowed_methods: item.allowed_methods,
                                    allowed_origins: item.allowed_origins,
                                    allowed_headers: std.get(item, "allowed_headers", null),
                                    expose_headers: std.get(item, "expose_headers", null),
                                    max_age_seconds: std.get(item, "max_age_seconds", null)
                                }
                                for item in barbe.asValArrayConst(fullBlock.cors_rule)
                            ])
                        }
                    }
                ]
            ,
            if std.length(allEventS3) != 0 then
                {
                    Name: labels[0] + "_s3_notification",
                    Type: "cr_aws_s3_bucket_notification",
                    Value: {
                        //TODO this is needed to avoid having to deploy twice the first time the template gets deployed
                        // comment above: unsure if that's still true
                        //depends_on: [
                        //	for tuple in allEventS3 {
                        //		let functionLabel = (barbe.#AsValArrayConst & {#In: tuple[1].labels}).out[0]
                        //		barbe.#AsTraversal & {#In: "aws_lambda_permission.\(functionLabel)_\(labels[0])_s3_permission"}
                        //	}
                        //]
                        bucket: barbe.asTraversal("aws_s3_bucket." + labels[0] + "_s3.bucket"),
                        lambda_function: barbe.asBlock([
                            {
                                lambda_function_arn: barbe.asTraversal("aws_lambda_function." + barbe.asValArrayConst(tuple.block.labels)[0] + "_lambda.arn"),
                                events: std.get(tuple.event, "events", ["s3:*"]),
                                filter_prefix: std.get(tuple.event, "prefix", null),
                                filter_suffix: std.get(tuple.event, "suffix", null)
                            }
                            for tuple in allEventS3
                        ])
                    }
                }
            ,

        ]))
    )
])