import {
    allGenerateSteps,
    appendToTemplate, asFuncCall,
    asStr, asSyntax, asTemplate, asTraversal, asVal, asValArrayConst,
    barbeOutputDir, Databag,
    iterateBlocks,
    readDatabagContainer, statFile, SugarCoatedDatabag, SyntaxToken, throwStatement
} from "./barbe-std/utils";
import {autoDeleteMissingTfState, prependTfStateFileName} from "../../anyfront/src/anyfront-lib/lib";
import {AWS_ECR_REPOSITORY_WITH_IMAGE, TERRAFORM_EXECUTE_URL} from "./barbe-sls-lib/consts";
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
    const dir = `aws_ecr_repository_with_image_${bag.Name}`
    const bagPreconf = {
        dir,
        id: dir
    }
    const cloudResource = preConfCloudResourceFactory(block, 'resource', undefined, bagPreconf)
    const cloudOutput = preConfCloudResourceFactory(block, 'output', undefined, bagPreconf)
    const cloudTerraform = preConfCloudResourceFactory(block, 'terraform', undefined, bagPreconf)
    const mainCloudData = preConfCloudResourceFactory(block, 'data', block.repository_url ? {
        provider: asTraversal(`aws.${dir}`),
    } : undefined)
    const traversalTransform = preConfTraversalTransform(bag)

    const awsRegion = asStr(block.region || os.getenv("AWS_REGION") || 'us-east-1')
    const dotContainerImage = compileBlockParam(block, 'container_image')
    const providedImage = block.image || dotContainerImage.image
    const hasProvidedImage = !!providedImage
    const shouldCopyProvidedImage = asVal(block.copy_image || dotContainerImage.copy_image || asSyntax(true))
    const useProvidedImage = hasProvidedImage && !shouldCopyProvidedImage
    const managesRepository = !useProvidedImage && !block.repository_url
    const imageUrl = useProvidedImage ? providedImage! : block.repository_url || asTemplate([
        asTraversal('data.aws_caller_identity.current.account_id'),
        '.dkr.ecr.',
        awsRegion,
        '.amazonaws.com/',
        appendToTemplate(namePrefix, [bag.Name]),
    ])
    let pipe = pipeline([])

    pipe.pushWithParams({ name: 'resources', lifecycleSteps: allGenerateSteps }, () => {
        let databags: SugarCoatedDatabag[] = []
        if(managesRepository) {
            databags.push(
                cloudResource('aws_ecr_repository', `aws_ecr_wi_${bag.Name}_ecr_repository`, {
                    name: appendToTemplate(namePrefix, [bag.Name]),
                    force_delete: true,
                }),
                cloudOutput('', `aws_ecr_wi_${bag.Name}_ecr_repository_url`, {
                    value: asTraversal(`aws_ecr_repository.aws_ecr_wi_${bag.Name}_ecr_repository.repository_url`),
                }),
                cloudOutput('', `aws_ecr_wi_${bag.Name}_ecr_repository_name`, {
                    value: asTraversal(`aws_ecr_repository.aws_ecr_wi_${bag.Name}_ecr_repository.name`),
                }),
            )
            if(container['cr_[terraform]']) {
                databags.push(cloudTerraform('', '', prependTfStateFileName(container['cr_[terraform]'][''][0].Value!, `_${AWS_ECR_REPOSITORY_WITH_IMAGE}_${bag.Name}`)))
            }
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
        if(!useProvidedImage) {
            let repositoryName = appendToTemplate(namePrefix, [bag.Name])
            let registryId: SyntaxToken | undefined
            if(block.repository_url) {
                const repositoryParts = asFuncCall('regex', [
                    '^([0-9]+)\\.dkr\\.ecr\\.([^.]+)\\.[^/]+/(.+)$',
                    imageUrl,
                ])
                registryId = asFuncCall('element', [repositoryParts, 0])
                repositoryName = asFuncCall('element', [repositoryParts, 2])
                const mainCloudProvider = preConfCloudResourceFactory(block, 'provider', undefined, {
                    id: dir,
                })
                databags.push(
                    mainCloudProvider('', 'aws', {
                        alias: dir,
                        region: asFuncCall('element', [repositoryParts, 1]),
                    }),
                )
            }
            databags.push(
                mainCloudData('aws_ecr_image', `aws_ecr_wi_${bag.Name}_ecr_image`, {
                    repository_name: repositoryName,
                    registry_id: registryId,
                    image_tag: 'latest',
                }),
                traversalTransform(`aws_ecr_repository_with_image_transforms`, {
                    [`aws_ecr_repository_with_image.${bag.Name}.latest_image_digest`]: `data.aws_ecr_image.aws_ecr_wi_${bag.Name}_ecr_image.image_digest`,
                }),
            )
        }
        databags.push(
            {
                Type: 'traversal_map',
                Name: 'aws_ecr_repository_with_image_map',
                Value: {
                    [`aws_ecr_repository_with_image.${bag.Name}.repository_url`]: imageUrl,
                    [`aws_ecr_repository_with_image.${bag.Name}.image_uri`]: useProvidedImage ? imageUrl : asTemplate([
                        imageUrl,
                        '@',
                        asTraversal(`data.aws_ecr_image.aws_ecr_wi_${bag.Name}_ecr_image.image_digest`)
                    ]),
                }
            }
        )
        return { databags }
    })
    if(useProvidedImage || (block.skip_build && asVal(block.skip_build))) {
        return pipe
    }
    pipe.pushWithParams({ name: 'deploy_repo', lifecycleSteps: ['pre_do'] }, (input: StepInput) => {
        if(!managesRepository) {
            return
        }
        const imports = [{
            name: 'aws_ecr_repository_with_image_apply',
            url: TERRAFORM_EXECUTE_URL,
            input: [{
                Type: 'terraform_execute',
                Name: `aws_ecr_repository_with_image_${bag.Name}`,
                Value: {
                    display_name: `Terraform apply - aws_ecr_repository_with_image.${bag.Name}`,
                    mode: 'apply',
                    dir: `${barbeOutputDir()}/${dir}`,
                }
            }]
        }]
        return { imports }
    })
    pipe.pushWithParams({ name: 'build_img', lifecycleSteps: ['pre_do'] }, (input: StepInput) => {
        let destinationUrl: string
        if(block.repository_url) {
            destinationUrl = asStr(block.repository_url)
        } else {
            if(!input.previousStepResult.terraform_execute_output?.[`aws_ecr_repository_with_image_${bag.Name}`]) {
                return {}
            }
            const tfOutput = asValArrayConst(input.previousStepResult.terraform_execute_output[`aws_ecr_repository_with_image_${bag.Name}`][0].Value!)
            destinationUrl = asStr(tfOutput.find(pair => asStr(pair.key) === `aws_ecr_wi_${bag.Name}_ecr_repository_url`).value)
        }
        const repositoryRegion = destinationUrl.split('/')[0].split('.')[3]

        if(hasProvidedImage && shouldCopyProvidedImage) {
            const sourceImage = asStr(providedImage!)
            const loginCommand = `RUN --mount=type=ssh,id=docker.sock,target=/var/run/docker.sock aws ecr get-login-password --region ${repositoryRegion} | docker login --username AWS --password-stdin ${destinationUrl.split('/')[0]}`
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
                    ENV AWS_REGION="${repositoryRegion}"
                    ENV AWS_PAGER=""

                    RUN --mount=type=ssh,id=docker.sock,target=/var/run/docker.sock docker pull ${sourceImage}
                    RUN --mount=type=ssh,id=docker.sock,target=/var/run/docker.sock docker tag ${sourceImage} ${destinationUrl}:latest
                    ${loginCommand}
                    RUN --mount=type=ssh,id=docker.sock,target=/var/run/docker.sock docker push ${destinationUrl}:latest`,
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
            const buildPlatform = asStr(dotContainerImage.build_platform || '')
            const buildCmd = asStr(dotContainerImage.build_cmd || '') || `docker build ${buildPlatform ? '--platform ' + buildPlatform : ''} -f __barbe_dockerfile -t ${bag.Name}ecrwibarbeimg ${buildArgsStr} .`
            const tagCmd = asStr(dotContainerImage.tag_cmd || '') || `docker tag ${bag.Name}ecrwibarbeimg:latest ${destinationUrl}:latest`
            const loginCmd = asStr(dotContainerImage.login_cmd || '') || `aws ecr get-login-password --region ${repositoryRegion} | docker login --username AWS --password-stdin ${destinationUrl.split('/')[0]}`
            const pushCmd = asStr(dotContainerImage.push_cmd || '') || `docker push ${destinationUrl}:latest`

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
                    ENV AWS_REGION="${repositoryRegion}"
                    ENV AWS_PAGER=""
                    # this is in case people want to override the docker commands
                    ENV ECR_REPOSITORY="${destinationUrl}"

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
    pipe.pushWithParams({ name: 'tf_destroy', lifecycleSteps: ['destroy'] }, () => {
        if(!managesRepository) {
            return
        }
        const imports = [{
            name: 'aws_ecr_repository_with_image_destroy',
            url: TERRAFORM_EXECUTE_URL,
            input: [{
                Type: 'terraform_execute',
                Name: `aws_ecr_repository_with_image_destroy_${bag.Name}`,
                Value: {
                    display_name: `Terraform destroy - aws_ecr_repository_with_image.${bag.Name}`,
                    mode: 'destroy',
                    dir: `${barbeOutputDir()}/${dir}`,
                }
            }]
        }]
        return { imports }
    })
    return pipe
}

executePipelineGroup(container, [
    ...iterateBlocks(container, AWS_ECR_REPOSITORY_WITH_IMAGE, awsEcsIterator).flat(),
    autoDeleteMissingTfState(container, AWS_ECR_REPOSITORY_WITH_IMAGE),
])
