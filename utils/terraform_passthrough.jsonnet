local barbe = std.extVar("barbe");
local container = std.extVar("container");

barbe.databags([
    barbe.iterateBlocks(container, "resource", function(bag)
        local block = barbe.asVal(bag.Value);
        local labels = barbe.flatten([bag.Name, bag.Labels]);
        {
            Name: labels[1],
            Type: "cr_" + labels[0],
            Value: block,
        }
    ),

    barbe.iterateBlocks(container, "data", function(bag)
        local block = barbe.asVal(bag.Value);
        local labels = barbe.flatten([bag.Name, bag.Labels]);
        {
            Name: labels[1],
            Type: "cr_[data]_" + labels[0],
            Value: block,
        }
    ),

    barbe.iterateBlocks(container, "module", function(bag)
        local block = barbe.asVal(bag.Value);
        local labels = barbe.flatten([bag.Name, bag.Labels]);
        {
            Name: labels[0],
            Type: "cr_[module]",
            Value: block,
        }
    ),

    barbe.iterateBlocks(container, "terraform", function(bag)
            local block = barbe.asVal(bag.Value);
            {
                Name: "",
                Type: "cr_[terraform]",
                Value: block,
            }
        ),

    barbe.iterateAllBlocks(container, function(bag)
        local block = barbe.asVal(bag.Value);
        local labels = barbe.flatten([bag.Name, bag.Labels]);
        if std.length(std.findSubstr("provider", bag.Type)) > 0 && std.length(std.findSubstr("cr_[provider", bag.Type)) == 0 then
            {
                Name: labels[0],
                Type: "cr_[" + bag.Type + "]",
                Value: block,
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
            Value: block,
        }
    ),

    barbe.iterateBlocks(container, "locals", function(bag)
        local block = barbe.asVal(bag.Value);
        local labels = barbe.flatten([bag.Name, bag.Labels]);
        {
            Name: labels[0],
            Type: "cr_[locals]",
            Value: block
        }
    ),
])