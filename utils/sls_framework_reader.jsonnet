local barbe = std.extVar("barbe");
local env = std.extVar("env");
local container = std.extVar("container");


assert std.objectHas(container, "aws_credentials") : "No AWS credentials found";
assert std.objectHas(container.aws_credentials, "terraform_credentials") : "No AWS credentials found with name 'terraform_credentials', most likely the manifest has been tampered with";
local awsCredentials = barbe.asVal(container.aws_credentials.terraform_credentials[0].Value);


local isSlsTraversal(token) =
    token.Type == "scope_traversal" &&
    std.length(token.Traversal) > 0 &&
    std.get(token.Traversal[0], "Name", "") == "serverless_framework"
;

local isSlsFunc(token) =
    token.Type == "function_call" &&
    std.get(token, "FunctionName", "") == "serverless_framework"
;

local isSlsRef(token) = isSlsTraversal(token) || isSlsFunc(token);

local allSlsRefs = barbe.flatten(barbe.iterateAllBlocks(container, function(bag)
    barbe.accumulateTokens(bag.Value, isSlsRef)
));

local allSlsDirectories = std.set([
    if token.Type == "scope_traversal" then
        "."
    else
        local argsLen = std.length(std.get(token, "FunctionArgs", []));
        if argsLen == 0 then
            error "<showuser>serverless_framework() requires 1 argument: the directory where the serverless framework project is located. If you want to use the root directory, you can use 'serverless_framework.something' directly</showuser>"
        else if argsLen > 1 then
            error "<showuser>serverless_framework() used with more than 1 argument</showuser>"
        else
            barbe.asStr(token.FunctionArgs[0])
    for token in allSlsRefs
]);

barbe.databags([
    local slsDirHash = std.md5(dir);
    local formatterScriptJs = |||
        const fs = require('fs');
        let slsOutput = fs.readFileSync('sls_framework.json').toString()
        let formattedOutput = {
            "sls_framework_getter_result": {
                "%(slsDirHash)s": JSON.parse(slsOutput)
            }
        }
        fs.writeFileSync('sls_framework.json', JSON.stringify(formattedOutput))
    ||| % {slsDirHash: slsDirHash};
    {
        Type: "buildkit_run_in_container",
        Name: "sls_framework_getter_" + slsDirHash,
        Value: {
            //TODO make a dockerfile on the hub for this
            //TODO add a "printer" databag formatter that prints messages to the user
            message: std.join("\n", barbe.flatten([
                if !std.objectHas(env, "AWS_REGION") then
                    "no AWS_REGION environment variable, defaulting to us-east-1"
                else
                    []
                ,
                "Extracting serverless framework output from '" + dir + "'"
            ])),
            dockerfile: |||
                FROM node:%(node_version)s-alpine

                RUN npm install -g serverless@%(sls_version)s

                COPY --from=src ./%(dir)s /src
                WORKDIR /src
                RUN rm -rf node_modules

                ENV AWS_ACCESS_KEY_ID="%(access_key_id)s"
                ENV AWS_SECRET_ACCESS_KEY="%(secret_access_key)s"
                ENV AWS_SESSION_TOKEN="%(session_token)s"
                ENV AWS_REGION="%(aws_region)s"
                ENV SLS_WARNING_DISABLE="*"

                RUN serverless print --format json > sls_framework.json
                RUN printf %(formatter_script_js)s > formatter.js
                RUN node formatter.js
            ||| % {
                dir: dir,
                formatter_script_js: std.escapeStringJson(formatterScriptJs),
                node_version: "16",
                sls_version: "latest",
                output_dir: std.extVar("barbe_output_dir"),
                access_key_id: barbe.asStr(awsCredentials.access_key_id),
                secret_access_key: barbe.asStr(awsCredentials.secret_access_key),
                session_token: barbe.asStr(awsCredentials.session_token),
                aws_region: std.get(env, "AWS_REGION", "us-east-1"),
            },
            exported_files: {
                "sls_framework.json": "sls_framework_" + slsDirHash + ".json"
            },
            read_back: [
                "sls_framework_" + slsDirHash + ".json"
            ]
        }
    }
    for dir in allSlsDirectories
])