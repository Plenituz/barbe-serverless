import { accumulateTokens, asStr, iterateAllBlocks, onlyRunForLifecycleSteps, readDatabagContainer, SyntaxToken, SugarCoatedDatabag, applyTransformers, uniq, lookupTraversal, exportDatabags } from '../barbe-std/utils';
import md5 from 'md5';
import { applyMixins, getAwsCreds } from '../barbe-sls-lib/lib';
import formatter_script from './formatter.template.js'

const container = readDatabagContainer()
onlyRunForLifecycleSteps(['pre_generate', 'generate', 'post_generate'])


function isSlsTraversal(token: SyntaxToken): boolean {
    return token.Type === 'scope_traversal' &&
        !!token.Traversal &&
        token.Traversal.length > 0 &&
        token.Traversal[0].Name === 'serverless_framework'
}

function isSlsFunc(token: SyntaxToken): boolean {
    return token.Type === 'function_call' &&
        token.FunctionName === 'serverless_framework'
}

function isSlsFuncParent(token: SyntaxToken): boolean {
    return token.Type === 'relative_traversal' &&
        !!token.Source &&
        isSlsFunc(token.Source!)
}

function isSlsRef(token: SyntaxToken): boolean {
    return isSlsTraversal(token) || isSlsFunc(token)
}

const allSlsRefs = iterateAllBlocks(container, (bag) => {
    if(!bag.Value) {
        return []
    }
    return accumulateTokens(bag.Value, isSlsRef)
}).flat()

if(allSlsRefs.length === 0) {
    quit()
}

const awsCreds = getAwsCreds()

const allSlsDirectories = allSlsRefs.map((token) => {
    if(isSlsTraversal(token)) {
        return '.'
    }
    const argLen = (token.FunctionArgs || []).length
    if(argLen === 0) {
        throw new Error('serverless_framework() requires 1 argument: the directory where the serverless framework project is located. If you want to use the root directory, you can use \'serverless_framework.something\' directly')
    }
    if(argLen > 1) {
        throw new Error('serverless_framework() used with more than 1 argument')
    }
    return asStr(token.FunctionArgs![0])
})
const uniqSlsDirectories = Array.from(new Set(allSlsDirectories))

const toExecute = uniqSlsDirectories.map(dir => {
    const dirHash = md5(dir)
    //TODO node + sls version selection
    const nodeVersion = '16'
    const slsVersion = 'latest'
    return {
        Type: 'buildkit_run_in_container',
        Name: `sls_framework_getter_${dirHash}`,
        Value: {
            display_name: `Reading sls framework - ${dir}`,
            input_files: {
                'formatter.js': applyMixins(formatter_script, { dirHash })
            },
            dockerfile: `
                FROM node:${nodeVersion}-alpine

                RUN npm install -g serverless@${slsVersion}

                COPY --from=src ./${dir} /src
                WORKDIR /src
                RUN rm -rf node_modules

                ENV AWS_ACCESS_KEY_ID="${awsCreds.access_key_id}"
                ENV AWS_SECRET_ACCESS_KEY="${awsCreds.secret_access_key}"
                ENV AWS_SESSION_TOKEN="${awsCreds.session_token}"
                ENV AWS_REGION="${os.getenv('AWS_REGION') || 'us-east-1'}"
                ENV SLS_WARNING_DISABLE="*"

                RUN serverless print --format json > sls_framework.json
                COPY --from=src formatter.js formatter.js
                RUN node formatter.js
            `,
            exported_files: {
                'sls_framework.json': `sls_framework_${dirHash}.json`,
            },
            read_back: [
                `sls_framework_${dirHash}.json`,
            ]
        }
    }
})

const result = applyTransformers(toExecute)

if(!result.sls_framework_getter_result) {
    quit()
}
let databags: SugarCoatedDatabag[] = []

const rootHash = md5('.')
if(rootHash in result.sls_framework_getter_result) {
    const allSlsTraversals = uniq(allSlsRefs.filter(isSlsTraversal), asStr)
    const baseObj = container.sls_framework_getter_result[rootHash][0].Value
    databags.push({
        Type: 'traversal_map',
        Name: 'sls_framework_root_traversal_map',
        Value: allSlsTraversals.map(traversal => ({
            [asStr(traversal)]: lookupTraversal(baseObj, traversal.Traversal!.slice(1), 'serverless_framework')
        }))
        .reduce((acc, cur) => Object.assign(acc, cur), {})
    })
}

const allSlsFuncParents = Array.from(new Set(iterateAllBlocks(container, (bag) => {
    if(!bag.Value) {
        return []
    }
    return accumulateTokens(bag.Value, isSlsFuncParent)
}).flat()))

databags.push(
    ...allSlsFuncParents.map((parent) => {
        const dir = asStr(parent.Source!.FunctionArgs![0])
        const dirHash = md5(dir)
        const baseObj = container.sls_framework_getter_result[dirHash][0].Value
        return {
            Type: 'token_map',
            Name: `sls_framework_${dirHash}_token_map`,
            Value: [{
                match: parent,
                replace_by: lookupTraversal(baseObj, parent.Traversal!, `serverless_framework("${dir}")`)
            }]
        }
    })
)

exportDatabags(databags)