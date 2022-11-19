local barbe = std.extVar("barbe");
local container = std.extVar("container");
local env = std.extVar("env");

local allEnvVarNames = std.set(barbe.flatten(std.set(barbe.iterateAllBlocks(container, function(bag)
    local keepTokens(token) =
        token.Type == "scope_traversal" &&
        std.length(token.Traversal) == 2 &&
        std.get(token.Traversal[0], "Name", "") == "env"
    ;
    local allEnvTraversal = barbe.accumulateTokens(bag.Value, keepTokens);
    local varNames = std.set([
        std.get(token.Traversal[1], "Name", error "<showuser>malformatted env traversal: '" + token + "'</showuser>")
        for token in allEnvTraversal
    ]);
    varNames
))));

barbe.databags([
    {
        Name: "env_traversal_transform",
        Type: "traversal_map",
        Value: {
            ["env." + varName]: std.get(env, varName, error "<showuser>environment variable '" + varName + "' not found</showuser>"),
            for varName in allEnvVarNames
        }
    },
])