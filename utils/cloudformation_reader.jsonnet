local barbe = std.extVar("barbe");
local env = std.extVar("env");
local container = std.extVar("container");


assert std.objectHas(container, "aws_credentials") : "No AWS credentials found";
assert std.objectHas(container.aws_credentials, "terraform_credentials") : "No AWS credentials found with name 'terraform_credentials', most likely the manifest has been tampered with";
local awsCredentials = barbe.asVal(container.aws_credentials.terraform_credentials[0].Value);


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

barbe.databags([
    [
        {
            Type: "buildkit_run_in_container_transform",
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
                    //TODO version selection
                    aws_cli_version: "latest",
                    access_key_id: barbe.asStr(awsCredentials.access_key_id),
                    secret_access_key: barbe.asStr(awsCredentials.secret_access_key),
                    session_token: barbe.asStr(awsCredentials.session_token),
                    aws_region: std.get(env, "AWS_REGION", "us-east-1"),
                    formatter_script_py: std.escapeStringJson(formatterScriptPy),
                    stack_name: stackName,
                },
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
                Type: "buildkit_run_in_container_transform",
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
                        //TODO version selection
                        aws_cli_version: "latest",
                        access_key_id: barbe.asStr(awsCredentials.access_key_id),
                        secret_access_key: barbe.asStr(awsCredentials.secret_access_key),
                        session_token: barbe.asStr(awsCredentials.session_token),
                        aws_region: std.get(env, "AWS_REGION", "us-east-1"),
                        formatter_script_py: std.escapeStringJson(formatterScriptPy),
                        stack_name: stackName,
                    },
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
])