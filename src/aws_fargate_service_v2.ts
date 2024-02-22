import {
    asStr,
    asSyntax,
    asTemplate,
    asVal,
    Databag,
    exportDatabags,
    iterateBlocks,
    readDatabagContainer,
    SugarCoatedDatabag,
    throwStatement,
    asTraversal,
    allGenerateSteps
} from './barbe-std/utils';
import {
    AWS_FARGATE_SERVICE,
    AWS_NETWORK_URL,
    AWS_NETWORK,
    AWS_ECR_REPOSITORY_WITH_IMAGE,
    AWS_ECR_REPOSITORY_WITH_IMAGE_URL
} from './barbe-sls-lib/consts';
import { applyDefaults, preConfCloudResourceFactory, preConfTraversalTransform, compileBlockParam, DatabagObjVal, getAwsCreds } from './barbe-sls-lib/lib';
import { appendToTemplate, SyntaxToken, asFuncCall, asValArrayConst, asBlock, uniq } from './barbe-std/utils';
import { awsDomainBlockResources } from './barbe-sls-lib/helpers';
import {Pipeline, executePipelineGroup, pipeline} from '../../anyfront/src/anyfront-lib/pipeline';

const container = readDatabagContainer()


function awsFargateServiceIterator(bag: Databag): Pipeline {
    if (!bag.Value) {
        return pipeline([])
    }
    let pipe = pipeline([])
    const [block, namePrefix] = applyDefaults(container, bag.Value!);
    const dotNetwork = compileBlockParam(block, 'network')
    const dotEcrRepository = compileBlockParam(block, 'ecr_repository')

    pipe.pushWithParams({ name: 'resources', lifecycleSteps: allGenerateSteps }, () => {
        return {
            databags: awsFargateServiceResources(bag),
            imports: [
                {
                    url: AWS_NETWORK_URL,
                    //copy over the fargate_service block just to notify the aws_network to create the right vpc endpoints
                    //we could also just add vpc_endpoints manually but just in case it changes in the future we let the aws_network handle it
                    copyFromContainer: [AWS_FARGATE_SERVICE],
                    input: [{
                        Type: AWS_NETWORK,
                        Name: `aws_fargate_service_${bag.Name}`,
                        Value: {
                            use_default_vpc: dotNetwork.use_default_vpc,
                            vpc_id: dotNetwork.vpc_id,
                            cidr_block: dotNetwork.cidr_block,
                            make_nat_gateway: dotNetwork.make_nat_gateway,
                            one_nat_gateway_per_az: dotNetwork.one_nat_gateway_per_az,
                            name_prefix: [namePrefix],
                        }
                    }]
                },
                {
                    url: AWS_ECR_REPOSITORY_WITH_IMAGE_URL,
                    copyFromContainer: ['cr_[terraform]', 'state_store'],
                    input: [{
                        Type: AWS_ECR_REPOSITORY_WITH_IMAGE,
                        Name: `${bag.Name}-ecr`,
                        Value: {
                            region: block.region,
                            image: block.image,
                            copy_image: block.copy_image,
                            container_image: block.container_image,
                            repository_url: block.repository_url,
                            policy: dotEcrRepository.policy,
                            max_untagged_count: dotEcrRepository.max_untagged_count,
                            dont_expire_images: dotEcrRepository.dont_expire_images,
                            expire_untagged_after_days: dotEcrRepository.expire_untagged_after_days,
                            skip_build: block.skip_build,
                            name_prefix: [namePrefix],
                        }
                    }]
                }
            ]
        }
    })
    //export the generated resources from the imports
    pipe.pushWithParams({ name: 'export_generate', lifecycleSteps: allGenerateSteps }, input => exportDatabags(input.previousStepResult))
    pipe.pushWithParams({name: 'ecr_pre_do', lifecycleSteps: ['pre_do']}, (input) => {
        return {
            imports: [
                {
                    url: AWS_ECR_REPOSITORY_WITH_IMAGE_URL,
                    copyFromContainer: ['cr_[terraform]', 'state_store'],
                    input: [{
                        Type: AWS_ECR_REPOSITORY_WITH_IMAGE,
                        Name: `${bag.Name}-ecr`,
                        Value: {
                            region: block.region,
                            image: block.image,
                            copy_image: block.copy_image,
                            container_image: block.container_image,
                            repository_url: block.repository_url,
                            policy: dotEcrRepository.policy,
                            max_untagged_count: dotEcrRepository.max_untagged_count,
                            dont_expire_images: dotEcrRepository.dont_expire_images,
                            expire_untagged_after_days: dotEcrRepository.expire_untagged_after_days,
                            skip_build: block.skip_build,
                            name_prefix: [namePrefix],
                        }
                    }]
                }
            ]
        }
    })
    pipe.pushWithParams({ name: 'export_pre_do', lifecycleSteps: ['pre_do'] }, input => exportDatabags(input.previousStepResult))
    pipe.pushWithParams({name: 'trigger_deploy', lifecycleSteps: ['post_apply']}, (input) => {
        if(!asVal(block.dont_redeploy_on_apply || asSyntax(false))) {
            const tfOutput = asValArrayConst(container.terraform_execute_output?.default_apply[0].Value!)
            const clusterName = asStr(tfOutput.find(pair => asStr(pair.key) === `aws_fargate_service_${bag.Name}_cluster`).value)
            const serviceName = asStr(tfOutput.find(pair => asStr(pair.key) === `aws_fargate_service_${bag.Name}_service`).value)
            const awsCreds = getAwsCreds()
            if (!awsCreds) {
                throwStatement(`aws_fargate_service.${bag.Name} needs AWS credentials to build the image`)
            }
            // we do this manually here instead of relying on TF or ECS to do it because otherwise the image build might be longer than the redeployment and then be ignored until the next deployment
            const transforms = [{
                Type: 'buildkit_run_in_container',
                Name: `aws_fargate_service_${bag.Name}_redeploy`,
                Value: {
                    no_cache: true,
                    display_name: `Trigger deployment - aws_fargate_service.${bag.Name}`,
                    dockerfile: `
                        FROM amazon/aws-cli:latest
    
                        ENV AWS_ACCESS_KEY_ID="${awsCreds.access_key_id}"
                        ENV AWS_SECRET_ACCESS_KEY="${awsCreds.secret_access_key}"
                        ENV AWS_SESSION_TOKEN="${awsCreds.session_token}"
                        ENV AWS_REGION="${asStr(block.region || os.getenv("AWS_REGION") || 'us-east-1')}"
                        ENV AWS_PAGER=""
    
                        RUN aws ecs update-service --service ${serviceName} --cluster ${clusterName} --force-new-deployment`
                }
            }]
            return {transforms}
        }
    })

    pipe.pushWithParams({name: 'ecr_destroy', lifecycleSteps: ['destroy']}, (input) => {
        return {
            imports: [
                {
                    url: AWS_ECR_REPOSITORY_WITH_IMAGE_URL,
                    copyFromContainer: ['cr_[terraform]', 'state_store'],
                    input: [{
                        Type: AWS_ECR_REPOSITORY_WITH_IMAGE,
                        Name: `${bag.Name}-ecr`,
                        Value: {
                            region: block.region,
                            image: block.image,
                            copy_image: block.copy_image,
                            container_image: block.container_image,
                            repository_url: block.repository_url,
                            policy: dotEcrRepository.policy,
                            max_untagged_count: dotEcrRepository.max_untagged_count,
                            dont_expire_images: dotEcrRepository.dont_expire_images,
                            expire_untagged_after_days: dotEcrRepository.expire_untagged_after_days,
                            skip_build: block.skip_build,
                            name_prefix: [namePrefix],
                        }
                    }]
                }
            ]
        }
    })
    pipe.pushWithParams({ name: 'export_destroy', lifecycleSteps: ['destroy'] }, input => exportDatabags(input.previousStepResult))

    return pipe
}

