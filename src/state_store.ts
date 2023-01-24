import { STATE_STORE } from "./barbe-sls-lib/consts"
import { applyDefaults, compileBlockParam, getAwsCreds, getGcpToken, isSimpleTemplate, preConfCloudResourceFactory } from './barbe-sls-lib/lib';
import { readDatabagContainer, exportDatabags, iterateBlocks, applyTransformers, Databag, SugarCoatedDatabag, asStr, appendToTemplate, asBlock, asSyntax, onlyRunForLifecycleSteps } from './barbe-std/utils';


const container = readDatabagContainer()
onlyRunForLifecycleSteps(['pre_generate', 'generate', 'post_generate'])


function stateStoreIterator(bag: Databag): (Databag | SugarCoatedDatabag)[] {
    if (!bag.Value) {
        return [];
    }
    const [block, namePrefix] = applyDefaults(container, bag.Value!)
    const cloudTerraform = preConfCloudResourceFactory(block, 'terraform')
    const bucketNameTemplate = appendToTemplate(namePrefix, ["state-store"])

    //if there is an env var or something in the name, this component might get called before the env var was baked in
    //TODO right now this will just fail silently if the user put a dynamic value in the bucket name
    const bucketName = isSimpleTemplate(bucketNameTemplate) ? asStr(bucketNameTemplate) : undefined

    const makeS3Store = (): (Databag | SugarCoatedDatabag)[] => {
        const dotS3 = compileBlockParam(block, 's3')
        if(!dotS3.existing_bucket && !bucketName) {
            return []
        }
        const awsCreds = getAwsCreds()
        let localDatabags: SugarCoatedDatabag[] = [
            cloudTerraform('', '', {
                backend: asBlock([() => ({
                    labels: ['s3'],
                    block: {
                        bucket: dotS3.existing_bucket || bucketName,
                        key: appendToTemplate(
                            dotS3.prefix || asSyntax(''),
                            [dotS3.key || appendToTemplate(namePrefix, ['state.tfstate'])]
                        ),
                        region: dotS3.region || 'us-east-1',
                    }
                })])
            }),
            {
                Name: "s3",
                Type: "barbe_state_store",
                Value: {
                    bucket: bucketName,
                    key: appendToTemplate(
                        dotS3.prefix || asSyntax(''),
                        [dotS3.key || appendToTemplate(namePrefix, ['barbe_state.json'])]
                    ),
                    region: dotS3.region || 'us-east-1',
                }
            }
        ]
        if(!dotS3.existing_bucket) {
            applyTransformers([{
                Type: 'buildkit_run_in_container',
                Name: `s3_bucket_creator_${bucketName}`,
                Value: {
                    display_name: `Creating state_store S3 bucket - ${bucketName}`,
                    no_cache: true,
                    dockerfile: `
                        FROM amazon/aws-cli:latest

                        ENV AWS_ACCESS_KEY_ID="${awsCreds.access_key_id}"
                        ENV AWS_SECRET_ACCESS_KEY="${awsCreds.secret_access_key}"
                        ENV AWS_SESSION_TOKEN="${awsCreds.session_token}"
                        ENV AWS_REGION="${os.getenv("AWS_REGION") || 'us-east-1'}"
                        ENV AWS_PAGER=""

                        RUN aws s3api create-bucket --bucket ${bucketName} --output json || true
                    `
                }
            }])
        }
        return localDatabags
    }

    const makeGcsStore = (): (Databag | SugarCoatedDatabag)[] => {
        const dotGCS = compileBlockParam(block, 'gcs')
        const gcpProject = dotGCS.project_id || block.project_id || os.getenv('CLOUDSDK_CORE_PROJECT')
        if(!dotGCS.existing_bucket && !bucketName) {
            return []
        }
        if(!isSimpleTemplate(gcpProject)) {
            return []
        }
        const gcpToken = getGcpToken()
        let localDatabags: SugarCoatedDatabag[] = [
            cloudTerraform('', '', {
                backend: asBlock([() => ({
                    labels: ['gcs'],
                    block: {
                        bucket: dotGCS.existing_bucket || bucketName,
                        prefix: appendToTemplate(
                            dotGCS.prefix || asSyntax(''),
                            [dotGCS.key || appendToTemplate(namePrefix, ['state.tfstate'])]
                        ),
                    }
                })])
            }),
            {
                Name: "gcs",
                Type: "barbe_state_store",
                Value: {
                    bucket: bucketName,
                    key: appendToTemplate(
                        dotGCS.prefix || asSyntax(''),
                        [dotGCS.key || appendToTemplate(namePrefix, ['barbe_state.json'])]
                    ),
                }
            }
        ]

        if(!dotGCS.existing_bucket) {
            applyTransformers([{
                Type: 'buildkit_run_in_container',
                Name: `gcs_bucket_creator_${bucketName}`,
                Value: {
                    display_name: `Creating state_store GCS bucket - ${bucketName}`,
                    no_cache: true,
                    dockerfile: `
                        FROM google/cloud-sdk:slim

                        ENV CLOUDSDK_AUTH_ACCESS_TOKEN="${gcpToken}"
                        ENV CLOUDSDK_CORE_DISABLE_PROMPTS=1

                        RUN gcloud storage buckets create gs://${bucketName} --project ${asStr(gcpProject)} --quiet || true
                    `
                }
            }])
        }
        return localDatabags
    }

    let databags: SugarCoatedDatabag[] = []
    if(block.s3) {
        databags.push(...makeS3Store())
    }
    if(block.gcs) {
        databags.push(...makeGcsStore())
    }
    return databags;
}

exportDatabags(iterateBlocks(container, STATE_STORE, stateStoreIterator).flat())