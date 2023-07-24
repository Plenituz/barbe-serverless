import { AWS_CLOUDFRONT_FOR_S3, AWS_KINESIS_STREAM } from './barbe-sls-lib/consts';
import { awsDomainBlockResources } from './barbe-sls-lib/helpers';
import { applyDefaults, compileBlockParam, preConfCloudResourceFactory, preConfTraversalTransform } from './barbe-sls-lib/lib';
import { appendToTemplate, appendToTraversal, asBlock, asTemplate, asTraversal, Databag, exportDatabags, iterateBlocks, onlyRunForLifecycleSteps, readDatabagContainer, SugarCoatedDatabag } from './barbe-std/utils';


const container = readDatabagContainer()
onlyRunForLifecycleSteps(['pre_generate', 'generate', 'post_generate'])


function awsCfForS3Iterator(bag: Databag): (Databag | SugarCoatedDatabag)[] {
    if (!bag.Value) {
        return [];
    }
    const [block, namePrefix] = applyDefaults(container, bag.Value!);
    const cloudResource = preConfCloudResourceFactory(block, 'resource')
    const cloudData = preConfCloudResourceFactory(block, 'data')
    const traversalTransform = preConfTraversalTransform(bag)

    if(!block.s3_bucket) {
        throw new Error(`missing 's3_bucket' on aws_cloudfront_for_s3.${bag.Name}`)
    }

    const dotDomain = compileBlockParam(block, 'domain')
    const domainBlock = awsDomainBlockResources({
        dotDomain,
        domainValue: asTraversal(`aws_cloudfront_distribution.${bag.Name}_cf_for_s3.domain_name`),
        resourcePrefix: `${AWS_CLOUDFRONT_FOR_S3}_${bag.Name}`,
        apexHostedZoneId: asTraversal(`aws_cloudfront_distribution.${bag.Name}_cf_for_s3.domain_name`),
        cloudData,
        cloudResource,
    })

    let databags: SugarCoatedDatabag[] = [
        traversalTransform('aws_cf_for_s3_traversal_transform', {
            [`aws_cloudfront_for_s3.${bag.Name}`]: `aws_cloudfront_distribution.${bag.Name}_cf_for_s3`
        }),
        cloudData('aws_cloudfront_origin_request_policy', `${bag.Name}_cf_for_s3_cors_s3_origin`, {
            name: 'Managed-CORS-S3Origin',
        }),
        cloudData('aws_cloudfront_cache_policy', `${bag.Name}_cf_for_s3_caching_optimized`, {
            name: 'Managed-CachingOptimized',
        }),
        cloudData('aws_cloudfront_response_headers_policy', `${bag.Name}_cf_for_s3_cors_w_preflight`, {
            name: 'Managed-CORS-With-Preflight',
        }),
        cloudResource('aws_cloudfront_origin_access_identity', `${bag.Name}_cf_for_s3_oai`, {}),
        cloudData('aws_iam_policy_document', `${bag.Name}_cf_for_s3_policy_document`, {
            statement: asBlock([{
                actions: ['s3:GetObject'],
                resources: [
                    asTemplate([
                        appendToTraversal(block.s3_bucket, 'arn'),
                        '/*'
                    ])
                ],
                principals: asBlock([{
                    type: 'AWS',
                    identifiers: [
                        asTraversal(`aws_cloudfront_origin_access_identity.${bag.Name}_cf_for_s3_oai.iam_arn`)
                    ]
                }])
            }])
        }),
        cloudResource('aws_s3_bucket_policy', `${bag.Name}_cf_for_s3_policy`, {
            bucket: appendToTraversal(block.s3_bucket, 'id'),
            policy: asTraversal(`data.aws_iam_policy_document.${bag.Name}_cf_for_s3_policy_document.json`)
        }),
        cloudResource('aws_cloudfront_distribution', `${bag.Name}_cf_for_s3`, {
            enabled: true,
            is_ipv6_enabled: true,
            price_class: 'PriceClass_All',

            restrictions: asBlock([{
                geo_restriction: asBlock([{
                    restriction_type: 'none'
                }])
            }]),

            origin: asBlock([{
                domain_name: appendToTraversal(block.s3_bucket, 'bucket_regional_domain_name'),
                origin_id: 'bucket',
                s3_origin_config: asBlock([{
                    origin_access_identity: asTraversal(`aws_cloudfront_origin_access_identity.${bag.Name}_cf_for_s3_oai.cloudfront_access_identity_path`)
                }])
            }]),

            default_cache_behavior: asBlock([{
                allowed_methods: ['GET', 'HEAD', 'OPTIONS'],
                cached_methods: ['GET', 'HEAD', 'OPTIONS'],
                target_origin_id: 'bucket',
                viewer_protocol_policy: 'redirect-to-https',
                compress: true,
                origin_request_policy_id: asTraversal(`data.aws_cloudfront_origin_request_policy.${bag.Name}_cf_for_s3_cors_s3_origin.id`),
                cache_policy_id: asTraversal(`data.aws_cloudfront_cache_policy.${bag.Name}_cf_for_s3_caching_optimized.id`),
                response_headers_policy_id: asTraversal(`data.aws_cloudfront_response_headers_policy.${bag.Name}_cf_for_s3_cors_w_preflight.id`),
            }]),


            aliases: domainBlock?.domainNames || [],
            viewer_certificate: asBlock([
                (() => {
                    const minimumProtocolVersion = 'TLSv1.2_2021'
                    if(!domainBlock) {
                        return {
                            cloudfront_default_certificate: true
                        }
                    }
                    return {
                        acm_certificate_arn: domainBlock.certArn,
                        ssl_support_method: 'sni-only',
                        minimum_protocol_version: minimumProtocolVersion
                    }
                })()
            ])
        })
    ]
    if(domainBlock) {
        databags.push(...domainBlock.databags)
    }
    return databags
}

exportDatabags(iterateBlocks(container, AWS_CLOUDFRONT_FOR_S3, awsCfForS3Iterator).flat())