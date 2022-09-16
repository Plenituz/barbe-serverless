local barbe = std.extVar("barbe");
local container = std.extVar("container");
local env = std.extVar("env");
local globalDefaults = barbe.compileDefaults(container, "");
local namePrefix = barbe.concatStrArr(std.get(globalDefaults, "name_prefix", barbe.asSyntax([""])));

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

local allDefaultTraversals = std.set(barbe.flatten(barbe.iterateAllBlocks(container, function(bag)
    local keepTokens(token) =
        token.Type == "scope_traversal" &&
        std.length(token.Traversal) > 0 &&
        std.get(token.Traversal[0], "Name", "") == "default"
    ;
    barbe.accumulateTokens(bag.Value, keepTokens)
)), function(t) barbe.asStr(t));

barbe.databags([
    {
        Name: "terraform_credentials",
        Type: "aws_credentials_request",
        Value: {}
    },

    if std.objectHas(container, "default") then
        {
            Name: "defaults_traversal_map",
            Type: "traversal_map",
            Value: {
                local baseObj =
                    if (std.length(traversal.Traversal) == 1 || (std.length(traversal.Traversal) == 2 && traversal.Traversal[1].Type == "attr")) && std.objectHas(container.default, "") then
                        container.default[""][0].Value
                    else if traversal.Traversal[1].Type == "attr" && std.objectHas(container.default, traversal.Traversal[1].Name) && traversal.Traversal[1].Type == "attr" then
                        container.default[traversal.Traversal[1].Name][0].Value
                    else if std.objectHas(container.default, "") then
                        container.default[""][0].Value
                    else
                        error "reference to '" + barbe.asStr(traversal) + "' which doesn't exist"
                    ,
                local adjustedTraversal =
                    if std.length(traversal.Traversal) == 1 || (std.length(traversal.Traversal) == 2 && traversal.Traversal[1].Type == "attr") then
                        traversal.Traversal[1:]
                    else if traversal.Traversal[1].Type == "attr" && std.objectHas(container.default, traversal.Traversal[1].Name) && traversal.Traversal[1].Type == "attr" then
                        traversal.Traversal[2:]
                    else
                        traversal.Traversal[1:]
                    ,
                local debugStr =
                    if std.length(traversal.Traversal) == 1 || (std.length(traversal.Traversal) == 2 && traversal.Traversal[1].Type == "attr") then
                        "default"
                    else if traversal.Traversal[1].Type == "attr" && std.objectHas(container.default, traversal.Traversal[1].Name) && traversal.Traversal[1].Type == "attr" then
                        "default." + traversal.Traversal[1].Name
                    else
                        "default"
                    ,
                [barbe.asStr(traversal)]: barbe.lookupTraversal(baseObj, adjustedTraversal, debugStr)
                for traversal in allDefaultTraversals
            }
        },

    barbe.iterateBlocks(container, "resource", function(bag)
        local block = barbe.asVal(bag.Value);
        local labels = barbe.flatten([bag.Name, bag.Labels]);
        {
            Name: labels[1],
            Type: "cr_" + labels[0],
            Value: {
                [key]: block[key]
                for key in std.objectFields(block) if key != "labels"
            },
        }
    ),

    barbe.iterateBlocks(container, "data", function(bag)
        local block = barbe.asVal(bag.Value);
        local labels = barbe.flatten([bag.Name, bag.Labels]);
        {
            Name: labels[1],
            Type: "cr_[data]_" + labels[0],
            Value: {
                [key]: block[key]
                for key in std.objectFields(block) if key != "labels"
            },
        }
    ),

    barbe.iterateBlocks(container, "module", function(bag)
        local block = barbe.asVal(bag.Value);
        local labels = barbe.flatten([bag.Name, bag.Labels]);
        {
            Name: labels[0],
            Type: "cr_[module]",
            Value: {
                [key]: block[key]
                for key in std.objectFields(block) if key != "labels"
            },
        }
    ),

    barbe.iterateBlocks(container, "terraform", function(bag)
            local block = barbe.asVal(bag.Value);
            {
                Name: "",
                Type: "cr_[terraform]",
                Value: {
                    [key]: block[key]
                    for key in std.objectFields(block) if key != "labels"
                },
            }
        ),

    barbe.iterateAllBlocks(container, function(bag)
        local block = barbe.asVal(bag.Value);
        local labels = barbe.flatten([bag.Name, bag.Labels]);
        if std.length(std.findSubstr("provider", bag.Type)) > 0 then
            {
                Name: labels[0],
                Type: "cr_[" + bag.Type + "]",
                Value: {
                    [key]: block[key]
                    for key in std.objectFields(block) if key != "labels"
                },
            }
        else
            null
    ),

    barbe.iterateBlocks(container, "variable", function(bag)
        local block = barbe.asVal(bag.Value);
        local labels = barbe.flatten([bag.Name, bag.Labels]);
        {
            Name: labels[0],
            Type: "cr_[variable]",
            Value: {
                [key]: block[key]
                for key in std.objectFields(block) if key != "labels"
            },
        }
    ),

    barbe.iterateBlocks(container, "locals", function(bag)
        local block = barbe.asVal(bag.Value);
        local labels = barbe.flatten([bag.Name, bag.Labels]);
        {
            Name: labels[0],
            Type: "cr_[locals]",
            Value: {
                [key]: block[key]
                for key in std.objectFields(block) if key != "labels"
            },
        }
    ),

    {
        Name: "env_traversal_transform",
        Type: "traversal_map",
        Value: {
            ["env." + varName]: std.get(env, varName, error "<showuser>environment variable '" + varName + "' not found</showuser>"),
            for varName in allEnvVarNames
        }
    },

])