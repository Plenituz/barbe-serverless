local barbe = std.extVar("barbe");
local container = std.extVar("container");

local isSlsTraversal(token) =
    token.Type == "scope_traversal" &&
    std.length(token.Traversal) > 0 &&
    std.get(token.Traversal[0], "Name", "") == "serverless_framework"
;

local isSlsFunc(token) =
    token.Type == "function_call" &&
    std.get(token, "FunctionName", "") == "serverless_framework"
;

local isSlsFuncParent(token) =
    token.Type == "relative_traversal" &&
    isSlsFunc(token.Source)
;


local allSlsTraversals = std.set(barbe.flatten(barbe.iterateAllBlocks(container, function(bag)
    barbe.accumulateTokens(bag.Value, isSlsTraversal)
)), barbe.asStr);

//TODO this will cause duplicates but it's ok for now, it's a performance thing, shouldnt impact behaviour
local allSlsFuncParents = barbe.flatten(barbe.iterateAllBlocks(container, function(bag)
  barbe.accumulateTokens(bag.Value, isSlsFuncParent)
));

barbe.databags([
    if std.objectHas(container, "sls_framework_getter_result") then
        local rootMd5 = std.md5(".");
        [
            if std.objectHas(container.sls_framework_getter_result, rootMd5) then
                local baseObj = container.sls_framework_getter_result[rootMd5][0].Value;
                {
                    Type: "traversal_map",
                    Name: "sls_framework_root_traversal_map",
                    Value: {
                        [barbe.asStr(traversal)]: barbe.lookupTraversal(baseObj, traversal.Traversal[1:], "serverless_framework")
                        for traversal in allSlsTraversals
                    },
                },

            [
                local dir = barbe.asStr(parent.Source.FunctionArgs[0]);
                local dirHash = std.md5(dir);
                assert std.objectHas(container.sls_framework_getter_result, dirHash) : "<showuser>couldnt find result of serverless framework extraction for directory '" + dir + "'</showuser>";
                local baseObj = container.sls_framework_getter_result[dirHash][0].Value;
                {
                    Type: "token_map",
                    Name: "sls_framework_" + dirHash + "_token_map",
                    Value: [
                        {
                            match: parent,
                            replace_by: barbe.lookupTraversal(baseObj, parent.Traversal, "serverless_framework(\"" + dir + "\")")
                        }
                    ]
                }
                for parent in allSlsFuncParents
            ]
        ],
])