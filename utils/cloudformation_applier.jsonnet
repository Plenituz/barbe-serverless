local barbe = std.extVar("barbe");
local container = std.extVar("container");

local isCfOutput(token) =
    token.Type == "relative_traversal" &&
    std.length(token.Traversal) > 0 &&
    std.get(token.Traversal[0], "Name", "") == "output" &&
    token.Source.Type == "function_call"
;

local isCfTemplate(token) =
    token.Type == "relative_traversal" &&
    std.length(token.Traversal) > 0 &&
    std.get(token.Traversal[0], "Name", "") == "resources" &&
    token.Source.Type == "function_call"
;


local allCfOutputs = barbe.flatten(barbe.iterateAllBlocks(container, function(bag)
    barbe.accumulateTokens(bag.Value, isCfOutput)
));

local allCfTemplates = barbe.flatten(barbe.iterateAllBlocks(container, function(bag)
    barbe.accumulateTokens(bag.Value, isCfTemplate)
));

barbe.databags([
    if std.objectHas(container, "cloudformation_resources_getter_result") then
        [
            local stackName = barbe.asStr(parent.Source.FunctionArgs[0]);
            assert std.objectHas(container.cloudformation_resources_getter_result, stackName) : "<showuser>couldnt find result of cloudformation resources extraction for stack '" + stackName + "'</showuser>";
            local baseObj = container.cloudformation_resources_getter_result[stackName][0].Value;
            {
                Type: "token_map",
                Name: "cloudformation_resources_" + stackName + "_token_map",
                Value: [
                    {
                        match: parent,
                        replace_by: barbe.lookupTraversal(baseObj, parent.Traversal[1:], "cloudformation(\"" + stackName + "\").resources")
                    }
                ]
            }
            for parent in allCfTemplates
        ],

    if std.objectHas(container, "cloudformation_output_getter_result") then
        [
            local stackName = barbe.asStr(parent.Source.FunctionArgs[0]);
            assert std.objectHas(container.cloudformation_output_getter_result, stackName) : "<showuser>couldnt find result of cloudformation output extraction for stack '" + stackName + "'</showuser>";
            local baseObj = container.cloudformation_output_getter_result[stackName][0].Value;
            {
                Type: "token_map",
                Name: "cloudformation_output_" + stackName + "_token_map",
                Value: [
                    {
                        match: parent,
                        replace_by: barbe.lookupTraversal(baseObj, parent.Traversal[1:], "cloudformation(\"" + stackName + "\").output")
                    }
                ]
            }
            for parent in allCfOutputs
        ],
])