import { readDatabagContainer, onlyRunForLifecycleSteps, SyntaxToken, iterateAllBlocks, accumulateTokens, asStr, SugarCoatedDatabag, applyTransformers, lookupTraversal, exportDatabags } from '../barbe-std/utils';
import { formatStrForScript, getAwsCreds } from '../barbe-sls-lib/lib';
import format_output from './format_output.py'
import format_template from './format_template.py'

const container = readDatabagContainer()
onlyRunForLifecycleSteps(['pre_generate', 'generate', 'post_generate'])

function isCfOutputToken(token: SyntaxToken): boolean {
    return token.Type === 'relative_traversal' &&
        !!token.Traversal &&
        token.Traversal.length > 0 &&
        token.Traversal[0].Name === 'output' && 
        token.Source?.Type === 'function_call'
}

function isCfTemplateToken(token: SyntaxToken): boolean {
    return token.Type === 'relative_traversal' &&
        !!token.Traversal &&
        token.Traversal.length > 0 &&
        token.Traversal[0].Name === 'resources' && 
        token.Source?.Type === 'function_call'
}

function extractStackName(token: SyntaxToken): string {
    const argLen = (token.Source?.FunctionArgs || []).length
    if(argLen === 0) {
        throw new Error('cloudformation() requires 1 argument: the name of the cloudformation stack')
    }
    if (argLen > 1) {
        throw new Error('cloudformation() used with more than 1 argument')
    }
    return asStr(token.Source!.FunctionArgs![0])
}

const allCfOutputTokens = iterateAllBlocks(container, (bag) => {
    if(!bag.Value) {
        return []
    }
    return accumulateTokens(bag.Value, isCfOutputToken)
}).flat()

const allCfTemplateTokens = iterateAllBlocks(container, (bag) => {
    if(!bag.Value) {
        return []
    }
    return accumulateTokens(bag.Value, isCfTemplateToken)
}).flat()

const allCfOutputStackNames = Array.from(new Set(allCfOutputTokens.map(extractStackName)))
const allCfTemplateStackNames = Array.from(new Set(allCfTemplateTokens.map(extractStackName)))

if(allCfOutputStackNames.length === 0 && allCfTemplateStackNames.length === 0) {
    quit()
}

const awsCreds = getAwsCreds()

const toExecute: SugarCoatedDatabag[] = [
    ...allCfOutputStackNames.map(stackName => ({
        Type: 'buildkit_run_in_container',
        Name: `cloudformation_output_getter_${stackName}`,
        Value: {
            dockerfile: `
            FROM amazon/aws-cli:latest

            ENV AWS_ACCESS_KEY_ID="${awsCreds.access_key_id}"
            ENV AWS_SECRET_ACCESS_KEY="${awsCreds.secret_access_key}"
            ENV AWS_SESSION_TOKEN="${awsCreds.session_token}"
            ENV AWS_REGION="${os.getenv('AWS_REGION') || 'us-east-1'}"
            ENV AWS_PAGER=""

            RUN aws cloudformation describe-stacks --stack-name ${stackName} --output json > cloudformation_output.json
            RUN printf ${formatStrForScript(format_output, { stackName })} > formatter.py
            RUN python formatter.py`,
            display_name: `Reading Cloudformation output - ${stackName}`,
            no_cache: true,
            exported_files: {
                'cloudformation_output.json': `cloudformation_output_${stackName}.json`
            },
            read_back: [
                `cloudformation_output_${stackName}.json`
            ]
        }
    })),

    ...allCfTemplateStackNames.map(stackName => ({
        Type: 'buildkit_run_in_container',
        Name: `cloudformation_output_getter_${stackName}`,
        Value: {
            dockerfile: `
            FROM amazon/aws-cli:latest

            ENV AWS_ACCESS_KEY_ID="${awsCreds.access_key_id}"
            ENV AWS_SECRET_ACCESS_KEY="${awsCreds.secret_access_key}"
            ENV AWS_SESSION_TOKEN="${awsCreds.session_token}"
            ENV AWS_REGION="${os.getenv('AWS_REGION') || 'us-east-1'}"
            ENV AWS_PAGER=""

            RUN aws cloudformation get-template --stack-name ${stackName} --output json > cloudformation_resources.json
            RUN printf ${formatStrForScript(format_template, { stackName })} > formatter.py
            RUN python formatter.py`,
            display_name: `Reading Cloudformation template - ${stackName}`,
            no_cache: true,
            exported_files: {
                'cloudformation_resources.json': `cloudformation_resources_${stackName}.json`
            },
            read_back: [
                `cloudformation_resources_${stackName}.json`
            ]
        }
    })),
]

const result = applyTransformers(toExecute)
let databags: SugarCoatedDatabag[] = []

if(result.cloudformation_resources_getter_result) {
    databags.push(
        ...allCfTemplateTokens.map(token => {
            const stackName = extractStackName(token)
            if(!(stackName in result.cloudformation_resources_getter_result)) {
                throw new Error(`Could not find cloudformation resources for stack ${stackName}`)
            }
            const root = result.cloudformation_resources_getter_result[stackName][0].Value
            if(!root) {
                throw new Error(`Could not find cloudformation resources for stack ${stackName}`)
            }

            return [{
                Type: 'token_map',
                Name: `cloudformation_resources_${stackName}_token_map`,
                Value: [{
                    match: token,
                    replace_by: lookupTraversal(root, token.Traversal!.slice(1), `cloudformation("${stackName}").resources`)
                }]
            }]
        }).flat()
    )
}

if(result.cloudformation_output_getter_result) {
    databags.push(
        ...allCfOutputTokens.map(token => {
            const stackName = extractStackName(token)
            if(!(stackName in result.cloudformation_output_getter_result)) {
                throw new Error(`Could not find cloudformation output for stack ${stackName}`)
            }
            const root = result.cloudformation_output_getter_result[stackName][0].Value
            if(!root) {
                throw new Error(`Could not find cloudformation resources for stack ${stackName}`)
            }

            return [{
                Type: 'token_map',
                Name: `cloudformation_output_${stackName}_token_map`,
                Value: [{
                    match: token,
                    replace_by: lookupTraversal(root, token.Traversal!.slice(1), `cloudformation("${stackName}").output`)
                }]
            }]
        }).flat()
    )
}

exportDatabags(databags)