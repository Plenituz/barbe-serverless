import { AWS_IAM_LAMBDA_ROLE, AWS_KINESIS_STREAM, AWS_FUNCTION, AWS_FARGATE_TASK, AWS_DYNAMODB, AWS_S3 } from './barbe-sls-lib/consts';
import { applyDefaults, compileGlobalNamePrefix, preConfCloudResourceFactory, preConfTraversalTransform } from './barbe-sls-lib/lib';
import { appendToTemplate, asBlock, Databag, exportDatabags, iterateBlocks, readDatabagContainer, SugarCoatedDatabag, SyntaxToken, asValArrayConst, asFuncCall, asTraversal, asTemplate, asVal, uniq, asStr, cloudResourceRaw, onlyRunForLifecycleSteps } from './barbe-std/utils';

const container = readDatabagContainer()
onlyRunForLifecycleSteps(['pre_generate', 'generate', 'post_generate'])

function lambdaRoleStatement(label: string, namePrefix: SyntaxToken) {
    let statements: any[] = [
        {
            Action: [
                "logs:CreateLogGroup",
                "logs:CreateLogStream",
            ],
            Effect: "Allow",
            Resource: asTemplate([
                'arn:',
                asTraversal('data.aws_partition.current.partition'),
                ':logs:*:',
                asTraversal('data.aws_caller_identity.current.account_id'),
                ':log-group:/aws/lambda/',
                ...((): any[] => {
                    if(!namePrefix.Parts || namePrefix.Parts.length === 0) {
                        return ["*:*"]
                    }
                    return [
                        ...namePrefix.Parts,
                        "*:*"
                    ]
                })()
            ])
        },
        {
            Action: 'logs:PutLogEvents',
            Effect: 'Allow',
            Resource: asTemplate([
                'arn:',
                asTraversal('data.aws_partition.current.partition'),
                ':logs:*:',
                asTraversal('data.aws_caller_identity.current.account_id'),
                ':log-group:/aws/lambda/',
                ...((): any[] => {
                    if (!namePrefix.Parts || namePrefix.Parts.length === 0) {
                        return ["*:*:*"]
                    }
                    return [
                        ...namePrefix.Parts,
                        "*:*:*"
                    ]
                })()
            ])
        }
    ]
    if (AWS_DYNAMODB in container) {
        statements.push({
            Action: 'dynamodb:*',
            Effect: 'Allow',
            Resource: Object.keys(container[AWS_DYNAMODB]).map((dynamodbName) => asTemplate([
                'arn:',
                asTraversal('data.aws_partition.current.partition'),
                ':dynamodb:*:',
                asTraversal('data.aws_caller_identity.current.account_id'),
                ':table/',
                asTraversal(`aws_dynamodb_table.${dynamodbName}_aws_dynamodb.name`),
                '*'
            ]))
        })
    }
    if(AWS_KINESIS_STREAM in container) {
        statements.push({
            Action: 'kinesis:*',
            Effect: 'Allow',
            Resource: Object.keys(container[AWS_KINESIS_STREAM]).map((kinesisName) => asTraversal(`aws_kinesis_stream.${kinesisName}_aws_kinesis_stream.arn`))
        })
    }
    if(AWS_S3 in container) {
        statements.push({
            Action: 's3:*',
            Effect: 'Allow',
            Resource: Object.keys(container[AWS_S3]).flatMap((s3Name) => [
                asTraversal(`aws_s3_bucket.${s3Name}_s3.arn`),
                asTemplate([
                    asTraversal(`aws_s3_bucket.${s3Name}_s3.arn`),
                    '*'
                ])
            ])
        })
    }
    if (AWS_FARGATE_TASK in container) {
        statements.push(
            {
                Action: 'ecs:RunTask',
                Effect: 'Allow',
                Resource: Object.keys(container[AWS_FARGATE_TASK]).map((fargateName) => asTemplate([
                    'arn:',
                    asTraversal('data.aws_partition.current.partition'),
                    ':ecs:*:',
                    asTraversal('data.aws_caller_identity.current.account_id'),
                    ':task-definition/',
                    appendToTemplate(namePrefix, [fargateName]),
                    '*'
                ]))
            },
            {
                Action: 'iam:PassRole',
                Effect: 'Allow',
                //TODO this will cause duplicate entries if 2 tasks are defined and they both have the same
                //execution role (which is the case most of the time since we use the account's default by default)
                //this doesnt prevent the template from working but it will cause duplicate entries in the policy
                Resource: [
                    ...Object.keys(container[AWS_FARGATE_TASK]).map((fargateName) => asTraversal(`local.__aws_fargate_task_${fargateName}_task_execution_role_arn`)),
                    asTemplate([
                        'arn:',
                        asTraversal('data.aws_partition.current.partition'),
                        ":iam::",
                        asTraversal('data.aws_caller_identity.current.account_id'),
                        ':role/',
                        namePrefix,
                        '*'
                    ])
                ]
            }
        )
    }
    if(AWS_IAM_LAMBDA_ROLE in container && label in container[AWS_IAM_LAMBDA_ROLE]) {
        const val = asVal(container[AWS_IAM_LAMBDA_ROLE][label][0].Value)
        if(val.statements) {
            statements.push(...asVal(val.statements))
        }
    }
    return statements
}

