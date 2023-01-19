import { listReferencedAWSRegions } from './barbe-sls-lib/helpers';
import { exportDatabags, cloudResourceRaw, readDatabagContainer, iterateAllBlocks, asVal, asStr } from './barbe-std/utils';

const container = readDatabagContainer()

const allRegions = listReferencedAWSRegions(container)

const alreadyDeclaredProviders = new Set(iterateAllBlocks(container, (bag) => {
    if(!bag.Value) {
        return [];
    }
    if (bag.Type.includes('provider')) {
        const block = asVal(bag.Value)
        if (block.alias) {
            return [asStr(block.alias)]
        }
    }
    return []
}).flat())

const newProviders = allRegions.filter(region => !alreadyDeclaredProviders.has(region))

const databags = [
    cloudResourceRaw({
        name: 'aws',
        kind: 'provider',
        id: 'default'
    }),
    ...newProviders.map(region => cloudResourceRaw({
        name: 'aws',
        kind: 'provider',
        id: region,
        value: {
            alias: region,
            region
        }
    })),
    
]
exportDatabags(databags)