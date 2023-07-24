import { AWS_CERT_DOMAIN } from './barbe-sls-lib/consts';
import { awsDomainBlockResources } from './barbe-sls-lib/helpers';
import { applyDefaults, preConfCloudResourceFactory, preConfTraversalTransform } from './barbe-sls-lib/lib';
import { appendToTemplate, asBlock, Databag, exportDatabags, iterateBlocks, onlyRunForLifecycleSteps, readDatabagContainer, SugarCoatedDatabag, throwStatement } from './barbe-std/utils';

const container = readDatabagContainer()
onlyRunForLifecycleSteps(['pre_generate', 'generate', 'post_generate'])

function awsCertDomainIterator(bag: Databag): (Databag | SugarCoatedDatabag)[] {
    if (!bag.Value) {
        return [];
    }
    const [block, namePrefix] = applyDefaults(container, bag.Value!);
    const cloudResource = preConfCloudResourceFactory(block, 'resource')
    const cloudData = preConfCloudResourceFactory(block, 'data')
    const traversalTransform = preConfTraversalTransform(bag)

    const domainBlock = awsDomainBlockResources({
        dotDomain: block,
        domainValue: block.value!,
        resourcePrefix: `aws_cert_domain_${bag.Name}`,
        apexHostedZoneId: block.apex_hosted_zone_id!,
        cloudData,
        cloudResource
    })
    if(!domainBlock) {
        throwStatement(`missing 'name' on aws_cert_domain.${bag.Name}`)
    }

    let databags: SugarCoatedDatabag[] = [
        {
            Type: 'traversal_map',
            Name: 'aws_cert_domain_traversal_map',
            Value: {
                [`aws_cert_domain.${bag.Name}.cert_arn`]: domainBlock.certArn,
            }
        },
        ...domainBlock.databags,
    ]
    return databags
}

exportDatabags(iterateBlocks(container, AWS_CERT_DOMAIN, awsCertDomainIterator).flat())

