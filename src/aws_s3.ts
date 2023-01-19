import { AWS_FUNCTION, EVENT_S3, AWS_S3 } from './barbe-sls-lib/consts';
import { applyDefaults, DatabagObjVal, preConfCloudResourceFactory, preConfTraversalTransform } from './barbe-sls-lib/lib';
import { Databag, exportDatabags, readDatabagContainer, iterateBlocks, SugarCoatedDatabag, concatStrArr, asSyntax, asValArrayConst, CloudResourceBuilder, asStr, cloudResourceRaw, databag, appendToTemplate, asTraversal, asVal, asBlock } from './barbe-std/utils';

const container = readDatabagContainer()


function awsS3Iterator(bag: Databag): (Databag | SugarCoatedDatabag)[] {
    if (!bag.Value) {
        return [];
    }
    const [block, namePrefix] = applyDefaults(container, bag.Value!);
    const cloudResource = preConfCloudResourceFactory(block, 'resource')
    const traversalTransform = preConfTraversalTransform(block)

    //list all the event_s3 blocks on aws_function blocks that are refering this aws_s3 block
    const allEventS3 = iterateBlocks(container, AWS_FUNCTION, (awsFuncBag) => {
        if(!awsFuncBag.Value) {
            return []
        }
        if(awsFuncBag.Value.Type !== 'object_const' || !awsFuncBag.Value.ObjectConst) {
            return []
        }
        const eventS3Keys = awsFuncBag.Value.ObjectConst.map(pair => {
            if(pair.Key !== EVENT_S3 || !pair.Value || pair.Value.Type !== 'array_const' || !pair.Value.ArrayConst) {
                return [];
            }
            const events = asValArrayConst(pair.Value) as DatabagObjVal[];
            const eventsToMyBucket = events.filter(event =>
                event.bucket &&
                event.bucket.Type.includes('traversal') &&
                event.bucket.Traversal![1] &&
                event.bucket.Traversal![1].Name === bag.Name
            );
            return eventsToMyBucket.map(event => ({
                event: event,
                bag: awsFuncBag
            }))
        }).flat()
        return eventS3Keys
    }).flat()

    let databags: SugarCoatedDatabag[] = [
        traversalTransform('aws_s3_traversal_transform', {
            [`aws_s3.${bag.Name}`]: `aws_s3_bucket.${bag.Name}_s3`
        }),
        cloudResource('aws_s3_bucket', `${bag.Name}_s3`, {
            bucket: appendToTemplate(namePrefix, [bag.Name]),
            force_destroy: block.force_destroy,
        })
    ]
    if(block.object_lock_enabled) {
        databags.push(
            traversalTransform('aws_s3_object_lock_traversal_transform', {
                [`aws_s3.${bag.Name}.object_lock`]: `aws_s3_bucket_object_lock_configuration.${bag.Name}_s3_object_lock`
            }),
            cloudResource('aws_s3_bucket_object_lock_configuration', `${bag.Name}_s3_object_lock`, {
                bucket: asTraversal(`aws_s3_bucket.${bag.Name}_s3.bucket`),
                object_lock_enabled: block.object_lock_enabled,
            })
        )
    }
    if(block.versioning_enabled && asVal(block.versioning_enabled) === true) {
        databags.push(
            traversalTransform('aws_s3_versioning_traversal_transform', {
                [`aws_s3.${bag.Name}.versioning`]: `aws_s3_bucket_versioning.${bag.Name}_s3_versioning`
            }),
            cloudResource('aws_s3_bucket_versioning', `${bag.Name}_s3_versioning`, {
                bucket: asTraversal(`aws_s3_bucket.${bag.Name}_s3.bucket`),
                versioning_configuration: asBlock([{
                    status: 'Enabled'
                }])
            })
        )
    }
    if(block.cors_rule) {
        databags.push(
            traversalTransform('aws_s3_cors_traversal_transform', {
                [`aws_s3.${bag.Name}.cors`]: `aws_s3_bucket_cors_configuration.${bag.Name}_s3_cors`
            }),
            cloudResource('aws_s3_bucket_cors_configuration', `${bag.Name}_s3_cors`, {
                bucket: asTraversal(`aws_s3_bucket.${bag.Name}_s3.bucket`),
                cors_rule: asBlock(asValArrayConst(block.cors_rule).map(rule => ({
                    id: rule.id,
                    allowed_headers: rule.allowed_headers,
                    allowed_methods: rule.allowed_methods,
                    allowed_origins: rule.allowed_origins,
                    expose_headers: rule.expose_headers,
                    max_age_seconds: rule.max_age_seconds,
                })))
            })
        )
    }
    if (allEventS3.length !== 0) {
        databags.push(
            cloudResource('aws_s3_bucket_notification', `${bag.Name}_s3_notification`, {
                //TODO this is needed to avoid having to deploy twice the first time the template gets deployed
                // comment above: unsure if that's still true
                //depends_on: [
                //	for tuple in allEventS3 {
                //		let functionLabel = (barbe.#AsValArrayConst & {#In: tuple[1].labels}).out[0]
                //		barbe.#AsTraversal & {#In: "aws_lambda_permission.\(functionLabel)_\(labels[0])_s3_permission"}
                //	}
                //]
                bucket: asTraversal(`aws_s3_bucket.${bag.Name}_s3.bucket`),
                lambda_function: asBlock(allEventS3.map(tuple => ({
                    lambda_function_arn: asTraversal(`aws_lambda_function.${tuple.bag.Name}_lambda.arn`),
                    events: tuple.event.events || ['s3:*'],
                    filter_prefix: tuple.event.prefix,
                    filter_suffix: tuple.event.suffix,
                })))
            })
        )
    }

    return databags
}

exportDatabags(iterateBlocks(container, AWS_S3, awsS3Iterator).flat())