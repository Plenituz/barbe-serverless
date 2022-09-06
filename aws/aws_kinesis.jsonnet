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
    barbe.iterateBlocks(container, "aws_kinesis_stream", function(bag)
        local block = barbe.asVal(bag.Value);
        local labels = barbe.flatten([bag.Name, bag.Labels]);
        local blockDefaults = barbe.makeBlockDefault(container, globalDefaults, block);
        local fullBlock = barbe.asVal(barbe.mergeTokens([barbe.asSyntax(blockDefaults), bag.Value]));
        local namePrefix = barbe.concatStrArr(std.get(fullBlock, "name_prefix", barbe.asSyntax([""])));

        applyRegionProvider(fullBlock, barbe.flatten([
            {
                Name: labels[0],
                Type: "traversal_transform",
                Value: {
                    ["aws_kinesis_stream." + labels[0]]: "aws_kinesis_stream." + labels[0] + "_aws_kinesis_stream",
                }
            },
            {
                Name: labels[0] + "_aws_kinesis_stream",
                Type: "cr_aws_kinesis_stream",
                Value: {
                    name: barbe.appendToTemplate(namePrefix, [barbe.asSyntax(labels[0])]),
                    shard_count: std.get(fullBlock, "shard_count", 1),
                    retention_period: std.get(fullBlock, "retention_period", null),
                    shard_level_metrics: std.get(fullBlock, "shard_level_metrics", null),
                    enforce_consumer_deletion: std.get(fullBlock, "enforce_consumer_deletion", null),
                    encryption_type: std.get(fullBlock, "encryption_type", null),
                    kms_key_id: std.get(fullBlock, "kms_key_id", null),
                    stream_mode_details:
                        if std.objectHas(fullBlock, "stream_mode") then
                            barbe.asBlock([{
                                stream_mode: fullBlock.stream_mode,
                            }])
                        else
                            null,
                }
            }
        ]))
    )
])