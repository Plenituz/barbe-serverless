
local barbe = std.extVar("barbe");
local env = std.extVar("env");
local container = std.extVar("container");
local globalDefaults = barbe.compileDefaults(container, "");

assert std.objectHas(container, "aws_credentials") : "No AWS credentials found";
assert std.objectHas(container.aws_credentials, "terraform_credentials") : "No AWS credentials found with name 'terraform_credentials', most likely the manifest has been tampered with";
local awsCredentials = barbe.asVal(container.aws_credentials.terraform_credentials[0].Value);

local applyRegionProvider(fullBlock, bags) =
    if !std.objectHas(fullBlock, "region") then
        bags
    else
        [
            if std.length(std.findSubstr("cr_aws", bag.Type)) > 0 then
                {
                    Name: bag.Name,
                    Type: bag.Type,
                    Value: bag.Value + { provider: barbe.asTraversal("aws." + barbe.asStr(fullBlock.region))}
                }
            else 
                bag
            for bag in bags if bag != null
        ]
    ;

barbe.databags([
    barbe.iterateBlocks(container, "aws_fargate_task", function(bag)
        local block = barbe.asVal(bag.Value);
        local labels = barbe.flatten([bag.Name, bag.Labels]);
        local validator = {
            package: error "<showuser>'package' must be specified for aws_fargate_task</showuser>",
        };
        local blockDefaults = barbe.makeBlockDefault(container, globalDefaults, block);
        local fullBlock = validator + barbe.asVal(barbe.mergeTokens([barbe.asSyntax(blockDefaults), bag.Value]));
        local namePrefix = barbe.concatStrArr(std.get(fullBlock, "name_prefix", barbe.asSyntax([""])));
        local dotPackage = barbe.asVal(barbe.mergeTokens(std.get(fullBlock, "package", barbe.asSyntax([])).ArrayConst));
        local dotEnvironment = barbe.removeLabels(
            barbe.asVal(
                barbe.mergeTokens(
                    std.get(fullBlock, "environment", barbe.asSyntax([])).ArrayConst
                )));
        local cpu = std.get(fullBlock, "cpu", barbe.asSyntax(256));
        local memory = std.get(fullBlock, "memory", barbe.asSyntax(512));
        local entrypoint = std.get(fullBlock, "entrypoint", null);
        local dotDocker = barbe.asVal(barbe.mergeTokens(std.get(fullBlock, "docker", barbe.asSyntax([{entrypoint: entrypoint}])).ArrayConst));
        local regionDataName = barbe.asStr(std.get(fullBlock, "region", barbe.asSyntax("current")));
        local avZoneName = barbe.asStr(std.get(fullBlock, "region", barbe.asSyntax("available")));


        applyRegionProvider(fullBlock, barbe.flatten([
            {
                Name: labels[0] + "_fargate_task_package",
                Type: "zipper",
                Value: {
                    output_file: ".package/" + labels[0] + "_fargate_task_package.zip",
                    file_map: std.get(dotPackage, "file_map", {}),
                    include: std.get(dotPackage, "include", []),
                    exclude: std.get(dotPackage, "exclude", []),
                }
            },
            {
                Name: labels[0] + "_fargate_task_traversals",
                Type: "traversal_transform",
                Value: {
                    ["aws_fargate_task." + labels[0] + ".task_definition"]: "aws_ecs_task_definition." + labels[0] + "_fargate_task_def",
                    ["aws_fargate_task." + labels[0] + ".log_group"]: "aws_cloudwatch_log_group." + labels[0] + "_fargate_task_logs",
                    ["aws_fargate_task." + labels[0] + ".cluster"]: "aws_ecs_cluster." + labels[0] + "_fargate_cluster",
                    ["aws_fargate_task." + labels[0] + ".security_group_id"]: "local.__aws_fargate_task_" + labels[0] + "_security_group_id",
                    ["aws_fargate_task." + labels[0] + ".subnet_ids"]: "local.__aws_fargate_task_" + labels[0] + "_subnet_ids",
                    ["aws_fargate_task." + labels[0] + ".vpc"]: "local.__aws_fargate_task_" + labels[0] + "_vpc",
                    ["aws_fargate_task." + labels[0] + ".repository_url"]: "local.__aws_fargate_task_" + labels[0] + "_repo_url",
                    ["aws_fargate_task." + labels[0] + ".run_task_payload"]: "data.template_file." + labels[0] + "_fargate_run_task_payload.rendered",
                }
            },
            {
                Name: labels[0] + "_fargate_run_task_payload",
                Type: "cr_[data]_template_file",
                Value: {
                  template: '{
                        "taskDefinition": "${task_definition}",
                        "cluster": "${cluster}",
                        "launchType": "FARGATE",
                        "count": 1,
                        "networkConfiguration": {
                            "awsvpcConfiguration": {
                                "subnets": ${subnet_ids},
                                "securityGroups": ["${security_group_id}"],
                                "assignPublicIp": "ENABLED"
                            }
                        },
                        "overrides": {
                            "containerOverrides": [
                                {
                                    "name": "${container_name}"
                                }
                            ]
                        }
                    }',
                    vars: {
                        task_definition: barbe.asTraversal("aws_ecs_task_definition." + labels[0] + "_fargate_task_def.arn"),
                        cluster: barbe.asTraversal("aws_ecs_cluster." + labels[0] + "_fargate_cluster.name"),
                        subnet_ids: barbe.asFuncCall("jsonencode", [barbe.asTraversal("local.__aws_fargate_task_" + labels[0] + "_subnet_ids")]),
                        security_group_id: barbe.asTraversal("local.__aws_fargate_task_" + labels[0] + "_security_group_id"),
                        container_name: barbe.appendToTemplate(namePrefix, [barbe.asSyntax(labels[0])]),
                    }
                }
            },
            {
                Name: labels[0] + "_fargate_cluster",
                Type: "cr_aws_ecs_cluster",
                Value: {
                    name: barbe.appendToTemplate(namePrefix, [barbe.asSyntax(labels[0] + "-cluster")]),
                }
            },
            {
                Type: "buildkit_run_in_container",
                Name: labels[0] + "_fargate_docker_build",
                Value: {
                    no_cache: true,
                    dockerfile: |||
                        FROM hashicorp/terraform:%(tf_version)s
                        COPY --from=src ./ /src
                        WORKDIR /src/%(output_dir)s

                        RUN terraform output -json > terraform_output.json
                    ||| % {
                        tf_version: "latest",
                        output_dir: std.extVar("barbe_output_dir"),
                        access_key_id: barbe.asStr(awsCredentials.access_key_id),
                        secret_access_key: barbe.asStr(awsCredentials.secret_access_key),
                        session_token: barbe.asStr(awsCredentials.session_token),
                        aws_region: std.get(env, "AWS_REGION", "us-east-1"),
                    },
                    exported_file: "terraform_output.json"
                }
            },
            {
                Name: labels[0] + "_fargate_docker_build",
                Type: "cr_null_resource",
                Value: {
                    depends_on: if !std.objectHas(fullBlock, "repository_url") then [
                        barbe.asTraversal("aws_ecr_repository.aws_fargate_task_" + labels[0] + "_ecr_repository")
                    ],
                    triggers: {
                        always_run: barbe.asFuncCall("filebase64sha256", [".package/" + labels[0] + "_fargate_task_package.zip"])
                    },
                    provisioner: barbe.asBlock([{
                        labels: ["local-exec"],
                        command: barbe.asTraversal("data.template_file." + labels[0] + "_fargate_docker_build_script.rendered"),
                    }])
                }
            },
            {
                Name: labels[0] + "_fargate_docker_build_script",
                //we use a template_file so the values for build_script, vars etc can have traversals and stuff in them
                Type: "cr_[data]_template_file",
                Value: {
                    local useSudo = barbe.asVal(std.get(dotDocker, "use_sudo",  barbe.asSyntax(false))),
                    local dockerCmd = if useSudo then "sudo docker" else "docker",
                    local templateArgs = barbe.asVal(std.get(dotDocker, "template_args", barbe.asSyntax({}))),
                    local buildArgs = barbe.asVal(std.get(dotDocker, "build_args", barbe.asSyntax({}))),
                    local tag = std.get(dotDocker, "tag", barbe.appendToTemplate(namePrefix, [barbe.asSyntax(labels[0])])),
                    local pushCommand = dockerCmd + " tag ${tag}:latest \"${ecr_repository}\" && aws ecr get-login-password --region ${aws_region} | " + dockerCmd + " login --username AWS --password-stdin \"${aws_account_id}.dkr.ecr.${aws_region}.amazonaws.com\" && " + dockerCmd + " push \"${ecr_repository}\"",
                    local buildTemplate =
                        if std.objectHas(dotDocker, "build_script") then
                            dotDocker.build_script
                        else if std.objectHas(dotDocker, "login_command") && std.objectHas(dotDocker, "build_command") then
                            dotDocker.login_command + " && " + dotDocker.build_command + " && " + pushCommand
                        else if std.objectHas(dotDocker, "build_command") then
                            dotDocker.build_command + " && " + pushCommand
                        else
                            dockerCmd + " build -f ${dockerfile_path} " +
                            std.join(" ", [
                                "--build-arg " + key + "=\"${build_arg_" + key + "}\"",
                                for key in std.objectFields(buildArgs)
                            ]) +
                            " -t ${tag} --network=host . && " +
                            pushCommand
                        ,
                    template: buildTemplate,
                    vars: {
                        tag: tag,
                        ecr_repository: barbe.asTraversal("local.__aws_fargate_task_" + labels[0] + "_repo_url"),
                        aws_region: barbe.asTraversal("data.aws_region." + regionDataName + ".name"),
                        aws_account_id: barbe.asTraversal("data.aws_caller_identity.current.account_id"),
                        dockerfile_path: ".package/Dockerfile_" + labels[0] + "_fargate_task_package",
                    } + {
                        [key]: templateArgs[key]
                        for key in std.objectFields(templateArgs)
                    } + {
                        ["build_arg_"+key]: buildArgs[key]
                        for key in std.objectFields(buildArgs)
                    }
                }
            },
            if !std.objectHas(dotDocker, "dockerfile_content") && (!std.objectHas(dotDocker, "entrypoint") || dotDocker.entrypoint == null) then
                error "<showuser>entrypoint must be specified for " + labels[0] + ".aws_fargate_task, use either " + labels[0] + ".aws_fargate_task.docker.entrypoint or " + labels[0] + ".aws_fargate_task.entrypoint, or specify a dockerfile in " + labels[0] + ".aws_fargate_task.docker.dockerfile_content</showuser>"
            ,
            {
                Name: labels[0] + "_fargate_task_dockerfile",
                Type: "raw_file",
                Value: {
                    path: ".package/Dockerfile_" + labels[0] + "_fargate_task_package",

                    local guessRuntimeName() =
                        if std.length(std.findSubstr("python", barbe.asStr(dotDocker.entrypoint))) != 0 then
                            "python"
                        else if std.length(std.findSubstr("node", barbe.asStr(dotDocker.entrypoint))) != 0 then
                            "node"
                        else if !std.objectHas(dotDocker, "dockerfile_content") then
                            error "<showuser>couldn't guess runtime name from entrypoint, please provide it explicitly in " + labels[0] + ".aws_fargate_task.docker.runtime.name</showuser>"
                    ,

                    local runtime = std.get(dotDocker, "runtime", barbe.asSyntax({})),
                    local runtimeName =
                        if std.objectHas(dotDocker, "runtime") then
                            if std.isObject(barbe.asVal(dotDocker.runtime)) then
                                if std.objectHas(barbe.asVal(dotDocker.runtime), "name") then
                                    barbe.asStr(barbe.asVal(dotDocker.runtime).name)
                                else
                                    guessRuntimeName()
                            else
                                barbe.asStr(dotDocker.runtime)
                        else
                            guessRuntimeName()
                        ,
                    local defaultVersions = {
                        python: "3.10.5-alpine",
                        node: "16.16.0-alpine",
                        //go relies on the user providing an executable already compiled
                        go: "ubuntu:20.04",
                    },
                    local runtimeVersion = if std.objectHas(runtime, "version") then
                        runtime.version
                    else if std.objectHas(defaultVersions, runtimeName) then
                        defaultVersions[runtimeName]
                    else
                        error "<showuser>no default version found for runtime '" + runtimeName + "', please provide it explicitly in " + labels[0] + ".aws_fargate_task.docker.runtime.version</showuser>"
                    ,

                    local dockerfile =
                        if std.objectHas(dotDocker, "dockerfile_content") then
                            dotDocker.dockerfile_content
                        else
                            if runtimeName == "python" then
                                "FROM python:" + runtimeVersion + "\n" +
                                "COPY .package/" + labels[0] + "_fargate_task_package.zip code.zip\n" +
                                "RUN apt-get update && apt-get install -y unzip ca-certificates\n" +
                                "RUN unzip code.zip\n" +
                                "RUN rm code.zip\n" +
                                "RUN apt-get remove -y unzip\n" +
                                "CMD " + barbe.asStr(dotDocker.entrypoint)
                            else if runtimeName == "node" then
                                "FROM node:" + runtimeVersion + "\n" +
                                "COPY .package/" + labels[0] + "_fargate_task_package.zip code.zip\n" +
                                "RUN apt-get update && apt-get install -y unzip ca-certificates\n" +
                                "RUN unzip code.zip\n" +
                                "RUN rm code.zip\n" +
                                "RUN apt-get remove -y unzip\n" +
                                "CMD " + barbe.asStr(dotDocker.entrypoint)
                            else if runtimeName == "go" then
                                "FROM " + runtimeVersion + "\n" +
                                "COPY .package/" + labels[0] + "_fargate_task_package.zip code.zip\n" +
                                "RUN apt-get update && apt-get install -y unzip ca-certificates\n" +
                                "RUN unzip code.zip\n" +
                                "RUN rm code.zip\n" +
                                "RUN apt-get remove -y unzip\n" +
                                "CMD " + barbe.asStr(dotDocker.entrypoint)
                            else
                                error "<showuser>unknown runtime '" + runtimeName + "'</showuser>"
                        ,
                    content: dockerfile,
                }
            },
            {
                Name: labels[0] + "_fargate_task_logs",
                Type: "cr_aws_cloudwatch_log_group",
                Value: {
                    name: barbe.appendToTemplate(barbe.appendToTemplate(barbe.asSyntax("/ecs/"), [namePrefix]), [barbe.asSyntax(labels[0])]),
                    retention_in_days: std.get(fullBlock, "logs_retention_days", barbe.asSyntax(30)),
                }
            },
            {
                Name: labels[0] + "_fargate_task_def",
                Type: "cr_aws_ecs_task_definition",
                Value: {
                    family: barbe.appendToTemplate(namePrefix, [barbe.asSyntax(labels[0])]),
                    cpu: cpu,
                    memory: memory,
                    network_mode: "awsvpc",
                    requires_compatibilities: ["FARGATE"],
                    execution_role_arn: barbe.asTraversal("local.__aws_fargate_task_" + labels[0] + "_task_execution_role_arn"),
                    task_role_arn: std.get(
                        fullBlock, "role",
                        barbe.asTraversal("aws_iam_role.default_lambda_role.arn")
                    ),
                    container_definitions: barbe.asFuncCall(
                        "jsonencode",
                        [[
                            {
                                name: barbe.appendToTemplate(namePrefix, [barbe.asSyntax(labels[0])]),
                                image: barbe.asTraversal("local.__aws_fargate_task_" + labels[0] + "_repo_url"),
                                cpu: cpu,
                                memory: memory,
                                environment: [
                                    { name: key, value: dotEnvironment[key] }
                                    for key in std.objectFields(dotEnvironment)
                                ],
                                logConfiguration: {
                                  logDriver: "awslogs",
                                  options: {
                                    "awslogs-group": barbe.asTraversal("aws_cloudwatch_log_group." + labels[0] + "_fargate_task_logs.name"),
                                    "awslogs-region": barbe.asTraversal("data.aws_region." + regionDataName + ".name"),
                                    "awslogs-stream-prefix": barbe.appendToTemplate(namePrefix, [barbe.asSyntax(labels[0])]),
                                  },
                                },
                                portMappings: [
                                    local mVal = barbe.asVal(m);
                                    if !std.objectHas(mVal, "container_port") then
                                        error '<showuser>aws_fargate_task.port_mapping.container_port must be specified</showuser>'
                                    else
                                    {
                                        containerPort: mVal.container_port,
                                        hostPort: std.get(mVal, "host_port", mVal.container_port),
                                        protocol: std.get(mVal, "protocol", "tcp"),
                                    }
                                    for m in barbe.asVal(std.get(fullBlock, "port_mapping", barbe.asSyntax([])))
                                ] + [
                                    {
                                        containerPort: port,
                                        hostPort: port,
                                        protocol: "tcp",
                                    }
                                    for port in barbe.asVal(std.get(fullBlock, "mapped_ports", barbe.asSyntax([])))
                                ]
                            }
                        ]]
                    )
                }
            },

            if std.objectHas(fullBlock, "security_group_id") then
                {
                    Name: "",
                    Type: "cr_[locals]",
                    Value: {
                        ["__aws_fargate_task_" + labels[0] + "_security_group_id"]: fullBlock.security_group_id,
                    }
                }
            else
                [{
                    Name: "",
                    Type: "cr_[locals]",
                    Value: {
                        ["__aws_fargate_task_" + labels[0] + "_security_group_id"]: barbe.asTraversal("aws_security_group.aws_fargate_task_" + labels[0] + "_secgr.id"),
                    }
                },
                {
                    Name: "aws_fargate_task_" + labels[0] + "_secgr",
                    Type: "cr_aws_security_group",
                    Value: {
                        name: barbe.appendToTemplate(namePrefix, [barbe.asSyntax(labels[0] + "-sg")]),
                        vpc_id: barbe.asTraversal("local.__aws_fargate_task_" + labels[0] + "_vpc.id"),
                    }
                },
                {
                    Name: "aws_fargate_task_" + labels[0] + "_secgr_ingress",
                    Type: "cr_aws_security_group_rule",
                    Value: {
                        type: "ingress",
                        security_group_id: barbe.asTraversal("aws_security_group.aws_fargate_task_" + labels[0] + "_secgr.id"),
                        from_port: 0,
                        to_port: 65535,
                        protocol: -1,
                        cidr_blocks: ["0.0.0.0/0"]
                    }
                },
                {
                    Name: "aws_fargate_task_" + labels[0] + "_secgr_egress",
                    Type: "cr_aws_security_group_rule",
                    Value: {
                        type: "egress",
                        security_group_id: barbe.asTraversal("aws_security_group.aws_fargate_task_" + labels[0] + "_secgr.id"),
                        from_port: 0,
                        to_port: 65535,
                        protocol: -1,
                        cidr_blocks: ["0.0.0.0/0"]
                    }
                }]
            ,

            if !std.objectHas(fullBlock, "execution_role_arn") then
                [{
                    Name: "ecs_task_execution_role",
                    Type: "cr_[data]_aws_iam_role",
                    Value: {
                        name: "ecsTaskExecutionRole"
                    }
                },
                {
                    Name: "",
                    Type: "cr_[locals]",
                    Value: {
                        ["__aws_fargate_task_" + labels[0] + "_task_execution_role_arn"]: barbe.asTraversal("data.aws_iam_role.ecs_task_execution_role.arn"),
                    }
                }]
            else
                {
                    Name: "",
                    Type: "cr_[locals]",
                    Value: {
                        ["__aws_fargate_task_" + labels[0] + "_task_execution_role_arn"]: fullBlock.execution_role_arn,
                    }
                }
            ,

            if barbe.asVal(std.get(fullBlock, "use_default_vpc", barbe.asSyntax(false))) then
                [{
                    Name: "",
                    Type: "cr_[locals]",
                    Value: {
                        ["__aws_fargate_task_" + labels[0] + "_vpc"]: barbe.asTraversal("data.aws_vpc.default")
                    }
                },
                {
                    Name: "default",
                    Type: "cr_[data]_aws_vpc",
                    Value: {
                        default: true
                    }
                }]
            else if std.objectHas(fullBlock, "vpc_id") then
                [{
                    Name: "",
                    Type: "cr_[locals]",
                    Value: {
                        ["__aws_fargate_task_" + labels[0] + "_vpc"]: barbe.asTraversal("data.aws_vpc.aws_fargate_task_" + labels[0] + "_imported_vpc")
                    }
                },
                {
                    Name: "aws_fargate_task_" + labels[0] + "_imported_vpc",
                    Type: "cr_[data]_aws_vpc",
                    Value: {
                        id: fullBlock.vpc_id
                    }
                }]
            else
                [{
                    Name: "",
                    Type: "cr_[locals]",
                    Value: {
                        ["__aws_fargate_task_" + labels[0] + "_vpc"]: barbe.asTraversal("aws_vpc.aws_fargate_task_" + labels[0] + "_vpc")
                    }
                },
                {
                    Name: "aws_fargate_task_" + labels[0] + "_vpc",
                    Type: "cr_aws_vpc",
                    Value: {
                        local dotVpc = barbe.asVal(barbe.mergeTokens(std.get(fullBlock, "vpc", barbe.asSyntax([{}])).ArrayConst)),
                        tags: {
                            Name: std.get(
                                dotVpc, "name",
                                barbe.appendToTemplate(namePrefix, [barbe.asSyntax(labels[0] + "-vpc")])
                            )
                        },
                        cidr_block: std.get(
                            dotVpc, "cidr_block",
                            "10.0.0.0/16"
                        ),
                        enable_dns_hostnames: true
                    }
                }]
            ,

            if std.objectHas(fullBlock, "subnet_ids") then
                {
                    Name: "",
                    Type: "cr_[locals]",
                    Value: {
                        ["__aws_fargate_task_" + labels[0] + "_subnet_ids"]: fullBlock.subnet_ids
                    }
                }
            else
                local dotSubnets = barbe.asVal(std.get(fullBlock, "subnet", barbe.asSyntax([{/*this makes a default subnet if none defined*/}])));
                [
                    {
                        Name: "",
                        Type: "cr_[locals]",
                        Value: {
                           ["__aws_fargate_task_" + labels[0] + "_subnet_ids"]: [
                                barbe.asTraversal("aws_subnet.aws_fargate_task_" + labels[0] + "_subnet_" + i + ".id")
                                for i in std.range(0, std.length(dotSubnets)-1)
                           ],
                        }
                    },
                    [
                        local subnetBlock = barbe.asVal(dotSubnets[i]);
                        local makeNatGateway = barbe.asVal(std.get(subnetBlock, "make_nat_gateway", barbe.asSyntax(false)));
                        local kind = barbe.asStr(std.get(subnetBlock, "kind", barbe.asSyntax("public")));
                        [{
                            Name: "aws_fargate_task_" + labels[0] + "_subnet_" + i,
                            Type: "cr_aws_subnet",
                            Value: {
                                vpc_id: barbe.asTraversal("local.__aws_fargate_task_" + labels[0] + "_vpc.id"),
                                availability_zone: barbe.asTraversal("data.aws_availability_zones." + avZoneName + ".names[0]"),
                                cidr_block: std.get(
                                    subnetBlock, "cidr_block",
                                    barbe.asFuncCall("cidrsubnet", [
                                        barbe.asTraversal("local.__aws_fargate_task_" + labels[0] + "_vpc.cidr_block"),
                                        4,
                                        1+i
                                    ])
                                ),
                            }
                        },
                        if kind == "private" && makeNatGateway then
                            [{
                                Name: "aws_fargate_task_" + labels[0] + "_subnet_" + i + "_nat_eip",
                                Type: "cr_aws_eip",
                                Value: {
                                    vpc: true
                                }
                            },
                            {
                                Name: "aws_fargate_task_" + labels[0] + "_subnet_" + i + "_nat_gateway",
                                Type: "cr_aws_nat_gateway",
                                Value: {
                                    allocation_id: barbe.asTraversal("aws_eip.aws_fargate_task_" + labels[0] + "_subnet_" + i + "_nat_eip.id"),
                                    subnet_id: barbe.asTraversal("aws_subnet.aws_fargate_task_" + labels[0] + "_subnet_" + i + ".id"),
                                    tags: {
                                        Name: std.get(
                                            subnetBlock, "name",
                                            barbe.appendToTemplate(namePrefix, [barbe.asSyntax(labels[0] + "-subnet-" + i + "-nat")])
                                        )
                                    }
                                }
                            }]
                        ,

                        if kind == "public" then
                            [{
                                Name: "aws_fargate_task_" + labels[0] + "_subnet_" + i + "_igw",
                                Type: "cr_aws_internet_gateway",
                                Value: {
                                    vpc_id: barbe.asTraversal("local.__aws_fargate_task_" + labels[0] + "_vpc.id"),
                                    tags: {
                                        Name: std.get(
                                            subnetBlock, "name",
                                            barbe.appendToTemplate(namePrefix, [barbe.asSyntax(labels[0] + "-subnet-" + i + "-igw")])
                                        )
                                    }
                                }
                            }]
                        ,

                        {
                            Name: "aws_fargate_task_" + labels[0] + "_subnet_" + i + "_route_table",
                            Type: "cr_aws_route_table",
                            Value: {
                                vpc_id: barbe.asTraversal("local.__aws_fargate_task_" + labels[0] + "_vpc.id"),
                                route: barbe.asBlock([{
                                    cidr_block: "0.0.0.0/0",
                                    gateway_id: if kind == "public" then
                                            barbe.asTraversal("aws_internet_gateway.aws_fargate_task_" + labels[0] + "_subnet_" + i + "_igw.id")
                                        else
                                            null,
                                    nat_gateway_id: if kind == "private" && makeNatGateway then
                                            barbe.asTraversal("aws_nat_gateway.aws_fargate_task_" + labels[0] + "_subnet_" + i + "_nat_gateway.id")
                                        else
                                            null,
                                }]),
                                tags: {
                                    Name: std.get(
                                        subnetBlock, "name",
                                        barbe.appendToTemplate(namePrefix, [barbe.asSyntax(labels[0] + "-subnet-" + i + "-rt")])
                                    )
                                }
                            }
                        },
                        {
                            Name: "aws_fargate_task_" + labels[0] + "_subnet_" + i + "_route_table_association",
                            Type: "cr_aws_route_table_association",
                            Value: {
                                route_table_id: barbe.asTraversal("aws_route_table.aws_fargate_task_" + labels[0] + "_subnet_" + i + "_route_table.id"),
                                subnet_id: barbe.asTraversal("aws_subnet.aws_fargate_task_" + labels[0] + "_subnet_" + i + ".id")
                            }
                        }

                        ]
                        for i in std.range(0, std.length(dotSubnets)-1)
                    ]
                ]
            ,

            if std.objectHas(fullBlock, "repository_url") then
                {
                    Name: "",
                    Type: "cr_[locals]",
                    Value: {
                        ["__aws_fargate_task_" + labels[0] + "_repo_url"]: fullBlock.repository_url
                    }
                }
            else
                local dotEcr = barbe.asVal(std.get(fullBlock, "ecr_repository", barbe.asSyntax([{/*this makes a default repo if none defined*/}])));
                if std.length(dotEcr) > 1 then
                    error "<showuser>only one ECR repository can be defined for a aws_fargate_task</showuser>"
                else
                    local ecrBlock = barbe.asVal(dotEcr[0]);
                    [{
                         Name: "",
                         Type: "cr_[locals]",
                         Value: {
                             ["__aws_fargate_task_" + labels[0] + "_repo_url"]: barbe.asTraversal("aws_ecr_repository.aws_fargate_task_" + labels[0] + "_ecr_repository.repository_url")
                         }
                     },
                     {
                        Name: "aws_fargate_task_" + labels[0] + "_ecr_repository",
                        Type: "cr_aws_ecr_repository",
                        Value: {
                            name: std.get(
                                ecrBlock, "name",
                                barbe.appendToTemplate(namePrefix, [barbe.asSyntax(labels[0] + "-ecr")])
                            ),
                        }
                    },
                    if !barbe.asVal(std.get(ecrBlock, "dont_expire_images", barbe.asSyntax(false))) then
                        {
                            Name: "aws_fargate_task_" + labels[0] + "_ecr_policy",
                            Type: "cr_aws_ecr_lifecycle_policy",
                            Value: {
                                repository: barbe.asTraversal("aws_ecr_repository.aws_fargate_task_" + labels[0] + "_ecr_repository.name"),
                                policy: if std.objectHas(ecrBlock, "policy") then
                                        ecrBlock.policy
                                    else if std.objectHas(ecrBlock, "max_untagged_count") then
                                        if !std.isNumber(barbe.asVal(ecrBlock.expire_untagged_after_days)) then
                                            error "<showuser>aws_fargate_task.ecr_repository.max_untagged_count must be a number (or not defined)</showuser>"
                                        else
                                            std.manifestJsonMinified({
                                                "rules": [
                                                    {
                                                    "action": {
                                                      "type": "expire"
                                                    },
                                                    "selection": {
                                                      "countType": "imageCountMoreThan",
                                                      "countNumber": barbe.asVal(ecrBlock.max_untagged_count),
                                                      "tagStatus": "untagged"
                                                    },
                                                    "description": "Delete untagged",
                                                    "rulePriority": 1
                                                    }
                                                ]
                                            })
                                    else
                                        if std.objectHas(ecrBlock, "expire_untagged_after_days") && !std.isNumber(barbe.asVal(ecrBlock.expire_untagged_after_days)) then
                                            error "<showuser>aws_fargate_task.ecr_repository.expire_untagged_after_days must be a number (or not defined)</showuser>"
                                        else
                                            std.manifestJsonMinified({
                                                "rules": [
                                                    {
                                                      "action": {
                                                        "type": "expire"
                                                      },
                                                      "selection": {
                                                        "countType": "sinceImagePushed",
                                                        "countUnit": "days",
                                                        "countNumber": barbe.asVal(std.get(ecrBlock, "expire_untagged_after_days", barbe.asSyntax(30))),
                                                        "tagStatus": "untagged"
                                                      },
                                                      "description": "Delete untagged",
                                                      "rulePriority": 1
                                                    }
                                                ]
                                            })

                            }
                        }
                        ,
                    ]
            ,
        ]))
    )
])