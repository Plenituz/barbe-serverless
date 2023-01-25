import { onlyRunForLifecycleSteps, readDatabagContainer, iterateAllBlocks, accumulateTokens, asStr, uniq, SyntaxToken, asVal, Traverse, lookupTraversal, exportDatabags } from './barbe-std/utils';

const container = readDatabagContainer()
onlyRunForLifecycleSteps(['pre_generate', 'generate', 'post_generate'])

function isDefaultTraversal(token: SyntaxToken): boolean {
    return token.Type === 'scope_traversal' &&
        !!token.Traversal &&
        token.Traversal.length > 0 &&
        token.Traversal[0].Name === 'default'
}

const allDefaultTraversals = uniq(iterateAllBlocks(container, (bag) => {
    if(!bag.Value) {
        return []
    }
    return accumulateTokens(bag.Value, isDefaultTraversal)
}).flat(), asStr)

if(allDefaultTraversals.length === 0) {
    quit()
}
if(container.default === undefined) {
    throw new Error(`found ${allDefaultTraversals.length} references to default (for example '${asStr(allDefaultTraversals[0])}'), but no default block was found`)
}

const databag = {
    Type: 'traversal_map',
    Name: 'defaults_traversal_map',
    Value: allDefaultTraversals.map(traversal => {
        let baseObj: SyntaxToken | undefined
        let adjustedTraversal: Traverse[] | undefined
        let debugStr: string | undefined
        if(
            (traversal.Traversal!.length === 1 || 
            (traversal.Traversal?.length === 2 && traversal.Traversal[1].Type === 'attr')) &&
            container.default['']
        ) {
            baseObj = container.default[''][0].Value
            adjustedTraversal = traversal.Traversal!.slice(1)
            debugStr = 'default'
        } else if(
            traversal.Traversal![1].Type === 'attr' && 
            (traversal.Traversal![1].Name! in container.default)
        ) {
            baseObj = container.default[traversal.Traversal![1].Name!][0].Value
            adjustedTraversal = traversal.Traversal!.slice(2)
            debugStr = `default.${traversal.Traversal![1].Name!}`
        } else if(container.default['']) {
            baseObj = container.default[''][0].Value
            adjustedTraversal = traversal.Traversal!.slice(1)
            debugStr = 'default'
        }
        if(!baseObj || !adjustedTraversal || !debugStr) {
            throw new Error(`reference to default block '${asStr(traversal)}' could not be resolved`)
        }
        return {
            [asStr(traversal)]: lookupTraversal(baseObj, adjustedTraversal, debugStr)
        }
    })
    .reduce((acc, cur) => Object.assign(acc, cur), {})
}

exportDatabags([databag])