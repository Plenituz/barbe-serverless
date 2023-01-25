import { listReferencedAWSRegions } from './barbe-sls-lib/helpers';
import { CloudResourceBuilder, asTraversal, exportDatabags, cloudResourceRaw, readDatabagContainer, onlyRunForLifecycleSteps } from './barbe-std/utils';

const container = readDatabagContainer()
onlyRunForLifecycleSteps(['pre_generate', 'generate', 'post_generate'])

const dataResource = (params: Partial<CloudResourceBuilder> & { name: string, type: string }) => cloudResourceRaw({
    kind: 'data',
    ...params
})

const allRegions = listReferencedAWSRegions(container)

const databags = [
    dataResource({
        name: 'current',
        type: 'aws_partition'
    }),
    dataResource({
        name: 'current',
        type: 'aws_region'
    }),
    dataResource({
        name: 'current',
        type: 'aws_caller_identity'
    }),
    dataResource({
        name: 'current',
        type: 'aws_availability_zones'
    }),
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
exportDatabags(databags)