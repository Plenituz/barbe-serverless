local barbe = std.extVar("barbe");
local container = std.extVar("container");
local globalDefaults = barbe.compileDefaults(container, "");
local globalNamePrefix = barbe.concatStrArr(std.get(globalDefaults, "name_prefix", barbe.asSyntax([""])));

local cloudResourceAbstractFactory(dir, id) =
    function(kind)
    function(type, name, value)
        barbe.cloudResourceRaw(dir, id, kind, type, name, value);


// namePrefix should be a template
local lambdaRoleStatement(namePrefix, roleName) =
    barbe.flatten([
        {
            Action: [
                "logs:CreateLogStream",
                "logs:CreateLogGroup"
            ],
            Effect: "Allow",
            Resource: barbe.asTemplate(barbe.flatten([
                "arn:",
                barbe.asTraversal("data.aws_partition.current.partition"),
                ":logs:*:",
                barbe.asTraversal("data.aws_caller_identity.current.account_id"),
                ":log-group:/aws/lambda/",
                if std.length(namePrefix.Parts) == 0  then
                    "*:*"
                else
                    [
                        [part for part in namePrefix.Parts],
                        "*:*"
                    ]
            ]))
        },
        {
            Action: "logs:PutLogEvents",
            Effect: "Allow",
            Resource: barbe.asTemplate(barbe.flatten([
                "arn:",
                barbe.asTraversal("data.aws_partition.current.partition"),
                ":logs:*:",
                barbe.asTraversal("data.aws_caller_identity.current.account_id"),
                ":log-group:/aws/lambda/",
                if std.length(namePrefix.Parts) == 0  then
                    "*:*:*"
                else
                    [
                        [part for part in namePrefix.Parts],
                        "*:*:*"
                    ]
            ]))
        },
        if std.objectHas(container, "aws_dynamodb") then
            {
                Action: "dynamodb:*",
                Effect: "Allow",
                Resource: [
                    barbe.asTemplate([
                        "arn:",
                        barbe.asTraversal("data.aws_partition.current.partition"),
                        ":dynamodb:*:",
                        barbe.asTraversal("data.aws_caller_identity.current.account_id"),
                        ":table/",
                        barbe.asTraversal("aws_dynamodb_table." + name + "_aws_dynamodb.name"),
                        "*",
                    ])
                    for name in std.objectFields(container.aws_dynamodb)
                ]
            }
        else
            []
        ,
        if std.objectHas(container, "aws_kinesis_stream") then
            {
                Action: "kinesis:*",
                Effect: "Allow",
                Resource: [
                    barbe.asTraversal("aws_kinesis_stream." + name + "_aws_kinesis_stream.arn"),
                    for name in std.objectFields(container.aws_kinesis_stream)
                ]
            }
        else
            []
        ,
        if std.objectHas(container, "aws_s3") then
            {
                Action: "s3:*",
                Effect: "Allow",
                Resource: barbe.flatten([
                    [
                        barbe.asTraversal("aws_s3_bucket." + name + "_s3.arn"),
                        barbe.asTemplate([
                            barbe.asTraversal("aws_s3_bucket." + name + "_s3.arn"),
                            "*"
                        ])
                    ]
                    for name in std.objectFields(container.aws_s3)
                ])
            }
        else
            []
        ,
        if std.objectHas(container, "aws_fargate_task") then
            [
                {
                    Action: "ecs:RunTask",
                    Effect: "Allow",
                    Resource: barbe.flatten([
                        [
                            barbe.asTemplate([
                                "arn:",
                                barbe.asTraversal("data.aws_partition.current.partition"),
                                ":ecs:*:",
                                barbe.asTraversal("data.aws_caller_identity.current.account_id"),
                                ":task-definition/",
                                barbe.appendToTemplate(namePrefix, [barbe.asSyntax(name)]),
                                "*"
                            ])
                        ]
                        for name in std.objectFields(container.aws_fargate_task)
                    ])
                },
                {
                    Action: "iam:PassRole",
                    Effect: "Allow",
                    //TODO this will cause duplicate entries if 2 tasks are defined and they both have the same
                    //execution role (which is the case most of the time since we use the account's default by default)
                    //this doesnt prevent the template from working but it will cause duplicate entries in the policy
                    Resource: barbe.flatten([
                        [
                            barbe.asTraversal("local.__aws_fargate_task_" + name + "_task_execution_role_arn"),
                            for name in std.objectFields(container.aws_fargate_task)
                        ],
                        barbe.asTemplate([
                            "arn:",
                            barbe.asTraversal("data.aws_partition.current.partition"),
                            ":iam::",
                            barbe.asTraversal("data.aws_caller_identity.current.account_id"),
                            ":role/",
                            namePrefix,
                            "*"
                        ])
                    ])
                },
            ]
        else
            []
        ,
        if std.objectHas(container, "aws_iam_lambda_role") && std.objectHas(container.aws_iam_lambda_role, roleName) then
            local val = barbe.asVal(container.aws_iam_lambda_role[roleName][0].Value);
            if std.objectHas(val, "statements") then
                barbe.asVal(val.statements)
            else
                []
        else
            []
    ]);