function awsFargateServiceResources(bag: Databag): Databag[] {
    if (!bag.Value) {
        return []
    }
    const [block, namePrefix] = applyDefaults(container, bag.Value!);
    const cloudResource = preConfCloudResourceFactory(block, 'resource')
    const cloudData = preConfCloudResourceFactory(block, 'data')
    const cloudOutput = preConfCloudResourceFactory(block, 'output')
    const traversalTransform = preConfTraversalTransform(bag)

    const dotEnvironment = compileBlockParam(block, 'environment')
    const dotAutoScaling = compileBlockParam(block, 'auto_scaling')
    const dotContainerImage = compileBlockParam(block, 'container_image')
    const dotNetwork = compileBlockParam(block, 'network')
    const dotLoadBalancer = compileBlockParam(block, 'load_balancer')
    
    const cpu = block.cpu || 256
    const memory = block.memory || 512
    const regionDataName = asStr(block.region || 'current')
    const portMapping = asValArrayConst(block.port_mapping || asSyntax([]))
    const mappedPorts: SyntaxToken[] = asVal(block.mapped_ports || asSyntax([]))
    const hasProvidedImage = !!(block.image || dotContainerImage.image)
    const shouldCopyProvidedImage = asVal(block.copy_image || dotContainerImage.copy_image || asSyntax(true))
    const taskAccessibility = block.task_accessibility ? asStr(block.task_accessibility) : null
    const containerName = appendToTemplate(namePrefix, [`${bag.Name}-fs-task-def`])
    const enableHttps = !!dotLoadBalancer.domain
    const portsToOpen: { port: string, protocol: string }[] = uniq([
        ...portMapping.map((portMapping: DatabagObjVal) => ({
                port: asStr(portMapping.host_port || portMapping.container_port!),
                protocol: asStr(portMapping.protocol || 'tcp')
            })),
        ...mappedPorts.map(port => ({
            port: asStr(port),
            protocol: 'tcp'
        }))
    ], i => i.port + i.protocol)
    if(portsToOpen.length === 0 && block.load_balancer) {
        //most likely the user doesn't handle https themselves when using a load balancer,
        //so we only map port 80, that way if they have https enabled 80 => 80 and 443 => 80
        mappedPorts.push(asSyntax(80))
        portsToOpen.push(
            {
                port: '80',
                protocol: 'tcp'
            }
        )
    }
    let executionRole: SyntaxToken
    let securityGroupId: SyntaxToken
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

    if(block.security_group_id) {
        securityGroupId = block.security_group_id
    } else {
        securityGroupId = asTraversal(`aws_security_group.aws_fargate_service_${bag.Name}_secgr.id`)
        databags.push(
            cloudResource('aws_security_group', `aws_fargate_service_${bag.Name}_secgr`, {
                name: appendToTemplate(namePrefix, [`${bag.Name}-fs-sg`]),
                vpc_id: asTraversal(`aws_network.aws_fargate_service_${bag.Name}.vpc.id`),
            }),
            //allow all traffic from elements in the same security group
            cloudResource('aws_security_group_rule', `aws_fargate_service_${bag.Name}_self_secgr_ingress`, {
                type: 'ingress',
                security_group_id: asTraversal(`aws_security_group.aws_fargate_service_${bag.Name}_secgr.id`),
                from_port: 0,
                to_port: 65535,
                protocol: -1,
                source_security_group_id: asTraversal(`aws_security_group.aws_fargate_service_${bag.Name}_secgr.id`),
            }),
            //allow traffic through the ports that were marked as mapped
            ...portsToOpen.map(obj => cloudResource('aws_security_group_rule', `aws_fargate_service_${bag.Name}_${obj.protocol}${obj.port}_secgr_ingress`, {
                type: 'ingress',
                security_group_id: asTraversal(`aws_security_group.aws_fargate_service_${bag.Name}_secgr.id`),
                from_port: parseInt(obj.port),
                to_port: parseInt(obj.port),
                protocol: obj.protocol,
                cidr_blocks: ['0.0.0.0/0']
            })),
            //allow all outbound traffic
            cloudResource('aws_security_group_rule', `aws_fargate_service_${bag.Name}_secgr_egress`, {
                type: 'egress',
                security_group_id: asTraversal(`aws_security_group.aws_fargate_service_${bag.Name}_secgr.id`),
                from_port: 0,
                to_port: 65535,
                protocol: -1,
                cidr_blocks: ['0.0.0.0/0']
            })
        )
    }
    if (block.auto_scaling && !asVal(dotAutoScaling.disabled || asSyntax(false))) {
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
                name: appendToTemplate(namePrefix, [`${bag.Name}-fs-scaling-policy`]),
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

    let ecsLoadBalancers: any[] = []
    function getTaskSubnets() {
        if(taskAccessibility) {
            switch(taskAccessibility) {
                case 'public':
                    return asTraversal(`aws_network.aws_fargate_service_${bag.Name}.public_subnets.*.id`)
                case 'private':
                    return asTraversal(`aws_network.aws_fargate_service_${bag.Name}.private_subnets.*.id`)
                default:
                    throw new Error(`Unknown value '${taskAccessibility}' on aws_fargate_service.${bag.Name}.task_accessibility, it must be either 'public' or 'private'`)
            }
        }
        if(block.load_balancer) {
            return asTraversal(`aws_network.aws_fargate_service_${bag.Name}.private_subnets.*.id`)
        }
        //this doesnt cover the case where the network is given as an external block `network = aws_network.my_network`
        if(block.network && dotNetwork.make_nat_gateway && asVal(dotNetwork.make_nat_gateway)) {
            return asTraversal(`aws_network.aws_fargate_service_${bag.Name}.private_subnets`)
        }
        return asTraversal(`aws_network.aws_fargate_service_${bag.Name}.public_subnets.*.id`)
    }
    let ecsService: any = {
        name: appendToTemplate(namePrefix, [`${bag.Name}-fargate-service`]),
        cluster: asTraversal(`aws_ecs_cluster.${bag.Name}_fargate_cluster.id`),
        task_definition: asTraversal(`aws_ecs_task_definition.${bag.Name}_fargate_task_def.arn`),
        desired_count: block.desired_count || 1,
        launch_type: 'FARGATE',
        enable_ecs_managed_tags: true,
        propagate_tags: 'SERVICE',
        network_configuration: asBlock([{
            subnets: getTaskSubnets(),
            security_groups: [securityGroupId],
            assign_public_ip: true,
        }]),
    }
    if(block.auto_scaling && !asVal(dotAutoScaling.disabled || asSyntax(false))) {
        ecsService.lifecycle = asBlock([{
            ignore_changes: [asTraversal('desired_count')],
        }])
    }
    
    if(block.load_balancer) {
        ecsService.depends_on = [
            asTraversal(`aws_lb.${bag.Name}_fargate_lb`)
        ]
        //TODO if auto scaling is defined need a aws_autoscaling_group to register the target int he load balancer
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

        //access logs might be disabled with `access_logs { enabled = false }` but we still define the resources if access_logs is defined
        //because if the access logs were previously enabled, we would delete the existing logs when the user might just want it temporarily disabled
        const defineAccessLogsResources = asVal(dotLoadBalancer.enable_access_logs || asSyntax(false)) || !!dotAutoScaling.access_logs
        const dotAccessLogs = compileBlockParam(dotLoadBalancer, 'access_logs')
        const portMappingLoadBalancer: DatabagObjVal[] = asValArrayConst(dotLoadBalancer.port_mapping || asSyntax([]))
        const dotHealthCheck = compileBlockParam(dotLoadBalancer, 'health_check')
        const loadBalancerType = asStr(dotLoadBalancer.type || 'application')
        const internal = asVal(dotLoadBalancer.internal || asSyntax(false))
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

        let healthCheckBlock: SyntaxToken | undefined
        if(dotLoadBalancer.health_check) {
            healthCheckBlock = asBlock([{
                enabled : dotHealthCheck.enabled || true,
                healthy_threshold: dotHealthCheck.healthy_threshold,
                unhealthy_threshold: dotHealthCheck.unhealthy_threshold,
                timeout: dotHealthCheck.timeout,
                interval: dotHealthCheck.interval,
                matcher: dotHealthCheck.matcher || '200-399',
                // '/healthCheck' is the same route that route53 health checks use
                path: dotHealthCheck.path || '/healthCheck',
            }])
        }


        databags.push(
            cloudResource('aws_security_group', `aws_fargate_service_${bag.Name}_lb_secgr`, {
                name: appendToTemplate(namePrefix, [`${bag.Name}-fsn-sg`]),
                vpc_id: asTraversal(`aws_network.aws_fargate_service_${bag.Name}.vpc.id`),
            }),
            //allow all traffic from elements in the same security group
            cloudResource('aws_security_group_rule', `aws_fargate_service_${bag.Name}_lb_self_secgr_ingress`, {
                type: 'ingress',
                security_group_id: asTraversal(`aws_security_group.aws_fargate_service_${bag.Name}_lb_secgr.id`),
                from_port: 0,
                to_port: 65535,
                protocol: -1,
                source_security_group_id: asTraversal(`aws_security_group.aws_fargate_service_${bag.Name}_lb_secgr.id`),
            }),
            //allow all outbound traffic
            cloudResource('aws_security_group_rule', `aws_fargate_service_${bag.Name}_lb_secgr_egress`, {
                type: 'egress',
                security_group_id: asTraversal(`aws_security_group.aws_fargate_service_${bag.Name}_lb_secgr.id`),
                from_port: 0,
                to_port: 65535,
                protocol: -1,
                cidr_blocks: ['0.0.0.0/0']
            }),
            //allow all ports in load_balancer.port_mapping, this might define duplicates with network mode ingress rule but i think it's ok
            ...portsToOpenLoadBalancer.map(obj => cloudResource('aws_security_group_rule', `aws_fargate_service_${bag.Name}_${obj.protocol}${obj.load_balancer_port}_lb_secgr_ingress`, {
                type: 'ingress',
                security_group_id: asTraversal(`aws_security_group.aws_fargate_service_${bag.Name}_lb_secgr.id`),
                from_port: parseInt(obj.load_balancer_port),
                to_port: parseInt(obj.load_balancer_port),
                protocol: asSgProtocol(obj.protocol),
                cidr_blocks: ['0.0.0.0/0']
            })),
            ...portsToOpenLoadBalancer.flatMap(obj => {
                ecsLoadBalancers.push({
                    target_group_arn: asTraversal(`aws_lb_target_group.aws_fargate_service_${bag.Name}_${obj.protocol}${obj.load_balancer_port}_lb_listener_target.arn`),
                    container_name: containerName,
                    container_port: obj.target_port
                })
                return [
                    cloudResource('aws_lb_listener', `aws_fargate_service_${bag.Name}_${obj.protocol}${obj.load_balancer_port}_lb_listener`, {
                        load_balancer_arn: asTraversal(`aws_lb.${bag.Name}_fargate_lb.arn`),
                        port: obj.load_balancer_port,
                        protocol: asLbProtocol(obj.protocol),
                        default_action: asBlock([{
                            type: 'forward',
                            target_group_arn: asTraversal(`aws_lb_target_group.aws_fargate_service_${bag.Name}_${obj.protocol}${obj.load_balancer_port}_lb_listener_target.arn`)
                        }])
                    }),
                    cloudResource('aws_lb_target_group', `aws_fargate_service_${bag.Name}_${obj.protocol}${obj.load_balancer_port}_lb_listener_target`, {
                        name: appendToTemplate(namePrefix, [`${bag.Name}-${obj.protocol}${obj.load_balancer_port}-fs-lb-tg`]),
                        port: obj.target_port,
                        protocol: asLbProtocol(obj.protocol),
                        vpc_id: asTraversal(`aws_network.aws_fargate_service_${bag.Name}.vpc.id`),
                        target_type: 'ip',
                        health_check: healthCheckBlock
                    })
                ]
            })
        )
        
        
        if (loadBalancerType === 'application') {
            databags.push(
                cloudResource('aws_security_group_rule', `aws_fargate_service_${bag.Name}_http_lb_secgr_ingress`, {
                    type: 'ingress',
                    security_group_id: asTraversal(`aws_security_group.aws_fargate_service_${bag.Name}_lb_secgr.id`),
                    from_port: 80,
                    to_port: 80,
                    protocol: 'tcp',
                    cidr_blocks: ['0.0.0.0/0']
                })
            )
            if(enableHttps) {
                databags.push(
                    cloudResource('aws_security_group_rule', `aws_fargate_service_${bag.Name}_https_lb_secgr_ingress`, {
                        type: 'ingress',
                        security_group_id: asTraversal(`aws_security_group.aws_fargate_service_${bag.Name}_lb_secgr.id`),
                        from_port: 443,
                        to_port: 443,
                        protocol: 'tcp',
                        cidr_blocks: ['0.0.0.0/0']
                    })
                )
            }
            if(portsToOpen.length === 1) {
                //map 80 and 443 on load balancer to the only opened port on container
                ecsLoadBalancers.push({
                    target_group_arn: asTraversal(`aws_lb_target_group.aws_fargate_service_${bag.Name}_lonely_http_lb_listener_target.arn`),
                    container_name: containerName,
                    container_port: portsToOpen[0].port
                })
                databags.push(
                    cloudResource('aws_lb_listener', `aws_fargate_service_${bag.Name}_lonely_http_lb_listener`, {
                        load_balancer_arn: asTraversal(`aws_lb.${bag.Name}_fargate_lb.arn`),
                        port: 80,
                        protocol: 'HTTP',
                        default_action: asBlock([{
                            type: 'forward',
                            target_group_arn: asTraversal(`aws_lb_target_group.aws_fargate_service_${bag.Name}_lonely_http_lb_listener_target.arn`)
                        }])
                    }),
                    cloudResource('aws_lb_target_group', `aws_fargate_service_${bag.Name}_lonely_http_lb_listener_target`, {
                        name: appendToTemplate(namePrefix, [`${bag.Name}-fs-lhttp-lb-tg`]),
                        port: portsToOpen[0].port,
                        protocol: asLbProtocol(portsToOpen[0].protocol),
                        vpc_id: asTraversal(`aws_network.aws_fargate_service_${bag.Name}.vpc.id`),
                        target_type: 'ip',
                        health_check: healthCheckBlock
                    })
                )
                if(enableHttps) {
                    const dotDomain = compileBlockParam(dotLoadBalancer, 'domain')
                    const domainBlock = awsDomainBlockResources({
                        dotDomain,
                        domainValue: asTraversal(`aws_lb.${bag.Name}_fargate_lb.dns_name`),
                        resourcePrefix: `aws_fargate_service_${bag.Name}`,
                        apexHostedZoneId: asTraversal(`aws_lb.${bag.Name}_fargate_lb.zone_id`),
                        cloudData,
                        cloudResource
                    })
                    if(!domainBlock) {
                        throwStatement(`missing 'name' on aws_fargate_service.${bag.Name}.load_balancer.domain`)
                    }
                    databags.push(
                        ...domainBlock.databags,
                        cloudResource('aws_lb_listener', `aws_fargate_service_${bag.Name}_lonely_https_lb_listener`, {
                            depends_on: domainBlock.certRef ? [domainBlock.certRef]: null,
                            load_balancer_arn: asTraversal(`aws_lb.${bag.Name}_fargate_lb.arn`),
                            port: 443,
                            protocol: 'HTTPS',
                            certificate_arn: domainBlock.certArn,
                            default_action: asBlock([{
                                type: 'forward',
                                target_group_arn: asTraversal(`aws_lb_target_group.aws_fargate_service_${bag.Name}_lonely_http_lb_listener_target.arn`)
                            }])
                        }),
                    )
                }
            } else if(portsToOpen.some(obj => obj.port === '80' || obj.port === '443')) {
                //map 80 and 443 on load balancer to opened ports on container that are 80 and 443
                // console.log('portsToOpen', JSON.stringify(portsToOpen))
                const eightyIsOpen = portsToOpen.some(obj => obj.port === '80')
                const fourFourThreeIsOpen = portsToOpen.some(obj => obj.port === '443')
                if(eightyIsOpen) {
                    ecsLoadBalancers.push({
                        target_group_arn: asTraversal(`aws_lb_target_group.aws_fargate_service_${bag.Name}_http_lb_listener_target.arn`),
                        container_name: containerName,
                        container_port: 80
                    })
                    databags.push(
                        cloudResource('aws_lb_listener', `aws_fargate_service_${bag.Name}_http_lb_listener`, {
                            load_balancer_arn: asTraversal(`aws_lb.${bag.Name}_fargate_lb.arn`),
                            port: 80,
                            protocol: 'HTTP',
                            default_action: asBlock([{
                                type: 'forward',
                                target_group_arn: asTraversal(`aws_lb_target_group.aws_fargate_service_${bag.Name}_http_lb_listener_target.arn`)
                            }])
                        }),
                        cloudResource('aws_lb_target_group', `aws_fargate_service_${bag.Name}_http_lb_listener_target`, {
                            name: appendToTemplate(namePrefix, [`${bag.Name}-fs-http-lb-tg`]),
                            port: 80,
                            protocol: 'HTTP',
                            vpc_id: asTraversal(`aws_network.aws_fargate_service_${bag.Name}.vpc.id`),
                            target_type: 'ip',
                            health_check: healthCheckBlock
                        })
                    )
                }
                if(fourFourThreeIsOpen) {
                    // we map either 80 or 443 on the load balancer to 443 on the container
                    // because if https is not enabled on the load balancer then we dont want to map 443 on the load balancer to 443 on the container
                    if(enableHttps) {
                        const dotDomain = compileBlockParam(dotLoadBalancer, 'domain')
                        const domainBlock = awsDomainBlockResources({
                            dotDomain,
                            domainValue: asTraversal(`aws_lb.${bag.Name}_fargate_lb.dns_name`),
                            resourcePrefix: `aws_fargate_service_${bag.Name}`,
                            apexHostedZoneId: asTraversal(`aws_lb.${bag.Name}_fargate_lb.zone_id`),
                            cloudData,
                            cloudResource
                        })
                        if(!domainBlock) {
                            throwStatement(`missing 'name' on aws_fargate_service.${bag.Name}.load_balancer.domain`)
                        }
                        databags.push(
                            ...domainBlock.databags,
                            cloudResource('aws_lb_listener', `aws_fargate_service_${bag.Name}_https_lb_listener`, {
                                depends_on: domainBlock.certRef ? [domainBlock.certRef]: null,
                                load_balancer_arn: asTraversal(`aws_lb.${bag.Name}_fargate_lb.arn`),
                                port: 443,
                                protocol: 'HTTPS',
                                certificate_arn: domainBlock.certArn,
                                default_action: asBlock([{
                                    type: 'forward',
                                    target_group_arn: asTraversal(`aws_lb_target_group.aws_fargate_service_${bag.Name}_https_lb_listener_target.arn`)
                                }])
                            }),
                        )
                    } else if(!eightyIsOpen) {
                        databags.push(
                            cloudResource('aws_lb_listener', `aws_fargate_service_${bag.Name}_http_lb_listener`, {
                                load_balancer_arn: asTraversal(`aws_lb.${bag.Name}_fargate_lb.arn`),
                                port: 80,
                                protocol: 'HTTP',
                                default_action: asBlock([{
                                    type: 'forward',
                                    target_group_arn: asTraversal(`aws_lb_target_group.aws_fargate_service_${bag.Name}_https_lb_listener_target.arn`)
                                }])
                            })
                        )
                    }
                    ecsLoadBalancers.push({
                        target_group_arn: asTraversal(`aws_lb_target_group.aws_fargate_service_${bag.Name}_https_lb_listener_target.arn`),
                        container_name: containerName,
                        container_port: 443
                    })
                    databags.push(
                        cloudResource('aws_lb_target_group', `aws_fargate_service_${bag.Name}_https_lb_listener_target`, {
                            name: appendToTemplate(namePrefix, [`${bag.Name}-fs-https-lb-tg`]),
                            port: 443,
                            protocol: 'HTTPS',
                            vpc_id: asTraversal(`aws_network.aws_fargate_service_${bag.Name}.vpc.id`),
                            target_type: 'ip',
                            health_check: healthCheckBlock
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
                ...portsToOpen.map(obj => cloudResource('aws_security_group_rule', `aws_fargate_service_${bag.Name}_${obj.protocol}${obj.port}_lb_secgr_ingress`, {
                    type: 'ingress',
                    security_group_id: asTraversal(`aws_security_group.aws_fargate_service_${bag.Name}_lb_secgr.id`),
                    from_port: parseInt(obj.port),
                    to_port: parseInt(obj.port),
                    protocol: obj.protocol,
                    cidr_blocks: ['0.0.0.0/0']
                }))
            )
            //if no port_mapping are explicitly defined, we map all ports to the same port on the container (because we are a network load balancer only)
            if(!dotLoadBalancer.port_mapping) {
                databags.push(
                    ...portsToOpen.flatMap(obj => {
                        ecsLoadBalancers.push({
                            target_group_arn: asTraversal(`aws_lb_target_group.aws_fargate_service_${bag.Name}_net_${obj.port}_lb_listener_target.arn`),
                            container_name: containerName,
                            container_port: obj.port
                        })
                        return [
                            cloudResource('aws_lb_listener', `aws_fargate_service_${bag.Name}_net_${obj.port}_lb_listener`, {
                                load_balancer_arn: asTraversal(`aws_lb.${bag.Name}_fargate_lb.arn`),
                                port: obj.port,
                                //listeners attaches to network load balancers must be TCP
                                protocol: 'TCP',
                                default_action: asBlock([{
                                    type: 'forward',
                                    target_group_arn: asTraversal(`aws_lb_target_group.aws_fargate_service_${bag.Name}_net_${obj.port}_lb_listener_target.arn`)
                                }])
                            }),
                            cloudResource('aws_lb_target_group', `aws_fargate_service_${bag.Name}_net_${obj.port}_lb_listener_target`, {
                                name: appendToTemplate(namePrefix, [`${bag.Name}-fsn${obj.port}`]),
                                port: obj.port,
                                protocol: 'TCP',
                                vpc_id: asTraversal(`aws_network.aws_fargate_service_${bag.Name}.vpc.id`),
                                target_type: 'ip',
                            })
                        ]
                    })
                )
            }
        }
        if(defineAccessLogsResources && !dotAccessLogs.bucket) {
            databags.push(
                cloudResource('aws_s3_bucket', `aws_fargate_service_${bag.Name}_lb_access_logs_bucket`, {
                    bucket: appendToTemplate(namePrefix, [`${bag.Name}-fs-lb-access-logs`]),
                    force_destroy: true,
                })
            )
        }

        databags.push(
            cloudResource('aws_lb', `${bag.Name}_fargate_lb`, {
                name: appendToTemplate(namePrefix, [`${bag.Name}-fs-lb`]),
                internal,
                load_balancer_type: loadBalancerType,
                subnets: internal ? asTraversal(`aws_network.aws_fargate_service_${bag.Name}.private_subnets.*.id`) : asTraversal(`aws_network.aws_fargate_service_${bag.Name}.public_subnets.*.id`),
                security_groups: loadBalancerType === 'network' ? null : [
                    asTraversal(`aws_security_group.aws_fargate_service_${bag.Name}_lb_secgr.id`)
                ],
                access_logs: defineAccessLogsResources ? asBlock([{
                    enabled: dotAccessLogs.enabled || true,
                    bucket: dotAccessLogs.bucket ? dotAccessLogs.bucket : asTraversal(`aws_s3_bucket.aws_fargate_service_${bag.Name}_lb_access_logs_bucket.id`),
                    prefix: dotAccessLogs.prefix || appendToTemplate(namePrefix, [`${bag.Name}-fs-lb-access-logs`]),
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

    if(ecsLoadBalancers.length !== 0) {
        ecsService.load_balancer = asBlock(ecsLoadBalancers)
    }
    databags.push(
        cloudData('aws_availability_zones', 'current', {}),
        cloudResource('aws_ecs_cluster', `${bag.Name}_fargate_cluster`, {
            name: appendToTemplate(namePrefix, [`${bag.Name}-fs-cluster`]),
        }),
        traversalTransform(`aws_fargate_service_transforms`, {
            [`aws_fargate_service.${bag.Name}.ecs_cluster`]: `aws_ecs_cluster.${bag.Name}_fargate_cluster`,
            [`aws_fargate_service.${bag.Name}.ecs_service`]: `aws_ecs_service.${bag.Name}_fargate_service`,
            [`aws_fargate_service.${bag.Name}.load_balancer`]: `aws_lb.${bag.Name}_fargate_lb`,
            [`aws_fargate_service.${bag.Name}.run_task_payload`]: `data.template_file.${bag.Name}_fargate_run_task_payload.rendered`,
        }),
        cloudData('template_file', `${bag.Name}_fargate_run_task_payload`, {
            template: `{
                "taskDefinition": "\${task_definition}",
                "cluster": "\${cluster}",
                "launchType": "FARGATE",
                "count": 1,
                "networkConfiguration": {
                    "awsvpcConfiguration": {
                        "subnets": \${subnet_ids},
                        "securityGroups": ["\${security_group_id}"],
                        "assignPublicIp": "ENABLED"
                    }
                },
                "overrides": {
                    "containerOverrides": [
                        {
                            "name": "\${container_name}"
                        }
                    ]
                }
            }`,
            vars: {
                task_definition: asTraversal(`aws_ecs_task_definition.${bag.Name}_fargate_task_def.arn`),
                cluster: asTraversal(`aws_ecs_cluster.${bag.Name}_fargate_cluster.name`),
                subnet_ids: asFuncCall("jsonencode", [
                    getTaskSubnets()
                ]),
                security_group_id: securityGroupId,
                container_name: containerName,
            }
        }),
        cloudOutput('', `aws_fargate_service_${bag.Name}_cluster`, {
            value: asTraversal(`aws_ecs_cluster.${bag.Name}_fargate_cluster.name`),
        }),
        cloudResource('aws_ecs_service', `${bag.Name}_fargate_service`, ecsService),
        cloudOutput('', `aws_fargate_service_${bag.Name}_service`, {
            value: asTraversal(`aws_ecs_service.${bag.Name}_fargate_service.name`),
        }),
        cloudResource('aws_cloudwatch_log_group', `${bag.Name}_fargate_task_logs`, {
            name: appendToTemplate(asSyntax('/ecs/'), [namePrefix, bag.Name]),
            retention_in_days: block.logs_retention_days || 30,
        }),
        cloudResource('aws_ecs_task_definition', `${bag.Name}_fargate_task_def`, {
            family: containerName,
            cpu,
            memory,
            network_mode: 'awsvpc',
            requires_compatibilities: ['FARGATE'],
            execution_role_arn: executionRole,
            task_role_arn: block.role || asTraversal('aws_iam_role.default_lambda_role.arn'),
            runtime_platform: block.operating_system_family || block.cpu_architecture ? asBlock([{
                operating_system_family: block.operating_system_family || 'LINUX',
                cpu_architecture: block.cpu_architecture || 'X86_64',
            }]) : undefined,
            container_definitions: asFuncCall(
                'jsonencode',
                //that's an array of arrays cause we're json marshalling a list of objects
                [[
                    {
                        name: containerName,
                        image: asTemplate([
                            asTraversal(`aws_ecr_repository_with_image.${bag.Name}-ecr.repository_url`),
                            ':latest',
                        ]),
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
    return databags
}

executePipelineGroup(container, iterateBlocks(container, AWS_FARGATE_SERVICE, awsFargateServiceIterator).flat())