function defineRole(params: {
    cloudResourceFactory: (kind: string) => (type: string, name: string, value: any) => Databag,
    label: string,
    namePrefix: SyntaxToken,
    assumableBy?: SyntaxToken,
}) {
    const { cloudResourceFactory, label, namePrefix, assumableBy } = params
    const cloudResource = cloudResourceFactory('resource')
    const cloudData = cloudResourceFactory('data')

    let principalService: (SyntaxToken | string)[] = []
    if(assumableBy) {
        principalService.push(...asValArrayConst(assumableBy))
    }
    if (AWS_FUNCTION in container) {
        principalService.push('lambda.amazonaws.com')
    }
    if (AWS_FARGATE_TASK in container) {
        principalService.push('ecs-tasks.amazonaws.com')
    }
    if(principalService.length === 0) {
        principalService.push('lambda.amazonaws.com')
    }

    return [
        {
            Type: 'traversal_transform',
            Name: `${label}_iam_traversal_transform`,
            Value: {
                [`aws_iam_lambda_role.${label}`]: `aws_iam_role.${label}_lambda_role`
            }
        },
        //these are duplicated if aws_base is included, but useful if the component is imported standalone
        cloudData("aws_caller_identity", "current", {}),
        cloudData("aws_partition", "current", {}),
        cloudResource('aws_iam_role', `${label}_lambda_role`, {
            name: appendToTemplate(namePrefix, [`${label}-role`]),
            assume_role_policy: JSON.stringify({
                Version: "2012-10-17",
                Statement: [
                    {
                        Action: "sts:AssumeRole",
                        Effect: "Allow",
                        Sid: "",
                        Principal: {
                            Service: principalService
                        }
                    }
                ]
            }),
        }),
        cloudResource('aws_iam_policy', `${label}_lambda_role_policy`, {
            name: appendToTemplate(namePrefix, [`${label}-role-policy`]),
            description: '',
            policy: asFuncCall('jsonencode', [{
                Version: "2012-10-17",
                Statement: lambdaRoleStatement(label, namePrefix)
            }])
        }),
        cloudResource('aws_iam_role_policy_attachment', `${label}_lambda_role_policy_attachment`, {
            role: asTraversal(`aws_iam_role.${label}_lambda_role.name`),
            policy_arn: asTraversal(`aws_iam_policy.${label}_lambda_role_policy.arn`)
        })
    ]
}

function awsIamLambdaRoleIterator(bag: Databag): (Databag | SugarCoatedDatabag)[] {
    if (!bag.Value) {
        return [];
    }
    if(!bag.Name || bag.Name.length === 0) {
        //unamed blocks are for the default role handled in the other function
        return []
    }
    const [block, namePrefix] = applyDefaults(container, bag.Value!);
    const cloudResourceFactory = (kind: string) => preConfCloudResourceFactory(block, kind)

    return defineRole({
        cloudResourceFactory,
        label: bag.Name,
        namePrefix: namePrefix,
        assumableBy: block.assumable_by,
    })
}

const globalNamePrefix = compileGlobalNamePrefix(container)
let allDirectories = [
    ...iterateBlocks(container, AWS_FUNCTION, (bag) => {
        const [block, _] = applyDefaults(container, bag.Value!);
        return block.cloudresource_dir || '.'
    }),
    ...iterateBlocks(container, AWS_FARGATE_TASK, (bag) => {
        const [block, _] = applyDefaults(container, bag.Value!);
        return block.cloudresource_dir || '.'
    })
]
.filter((dir) => dir)
allDirectories = uniq(allDirectories, asStr)
const defaultRoles = allDirectories.map((dir) => {
    const dirStr = asStr(dir)
    const cloudResourceFactory = (kind: string) => (type: string, name: string, value: any) => cloudResourceRaw({
        kind,
        dir: dirStr === '.' ? undefined : dirStr,
        type,
        name,
        value,
    })

    return defineRole({
        cloudResourceFactory,
        label: 'default',
        namePrefix: dirStr === '.' ? globalNamePrefix : appendToTemplate(globalNamePrefix, [`${dirStr}-`]),
    })
}).flat()

exportDatabags([
    ...defaultRoles,
    ...iterateBlocks(container, AWS_IAM_LAMBDA_ROLE, awsIamLambdaRoleIterator).flat()
])

