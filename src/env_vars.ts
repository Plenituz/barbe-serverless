import { readDatabagContainer, onlyRunForLifecycleSteps, iterateAllBlocks, SyntaxToken, accumulateTokens, asStr, SugarCoatedDatabag, exportDatabags } from './barbe-std/utils';


const container = readDatabagContainer()
onlyRunForLifecycleSteps(['pre_generate', 'post_generate'])

function isEnvTraversal(token: SyntaxToken): boolean {
    return token.Type === 'scope_traversal' &&
        !!token.Traversal &&
        token.Traversal.length === 2 &&
        token.Traversal[0].Name === 'env'
}

const allVarNames = iterateAllBlocks(container, (bag) => {
    if(!bag.Value) {
        return []
    }
    const allEnvTraversals = accumulateTokens(bag.Value, isEnvTraversal)
    const varNames = allEnvTraversals.map((token) => {
        if(!token.Traversal![1].Name) {
            throw new Error(`malformatted env traversal: '${asStr(token)}'`)
        }
        return token.Traversal![1].Name
    })
    return varNames
}).flat()

const uniqueVarNames = Array.from(new Set(allVarNames))

const databag: SugarCoatedDatabag = {
    Type: 'traversal_map',
    Name: 'env_traversal_transform',
    Value: uniqueVarNames.reduce((acc, varName) => {
        const envVal = os.getenv(varName)
        if(envVal === undefined) {
            throw new Error(`environment variable '${varName}' not found`)
        }
        acc[`env.${varName}`] = envVal
        return acc
    }, {})
}

exportDatabags([databag])
