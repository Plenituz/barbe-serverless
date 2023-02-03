import { listReferencedAWSRegions, hasToken } from './barbe-sls-lib/helpers';
import {
    CloudResourceBuilder,
    asTraversal,
    exportDatabags,
    cloudResourceRaw,
    readDatabagContainer,
    onlyRunForLifecycleSteps,
    DatabagContainer, iterateAllBlocks, SyntaxToken, accumulateTokens, Databag, visitTokens
} from './barbe-std/utils';

const container = readDatabagContainer()
onlyRunForLifecycleSteps(['pre_generate', 'generate', 'post_generate'])

const dataResource = (params: Partial<CloudResourceBuilder> & { name: string, type: string }) => cloudResourceRaw({
    kind: 'data',
    ...params
})

const allRegions = listReferencedAWSRegions(container)

function isAwsPartition(token: SyntaxToken): boolean {
    return token.Type === "scope_traversal" &&
        (token.Traversal || []).length > 2 &&
        token.Traversal![0].Name === "data" &&
        token.Traversal![1].Name === "aws_partition" &&
        token.Traversal![2].Name === "current";
}

function isAwsRegion(token: SyntaxToken): boolean {
    return token.Type === "scope_traversal" &&
        (token.Traversal || []).length > 2 &&
        token.Traversal![0].Name === "data" &&
        token.Traversal![1].Name === "aws_region" &&
        token.Traversal![2].Name === "current";
}

function isAwsCallerIdentity(token: SyntaxToken): boolean {
    return token.Type === "scope_traversal" &&
        (token.Traversal || []).length > 2 &&
        token.Traversal![0].Name === "data" &&
        token.Traversal![1].Name === "aws_caller_identity" &&
        token.Traversal![2].Name === "current";
}

function isAwsAvailabilityZones(token: SyntaxToken): boolean {
    return token.Type === "scope_traversal" &&
        (token.Traversal || []).length > 2 &&
        token.Traversal![0].Name === "data" &&
        token.Traversal![1].Name === "aws_availability_zones" &&
        token.Traversal![2].Name === "current";
}

let databags = [
    ...allRegions.map(region => dataResource({
        name: region,
        type: 'aws_region',
        value: {
            provider: asTraversal(`aws.${region}`)
        }
    })),
    ...allRegions.map(region => dataResource({
        name: region,
        type: 'aws_availability_zones',
        value: {
            provider: asTraversal(`aws.${region}`)
        }
    }))
]
if(hasToken(container, isAwsPartition)) {
    databags.push(dataResource({
        name: 'current',
        type: 'aws_partition'
    }))
}
if(hasToken(container, isAwsRegion)) {
    databags.push(dataResource({
        name: 'current',
        type: 'aws_region'
    }))
}
if(hasToken(container, isAwsCallerIdentity)) {
    databags.push(dataResource({
        name: 'current',
        type: 'aws_caller_identity'
    }))
}
if(hasToken(container, isAwsAvailabilityZones)) {
    databags.push(dataResource({
        name: 'current',
        type: 'aws_availability_zones'
    }))
}

exportDatabags(databags)