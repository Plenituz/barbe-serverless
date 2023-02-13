import {
    asStr,
    asSyntax,
    asTemplate,
    asVal,
    Databag, exportDatabags,
    iterateBlocks,
    onlyRunForLifecycleSteps,
    readDatabagContainer,
    SugarCoatedDatabag
} from "./barbe-std/utils";
import { AWS_FARGATE_SERVICE, AWS_DYNAMODB, AWS_S3 } from './barbe-sls-lib/consts';
import { applyDefaults, preConfCloudResourceFactory, preConfTraversalTransform, compileBlockParam, DatabagObjVal } from './barbe-sls-lib/lib';
import { appendToTemplate, SyntaxToken, asTraversal, asFuncCall, appendToTraversal, asValArrayConst, asBlock, uniq } from './barbe-std/utils';

const container = readDatabagContainer()
onlyRunForLifecycleSteps(['pre_generate', 'generate', 'post_generate'])


function awsFargateIterator(bag: Databag): (Databag | SugarCoatedDatabag)[] {
    if (!bag.Value) {
        return []
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
    const dotVpc = compileBlockParam(block, 'ecr_repository')
    const dotLoadBalancer = compileBlockParam(block, 'load_balancer')
    const dotSubnets: DatabagObjVal[] = asValArrayConst(block.subnets || asSyntax([{/*this makes a default subnet if none defined*/}]))
    
    const cpu = block.cpu || 256
    const memory = block.memory || 512
    const regionDataName = asStr(block.region || 'current')
    const avZoneDataName = asStr(block.region || 'available')
    const useDefaultVpc = asVal(block.use_default_vpc || asSyntax(false))
    const portMapping = asValArrayConst(block.port_mapping || asSyntax([]))
    const mappedPorts: SyntaxToken[] = asVal(block.mapped_ports || asSyntax([]))
    let executionRole: SyntaxToken
    let repositoryUrl: SyntaxToken
    let securityGroupId: SyntaxToken
    let vpcRef: SyntaxToken
    let subnetIds: SyntaxToken

    const makeSubnets = (dotSubnet: DatabagObjVal, nameSuffix: string, index: number, cidrOffset: number): SugarCoatedDatabag[] => {
        const makeNatGateway = asVal(dotSubnet.make_nat_gateway || asSyntax(false))
        const kind = asStr(dotSubnet.kind || 'public') as 'public' | 'private'
        let localDatabags: SugarCoatedDatabag[] = [
            cloudResource('aws_subnet', `aws_fargate_task_${bag.Name}_subnet_${index}${nameSuffix}`, {
                vpc_id: appendToTraversal(vpcRef, 'id'),
                availability_zone: asTraversal(`data.aws_availability_zones.${avZoneDataName}.names[0]`),
                cidr_block: dotSubnet.cidr_block || asFuncCall('cidrsubnet', [
                    appendToTraversal(vpcRef, 'cidr_block'),
                    4,
                    index+cidrOffset+1,
                ])
            }),
            cloudResource('aws_route_table', `aws_fargate_task_${bag.Name}_subnet_${index}_route_table${nameSuffix}`, {
                vpc_id: appendToTraversal(vpcRef, 'id'),
                route: asBlock([{
                    cidr_block: '0.0.0.0/0',
                    gateway_id: kind === 'public' ? asTraversal(`aws_internet_gateway.aws_fargate_task_${bag.Name}_subnet_${index}_igw${nameSuffix}.id`) : null,
                    nat_gateway_id: kind === 'private' && makeNatGateway ? asTraversal(`aws_nat_gateway.aws_fargate_task_${bag.Name}_subnet_${index}_nat_gateway${nameSuffix}.id`) : null,
                }]),
                tags: {
                    Name: dotSubnet.name ? appendToTemplate(namePrefix, [dotSubnet.name, '-rt']) : appendToTemplate(namePrefix, [`${bag.Name}-subnet-${index}-rt${nameSuffix}`]),
                }
            }),
            cloudResource('aws_route_table_association', `aws_fargate_task_${bag.Name}_subnet_${index}_route_table_association${nameSuffix}`, {
                subnet_id: asTraversal(`aws_subnet.aws_fargate_task_${bag.Name}_subnet_${index}${nameSuffix}.id`),
                route_table_id: asTraversal(`aws_route_table.aws_fargate_task_${bag.Name}_subnet_${index}_route_table${nameSuffix}.id`),
            })
        ]
        if(kind === 'private' && makeNatGateway) {
            localDatabags.push(
                cloudResource('aws_eip', `aws_fargate_task_${bag.Name}_subnet_${index}_nat_eip${nameSuffix}`, {
                    vpc: true,
                }),
                cloudResource('aws_nat_gateway', `aws_fargate_task_${bag.Name}_subnet_${index}_nat_gateway${nameSuffix}`, {
                    allocation_id: asTraversal(`aws_eip.aws_fargate_task_${bag.Name}_subnet_${index}_nat_eip${nameSuffix}.id`),
                    subnet_id: asTraversal(`aws_subnet.aws_fargate_task_${bag.Name}_subnet_${index}${nameSuffix}.id`),
                    tags: {
                        Name: dotSubnet.name ? appendToTemplate(namePrefix, [dotSubnet.name, '-nat']) : appendToTemplate(namePrefix, [`${bag.Name}-subnet-${index}-nat${nameSuffix}`]),
                    }
                })
            )
        }
        if(kind === 'public') {
            localDatabags.push(
                cloudResource('aws_internet_gateway', `aws_fargate_task_${bag.Name}_subnet_${index}_igw${nameSuffix}`, {
                    vpc_id: appendToTraversal(vpcRef, 'id'),
                    tags: {
                        Name: dotSubnet.name ? appendToTemplate(namePrefix, [dotSubnet.name, '-igw']) : appendToTemplate(namePrefix, [`${bag.Name}-subnet-${index}-igw${nameSuffix}`]),
                    }
                })
            )
        }
        return localDatabags
    }

    let databags: SugarCoatedDatabag[] = []

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
    if(useDefaultVpc) {
        vpcRef = asTraversal('data.aws_vpc.default.id')
        databags.push(
            cloudData('aws_vpc', 'default', {
                default: true,
            })
        )
    } else if(block.vpc_id) {
        vpcRef = asTraversal(`data.aws_vpc.aws_fargate_task_${bag.Name}_imported_vpc`)
        databags.push(
            cloudData('aws_vpc', `aws_fargate_task_${bag.Name}_imported_vpc`, {
                id: block.vpc_id,
            })
        )
    } else {
        vpcRef = asTraversal(`aws_vpc.aws_fargate_task_${bag.Name}_vpc`)
        databags.push(
            cloudResource('aws_vpc', `aws_fargate_task_${bag.Name}_vpc`, {
                tags: {
                    Name: dotVpc.name || appendToTemplate(namePrefix, [`${bag.Name}-vpc`]),
                },
                cidr_block: dotVpc.cidr_block || '10.0.0.0/16',
                enable_dns_hostnames: true,
            })
        )
    }
    if(block.security_group_id) {
        securityGroupId = block.security_group_id
    } else {
        securityGroupId = asTraversal(`aws_security_group.aws_fargate_task_${bag.Name}_secgr.id`)
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
        
        
        databags.push(
            cloudResource('aws_security_group', `aws_fargate_task_${bag.Name}_secgr`, {
                name: appendToTemplate(namePrefix, [`${bag.Name}-sg`]),
                vpc_id: appendToTraversal(vpcRef, 'id')
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
    if(block.subnet_ids) {
        subnetIds = block.subnet_ids
    } else {
        subnetIds = asSyntax(dotSubnets.map((_, i) => asTraversal(`aws_subnet.aws_fargate_task_${bag.Name}_subnet_${i}.id`)))
        databags.push(
            ...dotSubnets.flatMap((dotSubnet, i) => makeSubnets(dotSubnet, '', i, 0))
        )
    }
    if (block.auto_scaling) {
        /*
        resource "aws_appautoscaling_target" "ecs_target" {
            max_capacity       = 4
            min_capacity       = 1
            resource_id        = "service/${aws_ecs_cluster.example.name}/${aws_ecs_service.example.name}"
            scalable_dimension = "ecs:service:DesiredCount"
            service_namespace  = "ecs"
        }
        */
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
    if(container[AWS_DYNAMODB] && !block.vpc_id && !useDefaultVpc && !block.subnet_ids) {
        asTraversal(`data.aws_availability_zones.${avZoneDataName}.names[0]`)
        databags.push(
            cloudResource('aws_vpc_endpoint', `${bag.Name}_fargate_ddb_vpc_endpoint`, {
                vpc_id: appendToTraversal(vpcRef, 'id'),
                service_name: asTemplate([
                    'com.amazonaws.',
                    asTraversal(`data.aws_region.${regionDataName}.name`),
                    '.dynamodb'
                ]),
                route_table_ids: dotSubnets.map((_, i) => `aws_route_table.aws_fargate_task_${bag.Name}_subnet_${i}_route_table.id`),
            })
        )
    }
    if(container[AWS_S3] && !block.vpc_id && !useDefaultVpc && !block.subnet_ids) {
        databags.push(
            cloudResource('aws_vpc_endpoint', `${bag.Name}_fargate_s3_vpc_endpoint`, {
                vpc_id: appendToTraversal(vpcRef, 'id'),
                service_name: asTemplate([
                    'com.amazonaws.',
                    asTraversal(`data.aws_region.${regionDataName}.name`),
                    '.s3'
                ]),
                route_table_ids: dotSubnets.map((_, i) => `aws_route_table.aws_fargate_task_${bag.Name}_subnet_${i}_route_table.id`),
            })
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
            subnets: subnetIds,
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
        //TODO add to ecsService
        //TODO subnets for lb

        //https://github.com/strvcom/terraform-aws-fargate/blob/master/main.tf
        const loadBalancerType = asStr(dotLoadBalancer.type || 'application')
        const internal = asVal(dotLoadBalancer.internal || asSyntax(false))
        databags.push(
            cloudResource('aws_security_group', `aws_fargate_task_${bag.Name}_lb_secgr`, {
                name: appendToTemplate(namePrefix, [`${bag.Name}-sg`]),
                vpc_id: appendToTraversal(vpcRef, 'id')
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
            })
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
                }),
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
        if(dotLoadBalancer.open_port) {
            const portsToOpen: DatabagObjVal[] = asValArrayConst(dotLoadBalancer.open_port)
            databags.push(
                ...portsToOpen.map((openPort, i) => {
                    if((!openPort.port && !openPort.from_port) || (!openPort.port && !openPort.to_port)) {
                        throw new Error(`aws_fargate_service.${bag.Name}.load_balacner.open_port[${i}] must have either port or from_port and to_port`)
                    }
                    const protocol = asStr(openPort.protocol || 'tcp')
                    const fromPort = asVal(openPort.from_port || openPort.port!)
                    const toPort = asVal(openPort.to_port || openPort.port!)
                    return cloudResource('aws_security_group_rule', `aws_fargate_task_${bag.Name}_${protocol}${fromPort}-${toPort}_lb_secgr_ingress`, {
                        type: 'ingress',
                        security_group_id: asTraversal(`aws_security_group.aws_fargate_task_${bag.Name}_lb_secgr.id`),
                        from_port: fromPort,
                        to_port: toPort,
                        protocol: protocol,
                        cidr_blocks: ['0.0.0.0/0']
                    })
                }),
            )
        }

        databags.push(
            cloudResource('aws_lb', `${bag.Name}_fargate_lb`, {
                name: appendToTemplate(namePrefix, [`${bag.Name}-lb`]),
                internal,
                load_balancer_type: loadBalancerType,
                subnets: subnetIds,
                security_groups: loadBalancerType === 'application' ? [securityGroupId] : null,
            }),
        )

    }

    databags.push(
        cloudResource('aws_ecs_cluster', `${bag.Name}_fargate_cluster`, {
            name: appendToTemplate(namePrefix, [`${bag.Name}-cluster`]),
        }),
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
        cloudResource('aws_ecs_service', `${bag.Name}_fargate_service`, ecsService)
    )

    return []
}


exportDatabags(iterateBlocks(container, AWS_FARGATE_SERVICE, awsFargateIterator).flat())
