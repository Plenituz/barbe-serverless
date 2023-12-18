import {
    allApplySteps,
    allGenerateSteps,
    appendToTemplate, asFuncCall,
    asStr, asSyntax, asTemplate, asTraversal, asVal, asValArrayConst,
    barbeLifecycleStep, Databag,
    exportDatabags,
    importComponents,
    iterateBlocks,
    readDatabagContainer, statFile, SugarCoatedDatabag, SyntaxToken, throwStatement
} from "./barbe-std/utils";
import {AWS_ECR_REPOSITORY_WITH_IMAGE, AWS_FARGATE_SERVICE} from "./barbe-sls-lib/consts";
import {Pipeline, executePipelineGroup, pipeline, StepInput} from '../../anyfront/src/anyfront-lib/pipeline';
import {
    applyDefaults,
    compileBlockParam,
    getAwsCreds,
    preConfCloudResourceFactory,
    preConfTraversalTransform
} from "./barbe-sls-lib/lib";
import {isSuccess} from "./barbe-std/rpc";

const container = readDatabagContainer()

function awsEcsIterator(bag: Databag): Pipeline {
    const [block, namePrefix] = applyDefaults(container, bag.Value!);
    const cloudResource = preConfCloudResourceFactory(block, 'resource')
    const cloudData = preConfCloudResourceFactory(block, 'data')
    const cloudOutput = preConfCloudResourceFactory(block, 'output')
    const traversalTransform = preConfTraversalTransform(bag)

    const awsRegion = asStr(block.region || os.getenv("AWS_REGION") || 'us-east-1')
    const dotContainerImage = compileBlockParam(block, 'container_image')
    const hasProvidedImage = !!(block.image || dotContainerImage.image)
    const shouldCopyProvidedImage = asVal(block.copy_image || dotContainerImage.copy_image || asSyntax(true))
    let pipe = pipeline([])

    pipe.pushWithParams({ name: 'resources', lifecycleSteps: allGenerateSteps }, () => {
        let imageUrl: SyntaxToken
        let databags: SugarCoatedDatabag[] = []
        databags.push(
            cloudResource('aws_ecr_repository', `aws_ecr_wi_${bag.Name}_ecr_repository`, {
                name: appendToTemplate(namePrefix, [bag.Name]),
                force_delete: true
            }),
            cloudOutput('', `aws_ecr_wi_${bag.Name}_ecr_repository`, {
                value: asTraversal(`aws_ecr_repository.aws_ecr_wi_${bag.Name}_ecr_repository.repository_url`),
            }),
            traversalTransform(`aws_ecr_repository_with_image_transforms`, {
                [`aws_ecr_repository_with_image.${bag.Name}`]: `aws_ecr_repository.aws_ecr_wi_${bag.Name}_ecr_repository`,
            }),
        )
        if(hasProvidedImage && !shouldCopyProvidedImage) {
            //image is provided and we dont copy it, skip creating ecr altogether
            //note that this wil put constraints on the networking security/subnet stuff because fargate needs to pull the image
            // imageUrl = block.image || dotContainerImage.image!
        } else {
            const dontExpireImages = asVal(block.dont_expire_images || asSyntax(false))
            if(!dontExpireImages) {
                let policy: SyntaxToken
                if(block.policy) {
                    policy = block.policy
                } else if (block.max_untagged_count) {
                    policy = asFuncCall('jsonencode', [{
                        rules: [{
                            rulePriority: 1,
                            description: 'Expire untagged images',
                            selection: {
                                tagStatus: 'untagged',
                                countType: 'imageCountMoreThan',
                                countNumber: block.max_untagged_count,
                            },
                            action: {
                                type: 'expire',
                            },
                        }]
                    }])
                } else {
                    policy = asFuncCall('jsonencode', [{
                        rules: [{
                            rulePriority: 1,
                            description: 'Expire untagged images',
                            selection: {
                                tagStatus: 'untagged',
                                countType: 'sinceImagePushed',
                                countUnit: 'days',
                                countNumber: block.expire_untagged_after_days || 30,
                            },
                            action: {
                                type: 'expire',
                            },
                        }]
                    }])
                }
                databags.push(
                    cloudResource('aws_ecr_lifecycle_policy', `aws_ecr_wi_${bag.Name}_ecr_policy`, {
                        repository: asTraversal(`aws_ecr_repository.aws_ecr_wi_${bag.Name}_ecr_repository.name`),
                        policy,
                    })
                )
            }
        }
        return { databags }
    })
    pipe.pushWithParams({ name: 'deploy', lifecycleSteps: allApplySteps }, (input: StepInput) => {
        // const container = input.previousStepResult
        if(!container.terraform_execute_output?.default_apply) {
            return {}
        }
        const tfOutput = asValArrayConst(container.terraform_execute_output?.default_apply[0].Value!)
        const imageUrl = asStr(tfOutput.find(pair => asStr(pair.key) === `aws_ecr_wi_${bag.Name}_ecr_repository`).value)

        if(hasProvidedImage && shouldCopyProvidedImage) {
            //copy image to ecr (or the provided repo url in imageUrl)
            const providedImage = asStr(block.image || dotContainerImage.image!)
            //if the destination of the copy is our ecr repo, we need to login to it
            let loginCommand = ''
            if(!block.repository_url) {
                loginCommand = `RUN --mount=type=ssh,id=docker.sock,target=/var/run/docker.sock aws ecr get-login-password --region ${awsRegion} | docker login --username AWS --password-stdin ${imageUrl.split('/')[0]}`
            }
            const awsCreds = getAwsCreds()
            if(!awsCreds) {
                throwStatement(`aws_ecr_repository_with_image.${bag.Name} needs AWS credentials to build the image`)
            }
            const transforms = [{
                Type: 'buildkit_run_in_container',
                Name: `${bag.Name}_aws_ecr_wi_image_copy`,
                Value: {
                    display_name: `Image copy - aws_ecr_repository_with_image.${bag.Name}`,
                    no_cache: true,
                    dockerfile: `
                    FROM amazon/aws-cli:latest
                        
                    # https://forums.docker.com/t/docker-ce-stable-x86-64-repo-not-available-https-error-404-not-found-https-download-docker-com-linux-centos-7server-x86-64-stable-repodata-repomd-xml/98965
                    RUN yum install -y yum-utils && \
                        yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo && \
                        sed -i 's/$releasever/7/g' /etc/yum.repos.d/docker-ce.repo && \
                        yum install docker-ce-cli -y

                    ENV AWS_ACCESS_KEY_ID="${awsCreds.access_key_id}"
                    ENV AWS_SECRET_ACCESS_KEY="${awsCreds.secret_access_key}"
                    ENV AWS_SESSION_TOKEN="${awsCreds.session_token}"
                    ENV AWS_REGION="${asStr(block.region || os.getenv("AWS_REGION") || 'us-east-1')}"
                    ENV AWS_PAGER=""

                    RUN --mount=type=ssh,id=docker.sock,target=/var/run/docker.sock docker pull ${providedImage}
                    RUN --mount=type=ssh,id=docker.sock,target=/var/run/docker.sock docker tag ${providedImage} ${imageUrl}
                    ${loginCommand}
                    RUN --mount=type=ssh,id=docker.sock,target=/var/run/docker.sock docker push ${imageUrl}`,
                }
            }]
            return { transforms }
        }
        if(!hasProvidedImage) {
            const baseDir = asStr(dotContainerImage.build_from || '.')
            //TODO if dockerfile is not defined but there is a dockerfile in the repo, use that
            let dockerfileContent = asStr(block.dockerfile || dotContainerImage.dockerfile || throwStatement(`aws_ecr_repository_with_image.${bag.Name} needs a 'dockerfile' (path or file content) or 'image' property`))
            if(!dockerfileContent.includes('\n')) {
                const isFileResult = statFile(dockerfileContent)
                if(isSuccess(isFileResult)) {
                    if(isFileResult.result.isDir) {
                        throwStatement(`aws_ecr_repository_with_image.${bag.Name}.dockerfile path is a directory`)
                    }
                    dockerfileContent = os.file.readFile(dockerfileContent)
                }
            }
            //--build-arg JWT_STREAM_SECRET_KEY="${jwt_stream_secret_key}"
            const dotBuildArgs = compileBlockParam(dotContainerImage, 'build_args')
            const buildArgsStr = Object.entries(dotBuildArgs).map(([name, value]) => `--build-arg ${name}="${asStr(value!)}"`).join(' ')
            const preBuildCmd = asStr(dotContainerImage.pre_build_cmd || '') || ''
            const buildCmd = asStr(dotContainerImage.build_cmd || '') || `docker build -f __barbe_dockerfile -t ${bag.Name}ecrwibarbeimg ${buildArgsStr} .`
            const tagCmd = asStr(dotContainerImage.tag_cmd || '') || `docker tag ${bag.Name}ecrwibarbeimg:latest ${imageUrl}:latest`
            const loginCmd = asStr(dotContainerImage.login_cmd || '') || `aws ecr get-login-password --region ${awsRegion} | docker login --username AWS --password-stdin ${imageUrl.split('/')[0]}`
            const pushCmd = asStr(dotContainerImage.push_cmd || '') || `docker push ${imageUrl}:latest`

            const awsCreds = getAwsCreds()
            if(!awsCreds) {
                throwStatement(`aws_ecr_repository_with_image.${bag.Name} needs AWS credentials to build the image`)
            }
            const transforms = [{
                Type: 'buildkit_run_in_container',
                Name: `${bag.Name}_aws_ecr_repository_with_image_image_build`,
                Value: {
                    display_name: `Image build - aws_ecr_repository_with_image.${bag.Name}`,
                    no_cache: true,
                    input_files:{
                        '__barbe_dockerfile': dockerfileContent,
                    },
                    dockerfile: `
                    FROM amazon/aws-cli:latest
                    
                    # https://forums.docker.com/t/docker-ce-stable-x86-64-repo-not-available-https-error-404-not-found-https-download-docker-com-linux-centos-7server-x86-64-stable-repodata-repomd-xml/98965
                    RUN yum install -y yum-utils && \
                        yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo && \
                        sed -i 's/$releasever/7/g' /etc/yum.repos.d/docker-ce.repo && \
                        yum install docker-ce-cli -y

                    ENV AWS_ACCESS_KEY_ID="${awsCreds.access_key_id}"
                    ENV AWS_SECRET_ACCESS_KEY="${awsCreds.secret_access_key}"
                    ENV AWS_SESSION_TOKEN="${awsCreds.session_token}"
                    ENV AWS_REGION="${asStr(block.region || os.getenv("AWS_REGION") || 'us-east-1')}"
                    ENV AWS_PAGER=""
                    # this is in case people want to override the docker commands
                    ENV ECR_REPOSITORY="${imageUrl}"

                    COPY --from=src ./${baseDir} .
                    COPY --from=src __barbe_dockerfile __barbe_dockerfile
                    RUN --mount=type=ssh,id=docker.sock,target=/var/run/docker.sock ${preBuildCmd}
                    RUN --mount=type=ssh,id=docker.sock,target=/var/run/docker.sock ${buildCmd}
                    RUN --mount=type=ssh,id=docker.sock,target=/var/run/docker.sock ${tagCmd}

                    RUN --mount=type=ssh,id=docker.sock,target=/var/run/docker.sock ${loginCmd}
                    RUN --mount=type=ssh,id=docker.sock,target=/var/run/docker.sock ${pushCmd}
                `,
                }
            }]
            return { transforms }
        }
    })
    return pipe
}

executePipelineGroup(container, iterateBlocks(container, AWS_ECR_REPOSITORY_WITH_IMAGE, awsEcsIterator).flat())