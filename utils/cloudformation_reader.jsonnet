local barbe = std.extVar("barbe");
local env = std.extVar("env");
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

local extractStackName(token) =
    local argsLen = std.length(std.get(token.Source, "FunctionArgs", []));
    if argsLen == 0 then
        error "<showuser>cloudformation() requires 1 argument: the name of the cloudformation stack</showuser>"
    else if argsLen > 1 then
        error "<showuser>cloudformation() used with more than 1 argument</showuser>"
    else
        barbe.asStr(token.Source.FunctionArgs[0])
;

local allCfOutputStackNames = std.set([
    extractStackName(token)
    for token in allCfOutputs
]);
local allCfTemplateStackNames = std.set([
    extractStackName(token)
    for token in allCfTemplates
]);

barbe.pipelines([{
    generate: [
        function(container) barbe.databags([
            {
                Name: "cloudformation_reader_credentials",
                Type: "aws_credentials_request",
                Value: {}
            },
        ]),
        function(container) barbe.databags([
            [
                {
                    Type: "buildkit_run_in_container",
                    Name: "cloudformation_output_getter_" + stackName,
                    Value: {
                        local formatterScriptPy = |||
                            import json

                            with open('cloudformation_output.json', 'r') as f:
                                data = json.load(f)

                            formattedObj = {}
                            for i in data['Stacks'][0]['Outputs']:
                                formattedObj[i['OutputKey']] = i['OutputValue']

                            formattedObj = {
                                'cloudformation_output_getter_result': {
                                    '%(stackName)s': formattedObj
                                }
                            }
                            with open('cloudformation_output.json', 'w') as f:
                                json.dump(formattedObj, f)
                        ||| % {stackName: stackName},
                        dockerfile: |||
                            FROM amazon/aws-cli:%(aws_cli_version)s

                            ENV AWS_ACCESS_KEY_ID="%(access_key_id)s"
                            ENV AWS_SECRET_ACCESS_KEY="%(secret_access_key)s"
                            ENV AWS_SESSION_TOKEN="%(session_token)s"
                            ENV AWS_REGION="%(aws_region)s"
                            ENV AWS_PAGER=""

                            RUN aws cloudformation describe-stacks --stack-name %(stack_name)s --output json > cloudformation_output.json
                            RUN printf %(formatter_script_py)s > formatter.py
                            RUN python formatter.py
                        ||| % {
                            local awsCredentials = barbe.asVal(container.aws_credentials.cloudformation_reader_credentials[0].Value),
                            //TODO version selection
                            aws_cli_version: "latest",
                            access_key_id: barbe.asStr(awsCredentials.access_key_id),
                            secret_access_key: barbe.asStr(awsCredentials.secret_access_key),
                            session_token: barbe.asStr(awsCredentials.session_token),
                            aws_region: std.get(env, "AWS_REGION", "us-east-1"),
                            formatter_script_py: std.escapeStringJson(formatterScriptPy),
                            stack_name: stackName,
                        },
                        display_name: "Reading Cloudformation output - " + stackName,
                        no_cache: true,
                        exported_files: {
                            "cloudformation_output.json": "cloudformation_output_" + stackName + ".json"
                        },
                        read_back: [
                            "cloudformation_output_" + stackName + ".json"
                        ]
                    }
                }
                for stackName in allCfOutputStackNames
            ],
            [
                {
                    Type: "buildkit_run_in_container",
                    Name: "cloudformation_template_getter_" + stackName,
                    Value: {
                        local formatterScriptPy = |||
                            import json

                            with open('cloudformation_resources.json', 'r') as f:
                                data = json.load(f)

                            formattedObj = {
                                'cloudformation_resources_getter_result': {
                                    '%(stackName)s': data['TemplateBody']['Resources']
                                }
                            }
                            with open('cloudformation_resources.json', 'w') as f:
                                json.dump(formattedObj, f)
                        ||| % {stackName: stackName},
                        dockerfile: |||
                            FROM amazon/aws-cli:%(aws_cli_version)s

                            ENV AWS_ACCESS_KEY_ID="%(access_key_id)s"
                            ENV AWS_SECRET_ACCESS_KEY="%(secret_access_key)s"
                            ENV AWS_SESSION_TOKEN="%(session_token)s"
                            ENV AWS_REGION="%(aws_region)s"
                            ENV AWS_PAGER=""

                            RUN aws cloudformation get-template --stack-name %(stack_name)s --output json > cloudformation_resources.json
                            RUN printf %(formatter_script_py)s > formatter.py
                            RUN python formatter.py
                        ||| % {
                            local awsCredentials = barbe.asVal(container.aws_credentials.cloudformation_reader_credentials[0].Value),
                            //TODO version selection
                            aws_cli_version: "latest",
                            access_key_id: barbe.asStr(awsCredentials.access_key_id),
                            secret_access_key: barbe.asStr(awsCredentials.secret_access_key),
                            session_token: barbe.asStr(awsCredentials.session_token),
                            aws_region: std.get(env, "AWS_REGION", "us-east-1"),
                            formatter_script_py: std.escapeStringJson(formatterScriptPy),
                            stack_name: stackName,
                        },
                        display_name: "Reading Cloudformation template - " + stackName,
                        no_cache: true,
                        exported_files: {
                            "cloudformation_resources.json": "cloudformation_resources_" + stackName + ".json"
                        },
                        read_back: [
                            "cloudformation_resources_" + stackName + ".json"
                        ]
                    }
                }
                for stackName in allCfTemplateStackNames
            ]
        ]),
        function(container) barbe.databags([
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
    ]
}])