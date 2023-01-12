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
local alreadyDeclaredProviders = std.set(barbe.flatten(barbe.iterateAllBlocks(container, function(bag)
    if std.length(std.findSubstr("provider", bag.Type)) > 0 then
        local block = barbe.asVal(bag.Value);
        barbe.asStr(std.get(block, "alias", []))
    else
        []
)));
local newProviders = [
    //filter out regions that already have a provider in the databags, in case the user already defined a provider
    item for item in allRegions if std.length(std.find(item, alreadyDeclaredProviders)) == 0
];

barbe.databags([
    [
        {
            Name: "aws",
            Type: "cr_[provider(" + region + ")]",
            Value: { 
                alias: region,
                region: region,
            }
        }
        for region in newProviders
    ],
    {
        Name: "aws",
        Type: "cr_[provider(default)]",
        Value: {}
    }
])

