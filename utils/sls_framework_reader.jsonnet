local barbe = std.extVar("barbe");
local env = std.extVar("env");
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

local isSlsRef(token) = isSlsTraversal(token) || isSlsFunc(token);

barbe.pipelines([{
    generate: [
        function(container) barbe.databags([
            {
                Name: "sls_framework_reader_credentials",
                Type: "aws_credentials_request",
                Value: {}
            },
        ]),
        function(container) barbe.databags([
            local awsCredentials = barbe.asVal(container.aws_credentials.sls_framework_reader_credentials[0].Value);
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

            [
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
            ]
        ]),
        function(container) barbe.databags([
            if std.objectHas(container, "sls_framework_getter_result") then
                local allSlsTraversals = std.set(barbe.flatten(barbe.iterateAllBlocks(container, function(bag)
                    barbe.accumulateTokens(bag.Value, isSlsTraversal)
                )), barbe.asStr);
                //TODO this will cause duplicates but it's ok for now, it's a performance thing, shouldnt impact behaviour
                local allSlsFuncParents = barbe.flatten(barbe.iterateAllBlocks(container, function(bag)
                    barbe.accumulateTokens(bag.Value, isSlsFuncParent)
                ));
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
    ]
}])