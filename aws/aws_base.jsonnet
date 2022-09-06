local barbe = std.extVar("barbe");
local container = std.extVar("container");

local allRegions = barbe.flatten(std.set(barbe.iterateAllBlocks(container, function(bag)
    local keepTokens(token) =
        token.Type == "scope_traversal" &&
        std.length(token.Traversal) == 2 &&
        std.get(token.Traversal[0], "Name", "") == "aws"
    ;
    local allTraversals = barbe.accumulateTokens(bag.Value, keepTokens);
    local regionNames = std.set([
        std.get(token.Traversal[1], "Name", error "<showuser>malformatted region traversal: '" + token + "'</showuser>")
        for token in allTraversals
    ]);
    regionNames
)));

barbe.databags([
   [
        {
            Name: "current",
            Type: "cr_[data]_aws_partition",
            Value: {}
        },
        {
            Name: "current",
            Type: "cr_[data]_aws_region",
            Value: {}
        },
        [
            {
                Name: region,
                Type: "cr_[data]_aws_region",
                Value: {
                    provider: barbe.asTraversal("aws." + region)
                }
            }
            for region in allRegions
        ],
        {
            Name: "current",
            Type: "cr_[data]_aws_caller_identity",
            Value: {}
        },
        {
            Name: "available",
            Type: "cr_[data]_aws_availability_zones",
            Value: {}
        },
        [
            {
                Name: region,
                Type: "cr_[data]_aws_availability_zones",
                Value: {
                    provider: barbe.asTraversal("aws." + region)
                }
            }
            for region in allRegions
        ],
    ],
])