local defineRole(cloudResourceKindFactory, label, namePrefix, assumableBy) =
    local cloudResource = cloudResourceKindFactory("resource");
    local cloudData = cloudResourceKindFactory("data");
    [
        {
            Name: label + "_iam_traversal_transform",
            Type: "traversal_transform",
            Value: {
                ["aws_iam_lambda_role." + label]: "aws_iam_role." + label + "_lambda_role"
            }
        },
        cloudData("aws_caller_identity", "current", {}),
        cloudData("aws_partition", "current", {}),
        cloudResource("aws_iam_role", label + "_lambda_role", {
            name: barbe.appendToTemplate(namePrefix, [barbe.asSyntax(label + "-role")]),
            assume_role_policy: std.manifestJsonMinified({
                Version: "2012-10-17",
                Statement: [
                    {
                        Action: "sts:AssumeRole",
                        Effect: "Allow",
                        Sid: "",
                        Principal: {
                            local service = barbe.flatten([
                                if assumableBy != null then
                                    barbe.asValArrayConst(assumableBy)
                                else
                                    []
                                ,
                                if std.objectHas(container, "aws_function") then
                                    "lambda.amazonaws.com"
                                else
                                    []
                                ,
                                if std.objectHas(container, "aws_fargate_task") then
                                    "ecs-tasks.amazonaws.com"
                                else
                                    []
                            ]),
                            Service:
                                if std.length(service) == 0 then
                                    "lambda.amazonaws.com"
                                else
                                    service
                        }
                    }
                ]
            })
        }),
        cloudResource("aws_iam_policy", label + "_lambda_role_policy", {
            name: barbe.appendToTemplate(namePrefix, [barbe.asSyntax(label + "-role-policy")]),
            description: "",
            policy: barbe.asFuncCall("jsonencode", [{
                Version: "2012-10-17",
                Statement: lambdaRoleStatement(namePrefix, label)
            }])
        }),
        cloudResource("aws_iam_role_policy_attachment", label + "_lambda_role_policy_attachment", {
            role: barbe.asTraversal("aws_iam_role." + label + "_lambda_role.name"),
            policy_arn: barbe.asTraversal("aws_iam_policy." + label + "_lambda_role_policy.arn")
        })
    ];


barbe.databags([
    local allDirsTmp = barbe.iterateAllBlocks(container, function(bag)
        if (bag.Type == "aws_function" || bag.Type == "aws_fargate_task") then
            local block = barbe.asVal(bag.Value);
            local blockDefaults = barbe.makeBlockDefault(container, globalDefaults, block);
            local fullBlock = barbe.asVal(barbe.mergeTokens([barbe.asSyntax(blockDefaults), bag.Value]));
            std.get(fullBlock, "cloudresource_dir", barbe.asSyntax("default"))
        else
            null
    );
    local allDirs = std.uniq([barbe.asStr(i) for i in allDirsTmp if i != null]);
    [
        local dir = 
            if dirName == "default" then
                null
            else
                barbe.asStr(dirName);
        defineRole(
            cloudResourceAbstractFactory(dir, dir),
            "default",
            if dir == null then globalNamePrefix else barbe.appendToTemplate(globalNamePrefix, [dir, "-"]),
            null
        )
        for dirName in allDirs
    ],

    barbe.iterateAllBlocks(container, function(bag)
        if bag.Type != "aws_iam_lambda_role" || bag.Name == "" then
            null
        else
            local block = barbe.asVal(bag.Value);
            local blockDefaults = barbe.makeBlockDefault(container, globalDefaults, block);
            local fullBlock = barbe.asVal(barbe.mergeTokens([barbe.asSyntax(blockDefaults), bag.Value]));
            local namePrefix = barbe.concatStrArr(std.get(fullBlock, "name_prefix", barbe.asSyntax([""])));
            local dir = std.get(fullBlock, "cloudresource_dir", null);
            local cloudResourceFactory = 
                if dir == null then
                    cloudResourceAbstractFactory(dir, dir)
                else
                    local d = barbe.asStr(dir);
                    cloudResourceAbstractFactory(d, d)
                ;
            defineRole(cloudResourceFactory, bag.Name, namePrefix, std.get(fullBlock, "assumable_by", null))
    )
])