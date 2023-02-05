import { TERRAFORM_EMPTY_EXECUTE, TERRAFORM_EXECUTE, TERRAFORM_EXECUTE_GET_OUTPUT } from "./barbe-sls-lib/consts";
import { asStr, asVal, Databag, exportDatabags, iterateBlocks, onlyRunForLifecycleSteps, readDatabagContainer, SugarCoatedDatabag, asValArrayConst, barbeOutputDir, applyTransformers } from './barbe-std/utils';
import { getAwsCreds, getGcpToken } from './barbe-sls-lib/lib';

const container = readDatabagContainer()
const outputDir = barbeOutputDir()
onlyRunForLifecycleSteps(['apply', 'destroy'])

function removeBarbeOutputPrefix(path: string): string {
    if(path.startsWith(outputDir)) {
        return path.slice(outputDir.length)
    }
    if(path.startsWith(`${outputDir}/`)) {
        return path.slice(outputDir.length + 1)
    }
    return path
}

function terraformExecuteIterator(bag: Databag): (Databag | SugarCoatedDatabag)[] {
    if(!bag.Value) {
        return [];
    }
    const block = asVal(bag.Value)
    const mode = asStr(block.mode || 'apply')
    if(mode !== 'apply' && mode !== 'destroy') {
        throw new Error(`Invalid mode '${mode}' for terraform_execute block. Valid values are 'apply' and 'destroy'`)
    }

    const awsCreds = getAwsCreds()
    const gcpToken = getGcpToken(true)
    const dir = asStr(block.dir)
    let readBack: string | null = null
    if(mode === 'apply') {
        readBack = removeBarbeOutputPrefix(`${dir}/terraform_output_${bag.Name}.json`)
    }
    let vars = ''
    if(block.variable_values) {
        vars = asValArrayConst(block.variable_values).map((pair) => `-var="${asStr(pair.key)}=${asStr(pair.value)}"`).join(' ')
    }

    return [{
        Type: 'buildkit_run_in_container',
        Name: `terraform_${mode}_${bag.Name}`,
        Value: {
            require_confirmation: block.require_confirmation || null,
            display_name: block.display_name || null,
            message: block.message || null,
            no_cache: true,
            excludes: [
                '.terraform',
                '.terraform.lock.hcl'
            ],
            dockerfile: `
                FROM hashicorp/terraform:latest
                RUN apk add jq

                COPY --from=src ./${dir} /src
                WORKDIR /src

                ENV GOOGLE_OAUTH_ACCESS_TOKEN="${gcpToken}"

                ENV AWS_ACCESS_KEY_ID="${awsCreds?.access_key_id}"
                ENV AWS_SECRET_ACCESS_KEY="${awsCreds?.secret_access_key}"
                ENV AWS_SESSION_TOKEN="${awsCreds?.session_token}"
                ENV AWS_REGION="${os.getenv("AWS_REGION") || 'us-east-1'}"

                RUN terraform init -input=false
                RUN terraform ${mode} -auto-approve -input=false ${vars}
                RUN terraform output -json > terraform_output.json
                RUN cat terraform_output.json | jq 'to_entries | map({ "key": .key, "value": .value.value }) | { "terraform_execute_output": { "${bag.Name}": . } }' > terraform_output_${bag.Name}.json

                RUN touch tmp
                RUN touch terraform.tfstate
                RUN touch .terraform.lock.hcl
                RUN touch .terraform`,
            read_back: readBack,
            exported_files: mode === 'destroy' ? 'tmp' : {
                'terraform.tfstate': removeBarbeOutputPrefix(`${dir}/terraform.tfstate`),
                [`terraform_output_${bag.Name}.json`]: removeBarbeOutputPrefix(`${dir}/terraform_output_${bag.Name}.json`)
            }
        }
    }]
}


