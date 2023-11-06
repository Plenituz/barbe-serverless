import { AWS_DYNAMODB, AWS_NETWORK, AWS_S3, AWS_FARGATE_SERVICE } from './barbe-sls-lib/consts';
import { applyDefaults, preConfCloudResourceFactory, preConfTraversalTransform } from "./barbe-sls-lib/lib"
import { asStr, Databag, exportDatabags, iterateBlocks, onlyRunForLifecycleSteps, readDatabagContainer, SugarCoatedDatabag, appendToTemplate, appendToTraversal, asBinaryOp, asBlock, asFuncCall, asTraversal, asSyntax, asVal, SyntaxToken, asTemplate, uniq } from './barbe-std/utils';


const container = readDatabagContainer()
onlyRunForLifecycleSteps(['pre_generate', 'generate', 'post_generate'])

function awsNetworkIterator(bag: Databag): (Databag | SugarCoatedDatabag)[] {
    if (!bag.Value) {
        return []
    }
    const [block, namePrefix] = applyDefaults(container, bag.Value!);
    const cloudResource = preConfCloudResourceFactory(block, 'resource')
    const cloudData = preConfCloudResourceFactory(block, 'data')
    const traversalTransform = preConfTraversalTransform(bag)
    const avZoneDataName = asStr(block.region || 'current')
    const regionDataName = asStr(block.region || 'current')
    const makeNatGateway = asVal(block.make_nat_gateway || asSyntax(false))
    const oneNatPerAZ = asVal(block.one_nat_per_az || asSyntax(false))
    const useDefaultVpc = asVal(block.use_default_vpc || asSyntax(false))
    const publicSubnetCidrOffset = asVal(block.public_subnets_cidr_offset || asSyntax(0))
    const privateSubnetCidrOffset = asVal(block.private_subnets_cidr_offset || asSyntax(100))

    let databags: SugarCoatedDatabag[] = []
    let vpcRef: SyntaxToken

    if(useDefaultVpc) {
        vpcRef = asTraversal('data.aws_vpc.default.id')
        databags.push(
            cloudData('aws_vpc', 'default', {
                default: true,
            })
        )
    } else if(block.vpc_id) {
        vpcRef = asTraversal(`data.aws_vpc.aws_network_${bag.Name}_imported_vpc`)
        databags.push(
            cloudData('aws_vpc', `aws_network_${bag.Name}_imported_vpc`, {
                id: block.vpc_id,
            })
        )
    } else {
        vpcRef = asTraversal(`aws_vpc.aws_network_${bag.Name}_vpc`)
        databags.push(
            cloudResource('aws_vpc', `aws_network_${bag.Name}_vpc`, {
                tags: {
                    Name: appendToTemplate(namePrefix, [`${bag.Name}-vpc`]),
                },
                cidr_block: block.cidr_block || '10.0.0.0/16',
                enable_dns_hostnames: block.enable_dns_hostnames || true,
                enable_dns_support: block.enable_dns_support,
            })
        )
    }

    //VPC endpoints only if we control the subnets
    if(!block.subnet_ids && block.enable_vpc_endpoints && asVal(block.enable_vpc_endpoints)) {
        let vpcEndpoints: (SyntaxToken | string)[] = asVal(block.vpc_endpoints || asSyntax([]))
        if(container[AWS_DYNAMODB]) {
            vpcEndpoints.push('dynamodb')
        }
        if(container[AWS_S3]) {
            vpcEndpoints.push('s3')
        }
        if(container[AWS_FARGATE_SERVICE] || container[AWS_FARGATE_SERVICE]) {
            //ECR for image pull authentication, S3 for image layers, and AWS Secrets Manager for secrets: https://stackoverflow.com/questions/61265108/aws-ecs-fargate-resourceinitializationerror-unable-to-pull-secrets-or-registry
            vpcEndpoints.push('ecr.api', 'ecr.dkr', 'ecs', 's3', 'logs', 'secretsmanager')
        }
        vpcEndpoints = uniq(vpcEndpoints, asStr)

        databags.push(
            //this is needed for the members of the subnet to access the AWS services (thru https)
            cloudResource('aws_security_group', `${bag.Name}_vpc_endpoint_secgr`, {
                name: appendToTemplate(namePrefix, [`${bag.Name}-vpc-endpoint`]),
                vpc_id: appendToTraversal(vpcRef, 'id'),
                ingress: asBlock([{
                    from_port: 443,
                    to_port: 443,
                    protocol: 'tcp',
                    cidr_blocks: ['0.0.0.0/0']
                }])
            })
        )
        for(const endpoint of vpcEndpoints) {
            const endpointStr = asStr(endpoint)
            let endpointType = 'Interface'
            if(endpointStr === 'dynamodb' || endpointStr === 's3') {
                //Gateway type is for S3 and DynamoDB: https://docs.aws.amazon.com/whitepapers/latest/aws-privatelink/what-are-vpc-endpoints.html
                endpointType = 'Gateway'
            }
            let serviceName = asTemplate([
                'com.amazonaws.',
                asTraversal(`data.aws_region.${regionDataName}.name`),
                '.',
                endpoint
            ])
            if(endpointStr === 'notebook' || endpointStr === 'studio') {
                //sagemaker is an exception to the service name convention: https://docs.aws.amazon.com/vpc/latest/privatelink/aws-services-privatelink-support.html
                serviceName = asTemplate([
                    'aws.sagemaker.',
                    asTraversal(`data.aws_region.${regionDataName}.name`),
                    '.',
                    endpoint
                ])
            }
            databags.push(
                cloudResource('aws_vpc_endpoint', `${bag.Name}_${endpointStr.replace(/\./, '-')}_vpc_endpoint`, {
                    vpc_id: appendToTraversal(vpcRef, 'id'),
                    service_name: serviceName,
                    vpc_endpoint_type: endpointType,
                    private_dns_enabled: endpointType === 'Interface',
                    route_table_ids: endpointType === 'Gateway' ? [
                        asTraversal(`aws_route_table.aws_network_${bag.Name}_private_subnets_route_table.id`),
                    ] : null,
                    security_group_ids: endpointType === 'Interface' ? [
                        asTraversal(`aws_security_group.${bag.Name}_vpc_endpoint_secgr.id`)
                    ] : null,
                    subnet_ids: endpointType === 'Interface' ? asFuncCall('concat', [
                        asTraversal(`aws_subnet.aws_network_${bag.Name}_private_subnets.*.id`),
                    ]) : null,
                })
            )
        }
    }

    if(makeNatGateway) {
        if(oneNatPerAZ) {
            databags.push(
                cloudResource('aws_eip', `aws_network_${bag.Name}_nat_gateway_eips`, {
                    count: asFuncCall('length', [asTraversal(`data.aws_availability_zones.${avZoneDataName}.names`)]),
                    vpc: true,
                    tags: {
                        Name: appendToTemplate(namePrefix, [`${bag.Name}-nat-gateway-eip-`, asTraversal('count.index')]),
                    }
                }),
                cloudResource('aws_nat_gateway', `aws_network_${bag.Name}_nat_gateways`, {
                    count: asFuncCall('length', [asTraversal(`data.aws_availability_zones.${avZoneDataName}.names`)]),
                    allocation_id: asTraversal(`aws_eip.aws_network_${bag.Name}_nat_gateway_eips[count.index].id`),
                    subnet_id: asTraversal(`aws_subnet.aws_network_${bag.Name}_public_subnets[count.index].id`),
                    tags: {
                        Name: appendToTemplate(namePrefix, [`${bag.Name}-nat-gateway-`, asTraversal('count.index')]),
                    }
                }),
                cloudResource('aws_route', `aws_network_${bag.Name}_nat_gateway_routes`, {
                    count: asFuncCall('length', [asTraversal(`data.aws_availability_zones.${avZoneDataName}.names`)]),
                    route_table_id: asTraversal(`aws_route_table.aws_network_${bag.Name}_private_subnets_route_table.id`),
                    destination_cidr_block: '0.0.0.0/0',
                    nat_gateway_id: asTraversal(`aws_nat_gateway.aws_network_${bag.Name}_nat_gateways[count.index].id`),
                })
            )
        } else {
            databags.push(
                cloudResource('aws_eip', `aws_network_${bag.Name}_nat_gateway_eip`, {
                    vpc: true,
                    tags: {
                        Name: appendToTemplate(namePrefix, [`${bag.Name}-nat-gateway-eip`]),
                    }
                }),
                cloudResource('aws_nat_gateway', `aws_network_${bag.Name}_nat_gateway`, {
                    allocation_id: asTraversal(`aws_eip.aws_network_${bag.Name}_nat_gateway_eip.id`),
                    subnet_id: asTraversal(`aws_subnet.aws_network_${bag.Name}_public_subnets[0].id`),
                    tags: {
                        Name: appendToTemplate(namePrefix, [`${bag.Name}-nat-gateway`]),
                    }
                }),
                cloudResource('aws_route', `aws_network_${bag.Name}_nat_gateway_route`, {
                    route_table_id: asTraversal(`aws_route_table.aws_network_${bag.Name}_private_subnets_route_table.id`),
                    destination_cidr_block: '0.0.0.0/0',
                    nat_gateway_id: asTraversal(`aws_nat_gateway.aws_network_${bag.Name}_nat_gateway.id`),
                })
            )
        }
    }

    databags.push(
        traversalTransform('aws_network_${bag.Name}_traversal_transforms', {
            [`aws_network.${bag.Name}.vpc`]: asStr(vpcRef),
            [`aws_network.${bag.Name}.public_subnets`]: `aws_subnet.aws_network_${bag.Name}_public_subnets`,
            [`aws_network.${bag.Name}.private_subnets`]: `aws_subnet.aws_network_${bag.Name}_private_subnets`,
        }),
        //public subnets
        cloudResource('aws_subnet', `aws_network_${bag.Name}_public_subnets`, {
            count: asFuncCall('length', [asTraversal(`data.aws_availability_zones.${avZoneDataName}.names`)]),
            vpc_id: appendToTraversal(vpcRef, 'id'),
            availability_zone: asTraversal(`data.aws_availability_zones.${avZoneDataName}.names[count.index]`),
            cidr_block: asFuncCall('cidrsubnet', [
                appendToTraversal(vpcRef, 'cidr_block'),
                8,
                asBinaryOp(asTraversal(`count.index`), '+', 1+publicSubnetCidrOffset),
            ]),
            map_public_ip_on_launch: true,
            tags: {
                Name: appendToTemplate(namePrefix, [`${bag.Name}-public-subnet-`, asTraversal('count.index')]),
            }
        }),
        cloudResource('aws_route_table', `aws_network_${bag.Name}_public_subnets_route_table`, {
            vpc_id: appendToTraversal(vpcRef, 'id'),
            route: asBlock([{
                cidr_block: '0.0.0.0/0',
                gateway_id: asTraversal(`aws_internet_gateway.aws_network_${bag.Name}_igw.id`),
            }]),
            tags: {
                Name: appendToTemplate(namePrefix, [`${bag.Name}-public-rtable`]),
            }
        }),
        cloudResource('aws_route_table_association', `aws_network_${bag.Name}_public_subnets_route_table_association`, {
            count: asFuncCall('length', [asTraversal(`data.aws_availability_zones.${avZoneDataName}.names`)]),
            subnet_id: asFuncCall('element', [
                asTraversal(`aws_subnet.aws_network_${bag.Name}_public_subnets.*.id`), 
                asTraversal('count.index')
            ]),
            route_table_id: asTraversal(`aws_route_table.aws_network_${bag.Name}_public_subnets_route_table.id`),
        }),
        cloudResource('aws_internet_gateway', `aws_network_${bag.Name}_igw`, {
            vpc_id: appendToTraversal(vpcRef, 'id'),
            tags: {
                Name: appendToTemplate(namePrefix, [`${bag.Name}-igw`]),
            }
        }),

        //private subnets (nat goes into the public subnet, but is a the root of the private subnet)
        cloudResource('aws_subnet', `aws_network_${bag.Name}_private_subnets`, {
            count: asFuncCall('length', [asTraversal(`data.aws_availability_zones.${avZoneDataName}.names`)]),
            vpc_id: appendToTraversal(vpcRef, 'id'),
            availability_zone: asTraversal(`data.aws_availability_zones.${avZoneDataName}.names[count.index]`),
            cidr_block: asFuncCall('cidrsubnet', [
                appendToTraversal(vpcRef, 'cidr_block'),
                8,
                asBinaryOp(asTraversal(`count.index`), '+', 101+privateSubnetCidrOffset),
            ]),
            map_public_ip_on_launch: true,
            tags: {
                Name: appendToTemplate(namePrefix, [`${bag.Name}-private-subnet-`, asTraversal('count.index')]),
            }
        }),
        cloudResource('aws_route_table', `aws_network_${bag.Name}_private_subnets_route_table`, {
            //routes for this table are created in the nat gateway section
            vpc_id: appendToTraversal(vpcRef, 'id'),
            tags: {
                Name: appendToTemplate(namePrefix, [`${bag.Name}-private-rtable`]),
            }
        }),
        cloudResource('aws_route_table_association', `aws_network_${bag.Name}_private_subnets_route_table_association`, {
            count: asFuncCall('length', [asTraversal(`data.aws_availability_zones.${avZoneDataName}.names`)]),
            subnet_id: asFuncCall('element', [
                asTraversal(`aws_subnet.aws_network_${bag.Name}_private_subnets.*.id`), 
                asTraversal('count.index')
            ]),
            route_table_id: asTraversal(`aws_route_table.aws_network_${bag.Name}_private_subnets_route_table.id`),
        })
    )
    return databags
}


exportDatabags(iterateBlocks(container, AWS_NETWORK, awsNetworkIterator).flat())
