import { FOR_EACH } from "./barbe-sls-lib/consts";
import { applyDefaults } from "./barbe-sls-lib/lib";
import {
    readDatabagContainer,
    onlyRunForLifecycleSteps,
    exportDatabags,
    iterateBlocks,
    Databag,
    SugarCoatedDatabag,
    asVal,
    SyntaxToken,
    visitTokens,
    asStr,
    isSimpleTemplate
} from './barbe-std/utils';


const container = readDatabagContainer()
onlyRunForLifecycleSteps(['pre_generate', 'generate', 'post_generate'])


function formatTokenAsDatabag(token: SyntaxToken, providerSuffix: string): Databag[] {
    let output: Databag[] = []
    //for all the blocks in the for_each block, create a new databag that represents it
    for(const pair of token.ObjectConst || []) {
        if(!pair.Value.Meta?.IsBlock) {
            continue
        }
        for (const item of pair.Value.ArrayConst || []) {
            const labels = item.Meta?.Labels || []
            output.push({
                //provider blocks are special because you can have several of them with identical type and labels
                //to make sure they all get formatted by the terraform formatter, we add a hidden suffix in parenthesis
                Type: pair.Key === 'provider' ? `provider${providerSuffix}` : pair.Key,
                Name: labels.length > 0 ? labels[0] : '',
                Labels: labels.slice(1),
                Value: item
            })
        }
    }
    return output
}

function forEachIterator(bag: Databag): (Databag | SugarCoatedDatabag)[] {
    if(!bag.Value) {
        return [];
    }
    const [block, _] = applyDefaults(container, bag.Value);
    if(!block[bag.Name]) {
        throw new Error(`for_each: cannot iterate over undefined property: '${bag.Name}'. You probably want to add it to the 'default' block`)
    }
    const arrToIterate: SyntaxToken[] = asVal(block[bag.Name]!)
    if(!Array.isArray(arrToIterate)) {
        throw new Error(`for_each: cannot iterate over non-array property: '${bag.Name}'`)
    }

    return arrToIterate.map((item, index): SugarCoatedDatabag[] => {
        if(!isSimpleTemplate(item)) {
            console.log('for_each: value is not a simple template: \'' + bag.Name + '\'')
            return []
        }
        const eachDotKeyValue = asStr(item)
        const replaceEachDotKeyRefs = (token: SyntaxToken): SyntaxToken | null => {
            if(token.Meta?.Labels?.some(str => str.includes('${each.key}'))) {
                //we re-launch the visit on the token because we need to replace the Meta but it
                //could still have so other each.key references inside
                return visitTokens({
                    ...token,
                    Meta: {
                        ...token.Meta,
                        Labels: token.Meta.Labels.map(str => str.replace('${each.key}', eachDotKeyValue))
                    }
                }, replaceEachDotKeyRefs)
            }
            if(token.Type === 'literal_value' &&
                typeof token.Value === 'string' && 
                token.Value.includes('${each.key}')
            ) {
                return {
                    ...token,
                    Value: token.Value.replace('${each.key}', eachDotKeyValue)
                }
            }
            if (token.Type === 'scope_traversal' && 
                !!token.Traversal &&
                token.Traversal.length === 2 &&
                token.Traversal[0].Name === 'each' &&
                token.Traversal[1].Name === 'key'
            ) {
                return {
                    Type: 'literal_value',
                    Value: eachDotKeyValue,
                }
            }
            return null
        }
        return formatTokenAsDatabag(visitTokens(bag.Value!, replaceEachDotKeyRefs), `${eachDotKeyValue}_${index}`)
    }).flat()
}

exportDatabags(iterateBlocks(container, FOR_EACH, forEachIterator).flat())
