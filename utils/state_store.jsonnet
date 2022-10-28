local barbe = std.extVar("barbe");
local env = std.extVar("env");
local container = std.extVar("container");
local globalDefaults = barbe.compileDefaults(container, "");

assert std.objectHas(container, "aws_credentials") : "No AWS credentials found";
assert std.objectHas(container.aws_credentials, "terraform_credentials") : "No AWS credentials found with name 'terraform_credentials', most likely the manifest has been tampered with";
local awsCredentials = barbe.asVal(container.aws_credentials.terraform_credentials[0].Value);


barbe.databags([
    barbe.iterateBlocks(container, "state_store", function(bag)
        local block = barbe.asVal(bag.Value);
        local labels = barbe.flatten([bag.Name, bag.Labels]);
        local blockDefaults = barbe.makeBlockDefault(container, globalDefaults, block);
        local fullBlock = barbe.asVal(barbe.mergeTokens([barbe.asSyntax(blockDefaults), bag.Value]));
        local namePrefix = barbe.concatStrArr(std.get(fullBlock, "name_prefix", barbe.asSyntax([""])));
        local dotS3 = barbe.asVal(barbe.mergeTokens(std.get(fullBlock, "s3", barbe.asSyntax([])).ArrayConst));

        if std.objectHas(fullBlock, "s3") then
            local madeBucketName = barbe.asStr(barbe.appendToTemplate(namePrefix, [barbe.asSyntax("state-store")]));
            {
                Name: "",
                Type: "cr_[terraform]",
                Value: {
                    backend: barbe.asBlock([{
                        labels: ["s3"],
                        bucket: std.get(dotS3, "existing_bucket", madeBucketName),
                        key: barbe.appendToTemplate(
                            std.get(dotS3, "prefix", barbe.asSyntax("")),
                            [std.get(dotS3, "key", barbe.appendToTemplate(namePrefix, [barbe.asSyntax("state.tfstate")]))]
                        ),
                        region: std.get(dotS3, "region", "us-east-1")
                    }])
                }
            }
        else
            []
        ,
    ),
])