function terraformEmptyExecuteIterator(bag: Databag): (Databag | SugarCoatedDatabag)[] {
    if(!bag.Value) {
        return [];
    }
    const block = asVal(bag.Value)
    const mode = asStr(block.mode || 'apply')
    if(mode !== 'apply' && mode !== 'destroy') {
        throw new Error(`Invalid mode '${mode}' for terraform_execute block. Valid values are 'apply' and 'destroy'`)
    }

    const awsCreds = getAwsCreds()
    const gcpToken = getGcpToken(true)
    const dir = asStr(block.dir)
    let vars = ''
    if(block.variable_values) {
        vars = asValArrayConst(block.variable_values).map((pair) => `-var="${asStr(pair.key)}=${asStr(pair.value)}"`).join(' ')
    }

    return [{
        Type: 'buildkit_run_in_container',
        Name: `terraform_empty_${mode}_${bag.Name}`,
        Value: {
            require_confirmation: block.require_confirmation || null,
            display_name: block.display_name || null,
            message: block.message || null,
            no_cache: true,
            input_files: {
                'tf_output.json': JSON.stringify({
                    terraform_empty_execute_output: {
                        [bag.Name]: true
                    }
                }),
                'template.tf.json': asStr(block.template_json)
            },
            dockerfile: `
                FROM hashicorp/terraform:latest

                ENV GOOGLE_OAUTH_ACCESS_TOKEN="${gcpToken}"

                ENV AWS_ACCESS_KEY_ID="${awsCreds?.access_key_id}"
                ENV AWS_SECRET_ACCESS_KEY="${awsCreds?.secret_access_key}"
                ENV AWS_SESSION_TOKEN="${awsCreds?.session_token}"
                ENV AWS_REGION="${os.getenv("AWS_REGION") || 'us-east-1'}"

                COPY --from=src template.tf.json template.tf.json
                RUN terraform init -input=false
                RUN terraform ${mode} -auto-approve -input=false ${vars}

                COPY --from=src tf_output.json tf_output.json`,
            read_back: [
                `tf_empty_output_${bag.Name}.json`
            ],
            exported_files: {
                'tf_output.json': `tf_empty_output_${bag.Name}.json`
            }
        }
    }]
}

function terraformExecuteGetOutputIterator(bag: Databag): (Databag | SugarCoatedDatabag)[] {
    if(!bag.Value) {
        return [];
    }
    const block = asVal(bag.Value)

    const awsCreds = getAwsCreds()
    const gcpToken = getGcpToken(true)
    const dir = asStr(block.dir)
    let vars = ''
    if(block.variable_values) {
        vars = asValArrayConst(block.variable_values).map((pair) => `-var="${asStr(pair.key)}=${asStr(pair.value)}"`).join(' ')
    }

    return [{
        Type: 'buildkit_run_in_container',
        Name: `terraform_get_output_${bag.Name}`,
        Value: {
            display_name: block.display_name || null,
            message: block.message || null,
            no_cache: true,
            dockerfile: `
                FROM hashicorp/terraform:latest
                RUN apk add jq

                COPY --from=src ./${dir} /src
                WORKDIR /src

                ENV GOOGLE_OAUTH_ACCESS_TOKEN="${gcpToken}"

                ENV AWS_ACCESS_KEY_ID="${awsCreds?.access_key_id}"
                ENV AWS_SECRET_ACCESS_KEY="${awsCreds?.secret_access_key}"
                ENV AWS_SESSION_TOKEN="${awsCreds?.session_token}"
                ENV AWS_REGION="${os.getenv("AWS_REGION") || 'us-east-1'}"

                RUN terraform init -input=false
                RUN terraform output -json > terraform_output.json
                RUN cat terraform_output.json | jq 'to_entries | map({ "key": .key, "value": .value.value }) | { "terraform_execute_output": { "${bag.Name}": . } }' > terraform_output_${bag.Name}.json
                RUN touch terraform_output_${bag.Name}.json`,
            read_back: [
                removeBarbeOutputPrefix(`${dir}/terraform_output_${bag.Name}.json`)
            ],
            exported_files: {
                [`terraform_output_${bag.Name}.json`]: removeBarbeOutputPrefix(`${dir}/terraform_output_${bag.Name}.json`)
            }
        }
    }]
}

exportDatabags(applyTransformers([
    ...iterateBlocks(container, TERRAFORM_EXECUTE, terraformExecuteIterator).flat(),
    ...iterateBlocks(container, TERRAFORM_EXECUTE_GET_OUTPUT, terraformExecuteGetOutputIterator).flat(),
    ...iterateBlocks(container, TERRAFORM_EMPTY_EXECUTE, terraformEmptyExecuteIterator).flat()
]))