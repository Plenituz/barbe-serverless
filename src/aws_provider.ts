import {hasToken, listReferencedAWSRegions} from './barbe-sls-lib/helpers';
import {
    exportDatabags,
    cloudResourceRaw,
    readDatabagContainer,
    iterateAllBlocks,
    asVal,
    asStr,
    onlyRunForLifecycleSteps,
    findInBlocks, Databag, asBlock
} from './barbe-std/utils';
import {compileNamePrefix} from "./barbe-sls-lib/lib";

const container = readDatabagContainer()
onlyRunForLifecycleSteps(['pre_generate', 'generate', 'post_generate'])

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

function isAwsBlock(bag: Databag): boolean {
    return bag.Type.includes('aws')
}

let databags = [
    ...newProviders.map(region => cloudResourceRaw({
        name: 'aws',
        kind: 'provider',
        id: region,
        value: {
            alias: region,
            region,
            default_tags: asBlock([{
                tags: {
                    BarbeStack: compileNamePrefix(container, null)
                },
            }])
        }
    })),
]
if(findInBlocks(container, isAwsBlock)) {
    databags.push(cloudResourceRaw({
        name: 'aws',
        kind: 'provider',
        id: 'default',
        value: {
            default_tags: asBlock([{
                tags: {
                    BarbeStack: compileNamePrefix(container, null)
                },
            }])
        }
    }))
}
exportDatabags(databags)