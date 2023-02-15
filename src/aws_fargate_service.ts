import { asBinaryOp, asStr, asSyntax, asTemplate, asVal, Databag, exportDatabags, iterateBlocks, onlyRunForLifecycleSteps, readDatabagContainer, SugarCoatedDatabag, ImportComponentInput, importComponents } from './barbe-std/utils';
import { AWS_FARGATE_SERVICE, AWS_DYNAMODB, AWS_S3, AWS_NETWORK_URL, AWS_NETWORK } from './barbe-sls-lib/consts';
import { applyDefaults, preConfCloudResourceFactory, preConfTraversalTransform, compileBlockParam, DatabagObjVal } from './barbe-sls-lib/lib';
import { appendToTemplate, SyntaxToken, asTraversal, asFuncCall, appendToTraversal, asValArrayConst, asBlock, uniq } from './barbe-std/utils';
import { DBAndImport } from '../../anyfront/src/anyfront-lib/lib';
import { domainBlockResources } from './barbe-sls-lib/helpers';

const container = readDatabagContainer()
onlyRunForLifecycleSteps(['pre_generate', 'generate', 'post_generate'])


function awsFargateIterator(bag: Databag): DBAndImport {
    if (!bag.Value) {
        return { databags: [], imports: [] }
    }
    const [block, namePrefix] = applyDefaults(container, bag.Value!);
    const cloudResourceId = block.cloudresource_id ? asStr(block.cloudresource_id) : undefined
    const cloudResourceDir = block.cloudresource_dir ? asStr(block.cloudresource_dir) : undefined
    const cloudResource = preConfCloudResourceFactory(block, 'resource')
    const cloudData = preConfCloudResourceFactory(block, 'data')
    const traversalTransform = preConfTraversalTransform(bag)

    const dotEnvironment = compileBlockParam(block, 'environment')
    const dotAutoScaling = compileBlockParam(block, 'auto_scaling')
    const dotContainerImage = compileBlockParam(block, 'container_image')
    const dotEcrRepository = compileBlockParam(block, 'ecr_repository')
    const dotNetwork = compileBlockParam(block, 'network')
    const dotLoadBalancer = compileBlockParam(block, 'load_balancer')
    
    const cpu = block.cpu || 256
    const memory = block.memory || 512
    const regionDataName = asStr(block.region || 'current')
    const avZoneDataName = asStr(block.region || 'available')
    const useDefaultVpc = asVal(block.use_default_vpc || asSyntax(false))
    const portMapping = asValArrayConst(block.port_mapping || asSyntax([]))
    const mappedPorts: SyntaxToken[] = asVal(block.mapped_ports || asSyntax([]))
    const portsToOpen: { port: string, protocol: string }[] = uniq([
        ...portMapping
            .map((portMapping: DatabagObjVal) => ({
                port: asStr(portMapping.host_port || portMapping.container_port!),
                protocol: asStr(portMapping.protocol || 'tcp')
            })),
        ...mappedPorts.map(port => ({
            port: asStr(port),
            protocol: 'tcp'
        }))
    ], i => i.port + i.protocol)
    let executionRole: SyntaxToken
    let repositoryUrl: SyntaxToken
    let securityGroupId: SyntaxToken
    let subnetIds: SyntaxToken
    let databags: SugarCoatedDatabag[] = []
    let imports: ImportComponentInput[] = [{
        url: AWS_NETWORK_URL,
        input: [{
            Type: AWS_NETWORK,
            Name: `aws_fargate_service_${bag.Name}`,
            Value: {
                use_default_vpc: dotNetwork.use_default_vpc,
                vpc_id: dotNetwork.vpc_id,
                cidr_block: dotNetwork.cidr_block,
                make_nat_gateway: dotNetwork.make_nat_gateway,
                one_nat_gateway_per_az: dotNetwork.one_nat_gateway_per_az,
            }
        }]
    }]

    if(block.execution_role_arn) {
        executionRole = block.execution_role_arn
    } else {
        executionRole = asTraversal('data.aws_iam_role.ecs_task_execution_role.arn')
        databags.push(
            cloudData('aws_iam_role', 'ecs_task_execution_role', {
                name: 'ecsTaskExecutionRole',
            })
        )
    }
    if(block.repository_url) {
        repositoryUrl = block.repository_url
    } else {
        repositoryUrl = asTraversal(`aws_ecr_repository.aws_fargate_task_${bag.Name}_ecr_repository.repository_url}`)
        databags.push(
            cloudResource('aws_ecr_repository', `aws_fargate_task_${bag.Name}_ecr_repository`, {
                name: appendToTemplate(namePrefix, [`${bag.Name}-ecr`]),
            })
        )
        const dontExpireImages = asVal(dotEcrRepository.dont_expire_images || asSyntax(false))
        if(!dontExpireImages) {
            let policy: SyntaxToken
            if(dotEcrRepository.policy) {
                policy = dotEcrRepository.policy
            } else if (dotEcrRepository.max_untagged_count) {
                policy = asFuncCall('jsonencode', [{
                    rules: [{
                        rulePriority: 1,
                        description: 'Expire untagged images',
                        selection: {
                            tagStatus: 'untagged',
                            countType: 'imageCountMoreThan',
                            countNumber: dotEcrRepository.max_untagged_count,
                        },
                        action: {
                            type: 'expire',
                        },
                    }]
                }])
            } else {
                policy = asFuncCall('jsonencode', [{
                    rules: [{
                        rulePriority: 1,
                        description: 'Expire untagged images',
                        selection: {
                            tagStatus: 'untagged',
                            countType: 'sinceImagePushed',
                            countUnit: 'days',
                            countNumber: dotEcrRepository.expire_untagged_after_days || 30,
                        },
                        action: {
                            type: 'expire',
                        },
                    }]
                }])
            }
            databags.push(
                cloudResource('aws_ecr_lifecycle_policy', `aws_fargate_task_${bag.Name}_ecr_policy`, {
                    repository: asTraversal(`aws_ecr_repository.aws_fargate_task_${bag.Name}_ecr_repository.name`),
                    policy,
                })
            )
        }
    }

    if(block.security_group_id) {
        securityGroupId = block.security_group_id
    } else {
        securityGroupId = asTraversal(`aws_security_group.aws_fargate_task_${bag.Name}_secgr.id`)
        databags.push(
            cloudResource('aws_security_group', `aws_fargate_task_${bag.Name}_secgr`, {
                name: appendToTemplate(namePrefix, [`${bag.Name}-sg`]),
                vpc_id: asTraversal(`aws_network.aws_fargate_service_${bag.Name}.vpc.id`),
            }),
            //allow all traffic from elements in the same security group
            cloudResource('aws_security_group_rule', `aws_fargate_task_${bag.Name}_self_secgr_ingress`, {
                type: 'ingress',
                security_group_id: asTraversal(`aws_security_group.aws_fargate_task_${bag.Name}_secgr.id`),
                from_port: 0,
                to_port: 65535,
                protocol: -1,
                source_security_group_id: asTraversal(`aws_security_group.aws_fargate_task_${bag.Name}_secgr.id`),
            }),
            //allow traffic through the ports that were marked as mapped
            ...portsToOpen.map(obj => cloudResource('aws_security_group_rule', `aws_fargate_task_${bag.Name}_${obj.protocol}${obj.port}_secgr_ingress`, {
                type: 'ingress',
                security_group_id: asTraversal(`aws_security_group.aws_fargate_task_${bag.Name}_secgr.id`),
                from_port: parseInt(obj.port),
                to_port: parseInt(obj.port),
                protocol: obj.protocol,
                cidr_blocks: ['0.0.0.0/0']
            })),
            //allow all outbound traffic
            cloudResource('aws_security_group_rule', `aws_fargate_task_${bag.Name}_secgr_egress`, {
                type: 'egress',
                security_group_id: asTraversal(`aws_security_group.aws_fargate_task_${bag.Name}_secgr.id`),
                from_port: 0,
                to_port: 65535,
                protocol: -1,
                cidr_blocks: ['0.0.0.0/0']
            })
        )
    }
    if (block.auto_scaling) {
        let predefinedMetric = 'ECSServiceAverageCPUUtilization'
        if (dotAutoScaling.metric) {
            const metric = asStr(dotAutoScaling.metric)
            switch(metric) {
                case 'cpu':
                    predefinedMetric = 'ECSServiceAverageCPUUtilization'
                    break
                case 'memory':
                    predefinedMetric = 'ECSServiceAverageMemoryUtilization'
                    break
                default:
                    throw new Error(`Unknown auto scaling metric '${metric}' on aws_fargate_service.${bag.Name}.auto_scaling.metric`)
            }
        }
        databags.push(
            cloudResource('aws_appautoscaling_target', `${bag.Name}_fargate_scaling_target`, {
                max_capacity: dotAutoScaling.max || 5,
                min_capacity: dotAutoScaling.min || 1,
                resource_id: asTemplate([
                    "service/",
                    asTraversal(`aws_ecs_cluster.${bag.Name}_fargate_cluster.name`),
                    "/",
                    asTraversal(`aws_ecs_service.${bag.Name}_fargate_service.name`),
                ]),
                scalable_dimension: "ecs:service:DesiredCount",
                service_namespace: "ecs",
            }),
            cloudResource('aws_appautoscaling_policy', `${bag.Name}_fargate_scaling_policy`, {
                name: appendToTemplate(namePrefix, [`${bag.Name}-fargate-scaling-policy`]),
                policy_type: "TargetTrackingScaling",
                resource_id: asTraversal(`aws_appautoscaling_target.${bag.Name}_fargate_scaling_target.resource_id`),
                scalable_dimension: asTraversal(`aws_appautoscaling_target.${bag.Name}_fargate_scaling_target.scalable_dimension`),
                service_namespace: asTraversal(`aws_appautoscaling_target.${bag.Name}_fargate_scaling_target.service_namespace`),
                target_tracking_scaling_policy_configuration: asBlock([{
                    target_value: dotAutoScaling.target || 80,
                    scale_in_cooldown: dotAutoScaling.scale_in_cooldown || null,
                    scale_out_cooldown: dotAutoScaling.scale_out_cooldown || null,
                    predefined_metric_specification: asBlock([{
                        predefined_metric_type: predefinedMetric,
                    }]),
                }])
            }),
        )
    }

    let ecsService: any = {
        name: appendToTemplate(namePrefix, [bag.Name]),
        cluster: asTraversal(`aws_ecs_cluster.${bag.Name}_fargate_cluster.id`),
        task_definition: asTraversal(`aws_ecs_task_definition.${bag.Name}_fargate_task_def.arn`),
        desired_count: block.desired_count || 1,
        launch_type: 'FARGATE',
        enable_ecs_managed_tags: true,
        propagate_tags: 'SERVICE',
        network_configuration: asBlock([{
            subnets: (() => {
                if(block.task_accessibility) {
                    const accessibility = asStr(block.task_accessibility)
                    switch(accessibility) {
                        case 'public':
                            return asTraversal(`aws_network.aws_fargate_service_${bag.Name}.public_subnets`)
                        case 'private':
                            return asTraversal(`aws_network.aws_fargate_service_${bag.Name}.private_subnets`)
                        default:
                            throw new Error(`Unknown value '${accessibility}' on aws_fargate_service.${bag.Name}.task_accessibility, it must be either 'public' or 'private'`)
                    }
                }
                if(block.load_balancer) {
                    return asTraversal(`aws_network.aws_fargate_service_${bag.Name}.private_subnets`)
                }
                //this doesnt cover the case where the network is given as an external block `network = aws_network.my_network`
                if(block.network && dotNetwork.make_nat_gateway && asVal(dotNetwork.make_nat_gateway)) {
                    return asTraversal(`aws_network.aws_fargate_service_${bag.Name}.private_subnets`)
                }
                return asTraversal(`aws_network.aws_fargate_service_${bag.Name}.public_subnets`)
            })(),
            security_groups: [securityGroupId],
            assign_public_ip: true,
        }]),
    }
    if(asVal(block.dont_redeploy_on_apply || asSyntax(false))) {
        ecsService.force_new_deployment = false
    } else {
        ecsService.force_new_deployment = true
        ecsService.triggers = {
            redeployment: asFuncCall('timestamp', [])
        }
    }
    if(block.auto_scaling) {
        ecsService.lifecycle = asBlock([{
            ignore_changes: [asSyntax('desired_count')],
        }])
    }
    
    if(block.load_balancer) {
        const asSgProtocol = (protocol: string) => {
            switch(protocol.toLowerCase()) {
                case 'http':
                case 'https':
                    return 'tcp'
                default:
                    return protocol.toLowerCase()
            }
        }

        const asLbProtocol = (protocol: string) => {
            switch(protocol.toLowerCase()) {
                case 'http':
                case 'tcp':
                    return 'HTTP'
                case 'https':
                    return 'HTTPS'
                default:
                    return protocol.toUpperCase()
            }
        }

        const enableHttps = !!dotLoadBalancer.domain
        //access logs might be disabled with `access_logs { enabled = false }` but we still define the resources if access_logs is defined
        //because if the access logs were previously enabled, we would delete the existing logs when the user might just want it temporarily disabled
        const defineAccessLogsResources = asVal(dotLoadBalancer.enable_access_logs || asSyntax(false)) || !!dotAutoScaling.access_logs
        const dotAccessLogs = compileBlockParam(dotLoadBalancer, 'access_logs')
        const portMappingLoadBalancer: DatabagObjVal[] = asValArrayConst(dotLoadBalancer.port_mapping || asSyntax([]))
        //TODO if there is only one open port on the container, and it's an application load balancer, route 80 and 443 to it
        const portsToOpenLoadBalancer = uniq(portMappingLoadBalancer.map((portMapping, i) => {
            //TODO if target port is not open on the container, throw error
            if(!portMapping.target_port) {
                throw new Error(`'target_port' is required for aws_fargate_service.${bag.Name}.load_balancer.port_mapping[${i}]`)
            }
            if(!portMapping.load_balancer_port) {
                throw new Error(`'load_balancer_port' is required for aws_fargate_service.${bag.Name}.load_balancer.port_mapping[${i}]`)
            }
            const targetPort = asStr(portMapping.target_port)
            if(!portsToOpen.find((m) => m.port === targetPort)) {
                throw new Error(`'target_port' ${targetPort} is not open on the container but used in aws_fargate_service.${bag.Name}.load_balancer.port_mapping[${i}], add it to aws_fargate_service.${bag.Name}.mapped_ports or aws_fargate_service.${bag.Name}.port_mapping, or remove it from aws_fargate_service.${bag.Name}.load_balancer.port_mapping[${i}]`)
            }
            return {
                target_port: targetPort,
                load_balancer_port: asStr(portMapping.load_balancer_port),
                protocol: asStr(portMapping.protocol || 'HTTP').toUpperCase(),
            }
        }), x => `${x.target_port}-${x.load_balancer_port}-${x.protocol}`)

        const loadBalancerType = asStr(dotLoadBalancer.type || 'application')
        const internal = asVal(dotLoadBalancer.internal || asSyntax(false))
        databags.push(
            cloudResource('aws_security_group', `aws_fargate_task_${bag.Name}_lb_secgr`, {
                name: appendToTemplate(namePrefix, [`${bag.Name}-sg`]),
                vpc_id: asTraversal(`aws_network.aws_fargate_service_${bag.Name}.vpc.id`),
            }),
            //allow all traffic from elements in the same security group
            cloudResource('aws_security_group_rule', `aws_fargate_task_${bag.Name}_lb_self_secgr_ingress`, {
                type: 'ingress',
                security_group_id: asTraversal(`aws_security_group.aws_fargate_task_${bag.Name}_lb_secgr.id`),
                from_port: 0,
                to_port: 65535,
                protocol: -1,
                source_security_group_id: asTraversal(`aws_security_group.aws_fargate_task_${bag.Name}_lb_secgr.id`),
            }),
            //allow all outbound traffic
            cloudResource('aws_security_group_rule', `aws_fargate_task_${bag.Name}_lb_secgr_egress`, {
                type: 'egress',
                security_group_id: asTraversal(`aws_security_group.aws_fargate_task_${bag.Name}_lb_secgr.id`),
                from_port: 0,
                to_port: 65535,
                protocol: -1,
                cidr_blocks: ['0.0.0.0/0']
            }),
            //allow all ports in load_balancer.port_mapping, this might define duplicates with network mode ingress rule but i think it's ok
            ...portsToOpenLoadBalancer.map(obj => cloudResource('aws_security_group_rule', `aws_fargate_task_${bag.Name}_${obj.protocol}${obj.load_balancer_port}_lb_secgr_ingress`, {
                type: 'ingress',
                security_group_id: asTraversal(`aws_security_group.aws_fargate_task_${bag.Name}_lb_secgr.id`),
                from_port: parseInt(obj.load_balancer_port),
                to_port: parseInt(obj.load_balancer_port),
                protocol: asSgProtocol(obj.protocol),
                cidr_blocks: ['0.0.0.0/0']
            })),
            ...portsToOpenLoadBalancer.flatMap(obj => [
                cloudResource('aws_lb_listener', `aws_fargate_task_${bag.Name}_${obj.protocol}${obj.load_balancer_port}_lb_listener`, {
                    load_balancer_arn: asTraversal(`aws_lb.${bag.Name}_fargate_lb.arn`),
                    port: obj.load_balancer_port,
                    protocol: asLbProtocol(obj.protocol),
                    default_action: asBlock([{
                        type: 'forward',
                        target_group_arn: asTraversal(`aws_lb_target_group.aws_fargate_task_${bag.Name}_${obj.protocol}${obj.load_balancer_port}_lb_listener_target.arn`)
                    }])
                }),
                cloudResource('aws_lb_target_group', `aws_fargate_task_${bag.Name}_${obj.protocol}${obj.load_balancer_port}_lb_listener_target`, {
                    name: appendToTemplate(namePrefix, [`${bag.Name}-${obj.protocol}${obj.load_balancer_port}-lb-tg`]),
                    port: obj.target_port,
                    protocol: asLbProtocol(obj.protocol),
                    vpc_id: asTraversal(`aws_network.aws_fargate_service_${bag.Name}.vpc.id`),
                    target_type: 'ip',
                })
            ])
        )
        
        if (loadBalancerType === 'application') {
            databags.push(
                cloudResource('aws_security_group_rule', `aws_fargate_task_${bag.Name}_http_lb_secgr_ingress`, {
                    type: 'ingress',
                    security_group_id: asTraversal(`aws_security_group.aws_fargate_task_${bag.Name}_lb_secgr.id`),
                    from_port: 80,
                    to_port: 80,
                    protocol: 'tcp',
                    cidr_blocks: ['0.0.0.0/0']
                })
            )
            if(enableHttps) {
                databags.push(
                    cloudResource('aws_security_group_rule', `aws_fargate_task_${bag.Name}_https_lb_secgr_ingress`, {
                        type: 'ingress',
                        security_group_id: asTraversal(`aws_security_group.aws_fargate_task_${bag.Name}_lb_secgr.id`),
                        from_port: 443,
                        to_port: 443,
                        protocol: 'tcp',
                        cidr_blocks: ['0.0.0.0/0']
                    })
                )
            }
            if(portsToOpen.length === 1) {
                //map 80 and 443 on load balancer to the only opened port on container
                databags.push(
                    cloudResource('aws_lb_listener', `aws_fargate_task_${bag.Name}_lonely_http_lb_listener`, {
                        load_balancer_arn: asTraversal(`aws_lb.${bag.Name}_fargate_lb.arn`),
                        port: 80,
                        protocol: 'HTTP',
                        default_action: asBlock([{
                            type: 'forward',
                            target_group_arn: asTraversal(`aws_lb_target_group.aws_fargate_task_${bag.Name}_lonely_http_lb_listener_target.arn`)
                        }])
                    }),
                    cloudResource('aws_lb_target_group', `aws_fargate_task_${bag.Name}_lonely_http_lb_listener_target`, {
                        name: appendToTemplate(namePrefix, [`${bag.Name}-lhttp-lb-tg`]),
                        port: portsToOpen[0].port,
                        protocol: asLbProtocol(portsToOpen[0].protocol),
                        vpc_id: asTraversal(`aws_network.aws_fargate_service_${bag.Name}.vpc.id`),
                        target_type: 'ip',
                    })
                )
            } else if(portsToOpen.some(obj => obj.port === '80' || obj.port === '443')) {
                //map 80 and 443 on load balancer to opened ports on container that are 80 and 443
                const eightyIsOpen = portsToOpen.some(obj => obj.port === '80')
                const fourFourThreeIsOpen = portsToOpen.some(obj => obj.port === '443')
                if(eightyIsOpen) {
                    databags.push(
                        cloudResource('aws_lb_listener', `aws_fargate_task_${bag.Name}_http_lb_listener`, {
                            load_balancer_arn: asTraversal(`aws_lb.${bag.Name}_fargate_lb.arn`),
                            port: 80,
                            protocol: 'HTTP',
                            default_action: asBlock([{
                                type: 'forward',
                                target_group_arn: asTraversal(`aws_lb_target_group.aws_fargate_task_${bag.Name}_http_lb_listener_target.arn`)
                            }])
                        }),
                        cloudResource('aws_lb_target_group', `aws_fargate_task_${bag.Name}_http_lb_listener_target`, {
                            name: appendToTemplate(namePrefix, [`${bag.Name}-http-lb-tg`]),
                            port: 80,
                            protocol: 'HTTP',
                            vpc_id: asTraversal(`aws_network.aws_fargate_service_${bag.Name}.vpc.id`),
                            target_type: 'ip',
                        })
                    )
                }
                if(fourFourThreeIsOpen) {
                    // we map either 80 or 443 on the load balancer to 443 on the container
                    // because if https is not enabled on the load balancer then we dont want to map 443 on the load balancer to 443 on the container
                    if(enableHttps) {
                        const dotDomain = compileBlockParam(dotLoadBalancer, 'domain')
                        const { certArn, databags: domainResources } = domainBlockResources(dotDomain, asTraversal(`aws_lb.${bag.Name}_fargate_lb.dns_name`), `aws_fargate_task_${bag.Name}`, cloudData, cloudResource)
                        databags.push(
                            ...domainResources,
                            cloudResource('aws_lb_listener', `aws_fargate_task_${bag.Name}_https_lb_listener`, {
                                load_balancer_arn: asTraversal(`aws_lb.${bag.Name}_fargate_lb.arn`),
                                port: 443,
                                protocol: 'HTTPS',
                                certificate_arn: certArn,
                                default_action: asBlock([{
                                    type: 'forward',
                                    target_group_arn: asTraversal(`aws_lb_target_group.aws_fargate_task_${bag.Name}_https_lb_listener_target.arn`)
                                }])
                            }),
                        )
                    } else if(!eightyIsOpen) {
                        databags.push(
                            cloudResource('aws_lb_listener', `aws_fargate_task_${bag.Name}_http_lb_listener`, {
                                load_balancer_arn: asTraversal(`aws_lb.${bag.Name}_fargate_lb.arn`),
                                port: 80,
                                protocol: 'HTTP',
                                default_action: asBlock([{
                                    type: 'forward',
                                    target_group_arn: asTraversal(`aws_lb_target_group.aws_fargate_task_${bag.Name}_https_lb_listener_target.arn`)
                                }])
                            })
                        )
                    }
                    databags.push(
                        cloudResource('aws_lb_target_group', `aws_fargate_task_${bag.Name}_https_lb_listener_target`, {
                            name: appendToTemplate(namePrefix, [`${bag.Name}-https-lb-tg`]),
                            port: 443,
                            protocol: 'HTTPS',
                            vpc_id: asTraversal(`aws_network.aws_fargate_service_${bag.Name}.vpc.id`),
                            target_type: 'ip',
                        })
                    )
                }
            } else {
                // some other ports are open on the container, we're not implcitly mapping 80 and 443 to them
                // to do that the user will need to use the port_mapping block
            }
        }
        if(loadBalancerType === 'network') {
            databags.push(
                ...portsToOpen.map(obj => cloudResource('aws_security_group_rule', `aws_fargate_task_${bag.Name}_${obj.protocol}${obj.port}_lb_secgr_ingress`, {
                    type: 'ingress',
                    security_group_id: asTraversal(`aws_security_group.aws_fargate_task_${bag.Name}_lb_secgr.id`),
                    from_port: parseInt(obj.port),
                    to_port: parseInt(obj.port),
                    protocol: obj.protocol,
                    cidr_blocks: ['0.0.0.0/0']
                }))
            )
            //if no port_mapping are explicitly defined, we map all ports to the same port on the container (because we are a network load balancer only)
            if(!dotLoadBalancer.port_mapping) {
                databags.push(
                    ...portsToOpen.flatMap(obj => [
                        cloudResource('aws_lb_listener', `aws_fargate_task_${bag.Name}_net_${obj.port}_lb_listener`, {
                            load_balancer_arn: asTraversal(`aws_lb.${bag.Name}_fargate_lb.arn`),
                            port: obj.port,
                            //listeners attaches to network load balancers must be TCP
                            protocol: 'TCP',
                            default_action: asBlock([{
                                type: 'forward',
                                target_group_arn: asTraversal(`aws_lb_target_group.aws_fargate_task_${bag.Name}_net_${obj.port}_lb_listener_target.arn`)
                            }])
                        }),
                        cloudResource('aws_lb_target_group', `aws_fargate_task_${bag.Name}_net_${obj.port}_lb_listener_target`, {
                            name: appendToTemplate(namePrefix, [`${bag.Name}-net${obj.port}-lb-tg`]),
                            port: obj.port,
                            protocol: 'TCP',
                            vpc_id: asTraversal(`aws_network.aws_fargate_service_${bag.Name}.vpc.id`),
                            target_type: 'ip',
                        })
                    ])
                )
            }
        }
        if(defineAccessLogsResources && !dotAccessLogs.bucket) {
            databags.push(
                cloudResource('aws_s3_bucket', `aws_fargate_task_${bag.Name}_lb_access_logs_bucket`, {
                    bucket: appendToTemplate(namePrefix, [`${bag.Name}-lb-access-logs`]),
                    force_destroy: true,
                })
            )
        }

        databags.push(
            cloudResource('aws_lb', `${bag.Name}_fargate_lb`, {
                name: appendToTemplate(namePrefix, [`${bag.Name}-lb`]),
                internal,
                load_balancer_type: loadBalancerType,
                subnets: 'TODO',
                security_groups: [
                    asTraversal(`aws_security_group.aws_fargate_task_${bag.Name}_lb_secgr.id`)
                ],
                access_logs: defineAccessLogsResources ? asBlock([{
                    enabled: dotAccessLogs.enabled || true,
                    bucket: dotAccessLogs.bucket ? dotAccessLogs.bucket : asTraversal(`aws_s3_bucket.aws_fargate_task_${bag.Name}_lb_access_logs_bucket.id`),
                    prefix: dotAccessLogs.prefix || appendToTemplate(namePrefix, [`${bag.Name}-lb-access-logs`]),
                }]) : null,
                customer_owned_ipv4_pool: dotLoadBalancer.customer_owned_ipv4_pool,
                desync_mitigation_mode: dotLoadBalancer.desync_mitigation_mode,
                drop_invalid_header_fields: dotLoadBalancer.drop_invalid_header_fields,
                enable_cross_zone_load_balancing: dotLoadBalancer.enable_cross_zone_load_balancing,
                enable_deletion_protection: dotLoadBalancer.enable_deletion_protection,
                enable_http2: dotLoadBalancer.enable_http2,
                enable_waf_fail_open: dotLoadBalancer.enable_waf_fail_open,
                idle_timeout: dotLoadBalancer.idle_timeout,
                ip_address_type: dotLoadBalancer.ip_address_type,
                preserve_host_header: dotLoadBalancer.preserve_host_header,
            }),
        )
    }

    databags.push(
        cloudResource('aws_ecs_cluster', `${bag.Name}_fargate_cluster`, {
            name: appendToTemplate(namePrefix, [`${bag.Name}-cluster`]),
        }),
        cloudResource('aws_ecs_service', `${bag.Name}_fargate_service`, ecsService),
        cloudResource('aws_cloudwatch_log_group', `${bag.Name}_fargate_task_logs`, {
            name: appendToTemplate(asSyntax('/ecs/'), [namePrefix, bag.Name]),
            retention_in_days: block.logs_retention_days || 30,
        }),
        cloudResource('aws_ecs_task_definition', `${bag.Name}_fargate_task_def`, {
            family: appendToTemplate(namePrefix, [bag.Name]),
            cpu,
            memory,
            network_mode: 'awsvpc',
            requires_compatibilities: ['FARGATE'],
            execution_role_arn: executionRole,
            task_role_arn: block.role || asTraversal('aws_iam_role.default_lambda_role.arn'),
            container_definitions: asFuncCall(
                'jsonencode',
                //that's an array of arrays cause we're json marshalling a list of objects
                [[
                    {
                        name: appendToTemplate(namePrefix, [bag.Name]),
                        image: repositoryUrl,
                        cpu,
                        memory,
                        environment: Object.entries(dotEnvironment).map(([name, value]) => ({ name, value })),
                        logConfiguration: {
                            logDriver: 'awslogs',
                            options: {
                                'awslogs-group': asTraversal(`aws_cloudwatch_log_group.${bag.Name}_fargate_task_logs.name`),
                                'awslogs-region': asTraversal(`data.aws_region.${regionDataName}.name`),
                                'awslogs-stream-prefix': appendToTemplate(namePrefix, [bag.Name]),
                            },
                        },
                        portMappings: [
                            ...portMapping.map((portMapping: DatabagObjVal) => ({
                                containerPort: portMapping.container_port,
                                hostPort: portMapping.host_port || portMapping.container_port,
                                protocol: portMapping.protocol || 'tcp',
                            })),
                            ...mappedPorts.map((port: SyntaxToken) => ({
                                containerPort: port,
                                hostPort: port,
                                protocol: 'tcp',
                            }))
                        ]
                    }
                ]]
            )
        }),
    )
    return { databags, imports }
}


const g = iterateBlocks(container, AWS_FARGATE_SERVICE, awsFargateIterator).flat()
exportDatabags(g.map(x => x.databags).flat())
exportDatabags(importComponents(container, g.map(x => x.imports).flat()))
