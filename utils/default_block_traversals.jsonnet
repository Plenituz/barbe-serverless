/*
    this component turns all traversals that start with `default` into the values that are present in the `default` blocks

    Example:
    default {
        hello = "world"
    }

    v = default.hello
    // v is now "world"
*/

local barbe = std.extVar("barbe");
local container = std.extVar("container");


local allDefaultTraversals = std.set(barbe.flatten(barbe.iterateAllBlocks(container, function(bag)
    local keepTokens(token) =
        token.Type == "scope_traversal" &&
        std.length(token.Traversal) > 0 &&
        std.get(token.Traversal[0], "Name", "") == "default"
    ;
    barbe.accumulateTokens(bag.Value, keepTokens)
)), function(t) barbe.asStr(t));

barbe.databags([
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
])