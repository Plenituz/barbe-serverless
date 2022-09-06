local barbe = std.extVar("barbe");
local container = std.extVar("container");
local env = std.extVar("env");
local globalDefaults = barbe.compileDefaults(container, "");

barbe.databags([
    barbe.iterateBlocks(container, "for_each", function(bag)
        local block = barbe.asVal(bag.Value);
        local labels = barbe.flatten([bag.Name, bag.Labels]);
        local blockDefaults = barbe.makeBlockDefault(container, globalDefaults, block);
        local fullBlock = barbe.asVal(barbe.mergeTokens([barbe.asSyntax(blockDefaults), bag.Value]));
        assert std.objectHas(fullBlock, labels[0]) : "<showuser>for_each: cannot iterate over undefined property: '" + labels[0] + "'</showuser>";
        local arrToIterate = barbe.asVal(fullBlock[labels[0]]);

        local getLabels(token) =
            barbe.flatten([
                [barbe.asStr(label) for label in objConst.Value.ArrayConst]
                for objConst in std.get(token, "ObjectConst", [])
                if objConst.Key == "labels"
            ]);
        local formatAsDatabag(token, val, i) =
            [
                local labels = getLabels(item);
                {
                    Type: if objConst.Key != "provider" then objConst.Key else objConst.Key +"(" + val + "_" + i + ")",
                    Name: if std.length(labels) > 0 then labels[0] else "",
                    Labels: if std.length(labels) > 1 then labels[1:] else [],
                    Value: barbe.asVal(item),
                }
                for objConst in std.get(token, "ObjectConst", [])
                    if std.get(std.get(objConst.Value, "Meta", {}), "IsBlock", false)
                for item in std.get(objConst.Value, "ArrayConst", [])
            ];

        [
            local replaceIteratorWith = barbe.asStr(arrToIterate[i]);
            local visitFunc(token) =
                if token.Type == "literal_value" && std.isString(token.Value) && std.length(std.findSubstr("${each.key}", token.Value)) > 0 then
                    {
                        Type: "literal_value",
                        Meta: std.get(token, "Meta", null),
                        Value: std.strReplace(token.Value, "${each.key}", replaceIteratorWith),
                    }
                else if token.Type == "scope_traversal" &&
                    std.length(token.Traversal) == 2 &&
                    std.get(token.Traversal[0], "Name", "") == "each" &&
                    std.get(token.Traversal[1], "Name", "") == "key" then
                    {
                         Type: "literal_value",
                         Value: replaceIteratorWith,
                    }
                else
                    false
            ;
            local modifiedBlock = barbe.visitTokens(bag.Value, visitFunc);
            formatAsDatabag(modifiedBlock, replaceIteratorWith, i)
            for i in std.range(0, std.length(arrToIterate)-1)
        ]
    )
])