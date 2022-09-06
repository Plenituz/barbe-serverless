local barbe = std.extVar("barbe");
local container = std.extVar("container");
local globalDefaults = barbe.compileDefaults(container, "");

local applyRegionProvider(fullBlock, bags) =
    if !std.objectHas(fullBlock, "region") then
        bags
    else
        [
            if std.length(std.findSubstr("cr_aws", bag.Type)) > 0 || std.length(std.findSubstr("cr_[data]_aws_", bag.Type)) > 0  then
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

local splitAny(str, c, maxsplits) =
    local aux(str, delim, i, arr, v) =
        local c = str[i];
        local i2 = i + 1;
        if i >= std.length(str) then
            arr + [v]
        else if c == delim && (maxsplits == -1 || std.length(arr) < maxsplits) then
            aux(str, delim, i2, arr + [v], []) tailstrict
        else
            aux(str, delim, i2, arr, (if std.isArray(v) then v else [v]) + [c]) tailstrict
        ;
    aux(str, c, 0, [], [])
    ;

local isSimpleTemplate(token) =
    if token.Type == "literal_value" then
        true
    else if token.Type != "template" then
        false
    else
        !std.member([
            if part.Type == "literal_value" then
                true
            else if part.Type == "template" then
                isSimpleTemplate(part)
            else
                false
            for part in token.Parts
        ], false)
    ;

local nullSplitTemplate(tokenOrStr, c) =
    if std.isString(tokenOrStr) || tokenOrStr.Type == "literal_value" || isSimpleTemplate(tokenOrStr) then
        [
            barbe.asSyntax(item)
            for item in std.split(barbe.asStr(tokenOrStr), c)
        ]
    else if tokenOrStr.Type == "template" then
        barbe.flatten([
            if isSimpleTemplate(part) then
                if std.length(std.findSubstr(c, barbe.asStr(part))) > 0 then
                    local split = std.split(barbe.asStr(part), c);
                    [
                        if i == std.length(split)-1 then
                           barbe.asSyntax(split[i])
                        else
                            if split[i] == "" then
                                null
                            else
                                [barbe.asSyntax(split[i]), null]
                        for i in std.range(0, std.length(split)-1)
                    ]
                else
                    part
            else
                part
            for part in tokenOrStr.Parts
        ])
    else
        error "cannot use splitTemplate function on '" + tokenOrStr + "'"
    ;

local splitTemplate(tokenOrStr, c) =
    local arrOfArr = splitAny(nullSplitTemplate(tokenOrStr, c), null, -1);
    [
        barbe.asTemplate(arr)
        for arr in arrOfArr
    ];

barbe.databags([
    barbe.iterateBlocks(container, "aws_http_api", function(bag)
        local block = barbe.asVal(bag.Value);
        local labels = barbe.flatten([bag.Name, bag.Labels]);
        local name = if std.length(labels) > 0 then labels[0] else "default";
        local blockDefaults = barbe.makeBlockDefault(container, globalDefaults, block);
        local fullBlock = barbe.asVal(barbe.mergeTokens([barbe.asSyntax(blockDefaults), bag.Value]));
        local namePrefix = barbe.concatStrArr(std.get(fullBlock, "name_prefix", barbe.asSyntax([""])));
        local regionDataName = barbe.asStr(std.get(fullBlock, "region", barbe.asSyntax("current")));

        local dotAccessLogs = barbe.asVal(barbe.mergeTokens(std.get(fullBlock, "access_logs", barbe.asSyntax([])).ArrayConst));
        local routes = barbe.asValArrayConst(std.get(fullBlock, "route", barbe.asSyntax([])));
        local allEventHttp = barbe.flatten([
            barbe.iterateBlocks(container, "aws_function", function(bag)
                local other = barbe.asVal(bag.Value);
                if std.objectHas(other, "event_http_route") then
                    [
                        if !std.objectHas(event, "aws_http_api") && name == "default" then
                            {event: event, block: other}
                        else if std.objectHas(event, "aws_http_api") && event.aws_http_api.Traversal[1].Name == name then
                            {event: event, block: other}
                        else
                            []
                        for event in barbe.asValArrayConst(other.event_http_route)
                    ]
                else
                    []
            )
        ]);

        applyRegionProvider(fullBlock, barbe.flatten([
            {
                Name: name + "_aws_http_api_traversal_transform",
                Type: "traversal_transform",
                Value: {
                    ["aws_http_api." + name]: "aws_apigatewayv2_api." + name + "_aws_http_api"
                }
            },
            {
                Name: name + "_aws_http_api",
                Type: "cr_aws_apigatewayv2_api",
                Value: {
                    name: barbe.appendToTemplate(namePrefix, [barbe.asSyntax(name)]),
                    protocol_type: "HTTP",
                    description: std.get(fullBlock, "description", null),
                    disable_execute_api_endpoint:
                        if !std.objectHas(fullBlock, "disable_execute_api_endpoint") && std.objectHas(fullBlock, "domain") then
                            true
                        else
                            std.get(fullBlock, "disable_execute_api_endpoint", null)
                        ,
                    cors_configuration:
                        if barbe.asVal(std.get(fullBlock, "cors_enabled", barbe.asSyntax(false))) || std.objectHas(fullBlock, "cors_configuration") then
                            local dotCors = barbe.asVal(barbe.mergeTokens(std.get(fullBlock, "cors_configuration", barbe.asSyntax([])).ArrayConst));
                            barbe.asBlock([{
                                allow_headers: std.get(dotCors, "allow_headers", ["*"]),
                                allow_methods: std.get(dotCors, "allow_methods", ["OPTIONS","GET"]),
                                allow_origins: std.get(dotCors, "allow_origins", ["*"]),
                                allow_credentials: std.get(dotCors, "allow_credentials", null),
                                expose_headers: std.get(dotCors, "expose_headers", null),
                                max_age: std.get(dotCors, "max_age", null)
                            }])
                        else
                            null
                        ,
                }
            },
            {
                Name: name + "_aws_http_api_stage",
                Type: "cr_aws_apigatewayv2_stage",
                Value: {
                    api_id: barbe.asTraversal("aws_apigatewayv2_api." + name + "_aws_http_api.id"),
                    name: std.get(fullBlock, "stage_name", "$default"),
                    auto_deploy: true,
                    default_route_settings: barbe.asBlock([{
                        detailed_metrics_enabled: std.get(fullBlock, "detailed_metrics_enabled", null),
                        throttling_burst_limit: std.get(fullBlock, "throttling_burst_limit", 5000),
                        throttling_rate_limit: std.get(fullBlock, "throttling_rate_limit", 10000),
                    }]),
                    access_log_settings:
                        if std.objectHas(fullBlock, "access_logs") then
                            local defaultLogFormat = "{\"requestId\":\"$context.requestId\",\"extendedRequestId\":\"$context.extendedRequestId\",\"ip\":\"$context.identity.sourceIp\",\"caller\":\"$context.identity.caller\",\"user\":\"$context.identity.user\",\"requestTime\":\"$context.requestTime\",\"httpMethod\":\"$context.httpMethod\",\"resourcePath\":\"$context.resourcePath\",\"status\":\"$context.status\",\"protocol\":\"$context.protocol\",\"responseLength\":\"$context.responseLength\",\"errorMessage\":\"$context.error.message\",\"errorResponseType\":\"$context.error.responseType\",\"errorMessageString\":$context.error.messageString}";
                            local defaultDestination = barbe.asTraversal("aws_cloudwatch_log_group." + name + "_aws_http_api_access_logs.arn");
                            barbe.asBlock([{
                                format: std.get(dotAccessLogs, "format", defaultLogFormat),
                                destination_arn: std.get(dotAccessLogs, "destination_arn", defaultDestination),
                            }])
                        else
                            null
                        ,
                    route_settings:
                        if std.length(allEventHttp) + std.length(routes) > 0 then
                            barbe.asBlock(barbe.flatten([
                                [
                                    local mergedRoute = fullBlock + route;
                                    {
                                        route_key: barbe.asTraversal("aws_apigatewayv2_route." + name + "_route_" + std.md5(barbe.asValArrayConst(route.labels)[0]) + "_route" + ".route_key"),
                                        detailed_metrics_enabled: std.get(route, "detailed_metrics_enabled", null),
                                        logging_level: std.get(route, "logging_level", null),
                                        throttling_burst_limit: std.get(mergedRoute, "throttling_burst_limit", 5000),
                                        throttling_rate_limit: std.get(mergedRoute, "throttling_rate_limit", 10000),
                                    }
                                    for route in routes
                                ],
                                [
                                    local mergedRoute = fullBlock + tuple.event;
                                    {
                                        route_key: barbe.asTraversal("aws_apigatewayv2_route." + name + "_route_" + std.md5(barbe.asValArrayConst(tuple.event.labels)[0]) + "_route" + ".route_key"),
                                        detailed_metrics_enabled: std.get(tuple.event, "detailed_metrics_enabled", null),
                                        logging_level: std.get(tuple.event, "logging_level", null),
                                        throttling_burst_limit: std.get(mergedRoute, "throttling_burst_limit", 5000),
                                        throttling_rate_limit: std.get(mergedRoute, "throttling_rate_limit", 10000),
                                    }
                                    for tuple in allEventHttp
                                ]
                            ]))
                        else
                            null
                        ,
                }
            },
            if std.objectHas(fullBlock, "access_logs") && !std.objectHas(dotAccessLogs, "destination_arn") then
                {
                    Name: name + "_aws_http_api_access_logs",
                    Type: "cr_aws_cloudwatch_log_group",
                    Value: {
                        name: name + "-access-logs",
                        retention_in_days: std.get(dotAccessLogs, "retention_in_days", 30),
                    }
                }
            else
                null
            ,
            if std.length(allEventHttp) > 0 then
                [
                    // we use a hash of the route key instead of the index to avoid
                    // problems with the order of the routes in the config file
                    local i = std.md5(barbe.asValArrayConst(tuple.event.labels)[0]);
                    local functionLabel = barbe.asValArrayConst(tuple.block.labels)[0];
                    [
                        {
                            Name: name + "_route_" + i + "_permission",
                            Type: "cr_aws_lambda_permission",
                            Value: {
                                action: "lambda:InvokeFunction",
                                function_name: barbe.asTraversal("aws_lambda_function." + functionLabel + "_lambda.arn"),
                                principal: "apigateway.amazonaws.com",
                                source_arn: barbe.asTemplate([
                                    "arn:",
                                    barbe.asTraversal("data.aws_partition.current.partition"),
                                    ":execute-api:",
                                    barbe.asTraversal("data.aws_region." + regionDataName + ".name"),
                                    ":",
                                    barbe.asTraversal("data.aws_caller_identity.current.account_id"),
                                    ":",
                                    barbe.asTraversal("aws_apigatewayv2_api." + name + "_aws_http_api.id"),
                                    "/*",
                                ])
                            }
                        },
                        {
                            Name: name + "_route_" + i + "_integration",
                            Type: "cr_aws_apigatewayv2_integration",
                            Value: {
                                api_id: barbe.asTraversal("aws_apigatewayv2_api." + name + "_aws_http_api.id"),
                                integration_type: "AWS_PROXY",
                                integration_uri: barbe.asTraversal("aws_lambda_function." + functionLabel + "_lambda.invoke_arn"),
                                payload_format_version: std.get(tuple.event, "payload_format_version", "2.0"),
                                timeout_milliseconds: std.get(tuple.event, "timeout_milliseconds", 30000),
                            }
                        },
                        {
                            Name: name + "_route_" + i + "_route",
                            Type: "cr_aws_apigatewayv2_route",
                            Value: {
                                depends_on: [
                                    barbe.asTraversal("aws_apigatewayv2_integration." + name + "_route_" + i + "_integration")
                                ],
                                api_id: barbe.asTraversal("aws_apigatewayv2_api." + name + "_aws_http_api.id"),
                                route_key: barbe.asValArrayConst(tuple.event.labels)[0],
                                target: barbe.asTemplate([
                                    "integrations/",
                                    barbe.asTraversal("aws_apigatewayv2_integration." + name + "_route_" + i + "_integration.id"),
                                ])
                            }
                            + if std.objectHas(tuple.event, "authorizer") then
                                local trAsStr = barbe.asStr(tuple.event.authorizer);
                                {
                                    authorization_type:
                                        if std.startsWith(trAsStr, "jwt_authorizer") then
                                            "JWT"
                                        else if std.startsWith(trAsStr, "lambda_authorizer") then
                                            "CUSTOM"
                                        else
                                            error "<showuser>unknown authorizer type '" + trAsStr + "'</showuser>"
                                        ,
                                    authorizer_id:
                                        if std.startsWith(trAsStr, "jwt_authorizer") then
                                           barbe.asTraversal("aws_apigatewayv2_authorizer." + name + "_auth_jwt_" + tuple.event.authorizer.Traversal[1].Name + ".id")
                                        else if std.startsWith(trAsStr, "lambda_authorizer") then
                                           barbe.asTraversal("aws_apigatewayv2_authorizer." + name + "_auth_lambda_" + tuple.event.authorizer.Traversal[1].Name + ".id")
                                        else
                                           error "<showuser>unknown authorizer type '" + trAsStr + "'</showuser>"
                                        ,
                                }
                            else
                                {}
                        }
                    ]
                    for tuple in allEventHttp
                ]
            else
                null
            ,
            if std.length(routes) > 0 then
                [
                    // we use a hash of the route key instead of the index to avoid
                    // problems with the order of the routes in the config file
                    local routeKey = barbe.asValArrayConst(route.labels)[0];
                    local i = std.md5(routeKey);
                    [
                        {
                            Name: name + "_route_" + i + "_permission",
                            Type: "cr_aws_lambda_permission",
                            Value: {
                                action: "lambda:InvokeFunction",
                                function_name: barbe.appendToTraversal(route.aws_function, "arn"),
                                principal: "apigateway.amazonaws.com",
                                source_arn: barbe.asTemplate([
                                    "arn:",
                                    barbe.asTraversal("data.aws_partition.current.partition"),
                                    ":execute-api:",
                                    barbe.asTraversal("data.aws_region." + regionDataName + ".name"),
                                    ":",
                                    barbe.asTraversal("data.aws_caller_identity.current.account_id"),
                                    ":",
                                    barbe.asTraversal("aws_apigatewayv2_api." + name + "_aws_http_api.id"),
                                    "/*",
                                ])
                            }
                        },
                        {
                            Name: name + "_route_" + i + "_integration",
                            Type: "cr_aws_apigatewayv2_integration",
                            Value: {
                                api_id: barbe.asTraversal("aws_apigatewayv2_api." + name + "_aws_http_api.id"),
                                integration_type: "AWS_PROXY",
                                integration_uri: barbe.appendToTraversal(route.aws_function, "invoke_arn"),
                                payload_format_version: std.get(route, "payload_format_version", "2.0"),
                                timeout_milliseconds: std.get(route, "timeout_milliseconds", 30000),
                            }
                        },
                        {
                            Name: name + "_route_" + i + "_route",
                            Type: "cr_aws_apigatewayv2_route",
                            Value: {
                                depends_on: [
                                    barbe.asTraversal("aws_apigatewayv2_integration." + name + "_route_" + i + "_integration")
                                ],
                                api_id: barbe.asTraversal("aws_apigatewayv2_api." + name + "_aws_http_api.id"),
                                route_key: routeKey,
                                target: barbe.asTemplate([
                                    "integrations/",
                                    barbe.asTraversal("aws_apigatewayv2_integration." + name + "_route_" + i + "_integration.id"),
                                ]),
                            }
                            + if std.objectHas(route, "authorizer") then
                                local trAsStr = barbe.asStr(route.authorizer);
                                {
                                    authorization_type:
                                        if std.startsWith(trAsStr, "jwt_authorizer") then
                                            "JWT"
                                        else if std.startsWith(trAsStr, "lambda_authorizer") then
                                            "CUSTOM"
                                        else
                                            error "<showuser>unknown authorizer type '" + trAsStr + "'</showuser>"
                                        ,
                                    authorizer_id:
                                        if std.startsWith(trAsStr, "jwt_authorizer") then
                                           barbe.asTraversal("aws_apigatewayv2_authorizer." + name + "_auth_jwt_" + route.authorizer.Traversal[1].Name + ".id")
                                        else if std.startsWith(trAsStr, "lambda_authorizer") then
                                           barbe.asTraversal("aws_apigatewayv2_authorizer." + name + "_auth_lambda_" + route.authorizer.Traversal[1].Name + ".id")
                                        else
                                           error "<showuser>unknown authorizer type '" + trAsStr + "'</showuser>"
                                        ,
                                }
                            else
                                {}
                        }
                    ]
                    for route in routes
                ]
            else
                null
            ,
            if std.objectHas(fullBlock, "jwt_authorizer") then
                [
                    local authorizerName = barbe.asValArrayConst(authorizer.labels)[0];
                    {
                        Name: name + "_auth_jwt_" + authorizerName,
                        Type: "cr_aws_apigatewayv2_authorizer",
                        Value: {
                            api_id: barbe.asTraversal("aws_apigatewayv2_api." + name + "_aws_http_api.id"),
                            name: authorizerName,
                            authorizer_type: "JWT",
                            identity_sources: std.get(authorizer, "identity_sources", ["$request.header.Authorization"]),
                            jwt_configuration:
                                if std.objectHas(authorizer, "audience") || std.objectHas(authorizer, "issuer") then
                                    barbe.asBlock([{
                                       audience: std.get(authorizer, "audience", null),
                                       issuer: std.get(authorizer, "issuer", null),
                                    }])
                                else
                                    null
                                ,
                        }
                    }
                    for authorizer in barbe.asValArrayConst(std.get(fullBlock, "jwt_authorizer", barbe.asSyntax([])))
                ]
            else
                null
            ,
            if std.objectHas(fullBlock, "lambda_authorizer") then
                [
                    local authorizerName = barbe.asValArrayConst(authorizer.labels)[0];
                    {
                        Name: name + "_auth_lambda_" + authorizerName,
                        Type: "cr_aws_apigatewayv2_authorizer",
                        Value: {
                            api_id: barbe.asTraversal("aws_apigatewayv2_api." + name + "_aws_http_api.id"),
                            name: authorizerName,
                            authorizer_type: "REQUEST",
                            identity_sources: std.get(authorizer, "identity_sources", ["$request.header.Authorization"]),
                            authorizer_result_ttl_in_seconds: std.get(authorizer, "result_ttl_in_seconds", 0),
                            authorizer_payload_format_version: std.get(authorizer, "payload_format_version", "2.0"),
                            enable_simple_responses: std.get(authorizer, "enable_simple_responses", true),
                            authorizer_uri: barbe.asTemplate([
                                "arn:",
                                barbe.asTraversal("data.aws_partition.current.partition"),
                                ":apigateway:",
                                barbe.asTraversal("data.aws_region." + regionDataName + ".name"),
                                ":lambda:path/2015-03-31/functions/",
                                barbe.appendToTraversal(authorizer.aws_function, "arn"),
                                "/invocations",
                            ]),
                        }
                    }
                    for authorizer in barbe.asValArrayConst(std.get(fullBlock, "lambda_authorizer", barbe.asSyntax([])))
                ]
            else
                null
            ,
            if std.objectHas(fullBlock, "domain") then
                local dotDomain = barbe.asValArrayConst(std.get(fullBlock, "domain", barbe.asSyntax([])));
                //TODO it's different when it's a subdomain and a regular base domain
                [
                    local domain = dotDomain[i];
                    [
                        {
                            Name: name + "_" + i + "_aws_http_api_mapping",
                            Type: "cr_aws_apigatewayv2_api_mapping",
                            Value: {
                                api_id: barbe.asTraversal("aws_apigatewayv2_api." + name + "_aws_http_api.id"),
                                domain_name: barbe.asTraversal("aws_apigatewayv2_domain_name." + name + "_" + i + "_aws_http_api_domain.id"),
                                stage: barbe.asTraversal("aws_apigatewayv2_stage." + name + "_aws_http_api_stage.id"),
                            }
                        },
                        {
                            Name: name + "_" + i + "_aws_http_api_domain",
                            Type: "cr_aws_apigatewayv2_domain_name",
                            Value: {
                                domain_name: domain.name,
                                domain_name_configuration: barbe.asBlock([{
                                    certificate_arn:
                                        if std.objectHas(domain, "certificate_arn") then
                                            domain.certificate_arn
                                        else if std.objectHas(domain, "certificate_domain") then
                                            barbe.asTraversal("data.aws_acm_certificate." + name + "_" + i + "_imported_cert.arn")
                                        else
                                            barbe.asTraversal("aws_acm_certificate_validation." + name + "_" + i + "_autogen_cert_validation.certificate_arn")
                                        ,
                                    endpoint_type: std.get(domain, "endpoint_type", "REGIONAL"),
                                    security_policy: std.get(domain, "security_policy", "TLS_1_2"),
                                    ownership_verification_certificate_arn: std.get(domain, "ownership_verification_certificate_arn", null),
                                }])
                            }
                        },
                        if !std.objectHas(domain, "certificate_arn") && std.objectHas(domain, "certificate_domain") then
                            {
                                Name: name + "_" + i + "_imported_cert",
                                Type: "cr_[data]_aws_acm_certificate",
                                Value: {
                                    domain: domain.certificate_domain,
                                    types: ["AMAZON_ISSUED"],
                                    most_recent: true
                                }
                            }
                        else
                            null
                        ,
                        if !std.objectHas(domain, "certificate_arn") && !std.objectHas(domain, "certificate_domain") then
                            [{
                                Name: name + "_" + i + "_autogen_cert",
                                Type: "cr_aws_acm_certificate",
                                Value: {
                                    domain_name: domain.name,
                                    validation_method: "DNS",
                                }
                            },
                            {
                                Name: name + "_" + i + "_autogen_cert_record",
                                Type: "cr_aws_route53_record",
                                Value: {
                                    for_each: {
                                        Type: "for",
                                        ForKeyVar: "dvo",
                                        ForCollExpr: barbe.asTraversal("aws_acm_certificate." + name + "_" + i + "_autogen_cert.domain_validation_options"),
                                        ForKeyExpr: barbe.asTraversal("dvo.domain_name"),
                                        ForValExpr: barbe.asSyntax({
                                            name: barbe.asTraversal("dvo.resource_record_name"),
                                            record: barbe.asTraversal("dvo.resource_record_value"),
                                            type: barbe.asTraversal("dvo.resource_record_type"),
                                        })
                                    },
                                    allow_overwrite: true,
                                    name: barbe.asTraversal("each.value.name"),
                                    records: [
                                        barbe.asTraversal("each.value.record"),
                                    ],
                                    ttl: 60,
                                    type: barbe.asTraversal("each.value.type"),
                                    zone_id: barbe.asTraversal("data.aws_route53_zone." + name + "_" + i + "_aws_http_api_zone.zone_id"),
                                }
                            },
                            {
                                Name: name + "_" + i + "_autogen_cert_validation",
                                Type: "cr_aws_acm_certificate_validation",
                                Value: {
                                    certificate_arn: barbe.asTraversal("aws_acm_certificate." + name + "_" + i + "_autogen_cert.arn"),
                                    validation_record_fqdns: {
                                        Type: "for",
                                        ForValVar: "record",
                                        ForCollExpr: barbe.asTraversal("aws_route53_record." + name + "_" + i + "_autogen_cert_record"),
                                        ForValExpr: barbe.asTraversal("record.fqdn"),
                                    }
                                }
                            }]
                        else
                            null
                        ,
                        {
                            Name: name + "_" + i + "_aws_http_api_zone",
                            Type: "cr_[data]_aws_route53_zone",
                            Value: {
                                // TODO follow traversal when possible to try to determine a concrete value for domain.name
                                // for example, if the user puts "abc.${env.BASE_DOMAIN}", we should be able to resolve it
                                // and avoid asking the usser for the zone name
                                name:
                                    if std.objectHas(domain, "zone") then
                                        domain.zone
                                    else if isSimpleTemplate(domain.name) then
                                        local domainName = barbe.asStr(domain.name);
                                        local split = std.split(domainName, ".");
                                        if std.length(split) == 2 then
                                            domainName
                                        else if std.length(split) == 3 then
                                            split[1] + "." + split[2]
                                        else
                                            error "<showuser>couldn't figure out the route 53 zone name from the domain name '" + domainName + "', please provide it explicitly in 'aws_http_api." + name + ".domain.zone'</showuser>"
                                    else if domain.name.Type == "template" && std.length(splitTemplate(domain.name, ".")) == 2 then
                                        splitTemplate(domain.name, ".")[1]
                                    else
                                        error "<showuser>couldn't figure out the route 53 zone name from the domain name, please provide it explicitly in 'aws_http_api." + name + ".domain.zone'</showuser>"
                            }
                        },
                        {
                            Name: name + "_" + i + "_aws_http_api_domain_record",
                            Type: "cr_aws_route53_record",
                            Value: {
                                name: barbe.asTraversal("aws_apigatewayv2_domain_name." + name + "_" + i + "_aws_http_api_domain.domain_name"),
                                type: "A",
                                zone_id: barbe.asTraversal("data.aws_route53_zone." + name + "_" + i + "_aws_http_api_zone.zone_id"),
                                alias: barbe.asBlock([{
                                    name: barbe.asTraversal("aws_apigatewayv2_domain_name." + name + "_" + i + "_aws_http_api_domain.domain_name_configuration[0].target_domain_name"),
                                    zone_id: barbe.asTraversal("aws_apigatewayv2_domain_name." + name + "_" + i + "_aws_http_api_domain.domain_name_configuration[0].hosted_zone_id"),
                                    evaluate_target_health: false,
                                }])
                            }
                        }
                    ]
                    for i in std.range(0, std.length(dotDomain)-1)
                ]
            else
                null
            ,
        ]))
    )
])
