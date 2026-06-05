import { AWS_CLOUDFRONT_FOR_S3 } from './barbe-sls-lib/consts';
import { awsDomainBlockResources } from './barbe-sls-lib/helpers';
import { applyDefaults, compileBlockParam, preConfCloudResourceFactory, preConfTraversalTransform } from './barbe-sls-lib/lib';
import {
    appendToTemplate,
    appendToTraversal,
    asBlock,
    asStr,
    asTemplate,
    asTraversal, asVal,
    Databag,
    exportDatabags,
    iterateBlocks,
    onlyRunForLifecycleSteps,
    readDatabagContainer,
    SugarCoatedDatabag
} from './barbe-std/utils';
import md5 from "md5";


const container = readDatabagContainer()
onlyRunForLifecycleSteps(['pre_generate', 'generate', 'post_generate'])

const cloudfrontLogColumns = [
    ['date', 'string'],
    ['time', 'string'],
    ['x_edge_location', 'string'],
    ['sc_bytes', 'string'],
    ['c_ip', 'string'],
    ['cs_method', 'string'],
    ['cs_host', 'string'],
    ['cs_uri_stem', 'string'],
    ['sc_status', 'string'],
    ['cs_referer', 'string'],
    ['cs_user_agent', 'string'],
    ['cs_uri_query', 'string'],
    ['cs_cookie', 'string'],
    ['x_edge_result_type', 'string'],
    ['x_edge_request_id', 'string'],
    ['x_host_header', 'string'],
    ['cs_protocol', 'string'],
    ['cs_bytes', 'string'],
    ['time_taken', 'string'],
    ['x_forwarded_for', 'string'],
    ['ssl_protocol', 'string'],
    ['ssl_cipher', 'string'],
    ['x_edge_response_result_type', 'string'],
    ['cs_protocol_version', 'string'],
    ['fle_status', 'string'],
    ['fle_encrypted_fields', 'string'],
    ['c_port', 'string'],
    ['time_to_first_byte', 'string'],
    ['x_edge_detailed_result_type', 'string'],
    ['sc_content_type', 'string'],
    ['sc_content_len', 'string'],
    ['sc_range_start', 'string'],
    ['sc_range_end', 'string'],
]


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
    const s3Bucket = block.s3_bucket!

    const allBlockWithThisS3Bucket = Object.keys(container[AWS_CLOUDFRONT_FOR_S3]).filter(key => {
        const [b] = applyDefaults(container, container[AWS_CLOUDFRONT_FOR_S3][key][0].Value!)
        return asStr(b.s3_bucket!) === asStr(s3Bucket)
    })
    //hash might have a number in front so we put a _
    const policyDocumentHash = '_' + md5(s3Bucket.Traversal![1].Name!)

    const dotDomain = compileBlockParam(block, 'domain')
    const domainBlock = awsDomainBlockResources({
        dotDomain,
        domainValue: asTraversal(`aws_cloudfront_distribution.${bag.Name}_cf_for_s3.domain_name`),
        resourcePrefix: `${AWS_CLOUDFRONT_FOR_S3}_${bag.Name}`,
        apexHostedZoneId: asTraversal(`aws_cloudfront_distribution.${bag.Name}_cf_for_s3.domain_name`),
        cloudData,
        cloudResource,
    })
    const enabledLogs = block.enable_logging && asVal(block.enable_logging)
    const logType = enabledLogs ? asStr(block.log_type || 's3') : 's3'
    if(enabledLogs && !['s3', 'cloudwatch'].includes(logType)) {
        throw new Error(`invalid log_type '${logType}' on aws_cloudfront_for_s3.${bag.Name}; expected either 's3' or 'cloudwatch'`)
    }
    const useS3Logs = enabledLogs && logType === 's3'
    const useCloudWatchLogs = enabledLogs && logType === 'cloudwatch'
    const enabledAthenaTable = useS3Logs && (block.enable_athena_table === undefined || asVal(block.enable_athena_table))

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
        cloudData('aws_iam_policy_document', `${policyDocumentHash}_cf_for_s3_policy_document`, {
            statement: asBlock([{
                actions: ['s3:GetObject'],
                resources: [
                    asTemplate([
                        appendToTraversal(s3Bucket, 'arn'),
                        '/*'
                    ])
                ],
                principals: asBlock([{
                    type: 'AWS',
                    identifiers: allBlockWithThisS3Bucket.map(bagName => asTraversal(`aws_cloudfront_origin_access_identity.${bagName}_cf_for_s3_oai.iam_arn`))
                }])
            }])
        }),
        cloudResource('aws_s3_bucket_policy', `${policyDocumentHash}_cf_for_s3_policy`, {
            bucket: appendToTraversal(s3Bucket, 'id'),
            policy: asTraversal(`data.aws_iam_policy_document.${policyDocumentHash}_cf_for_s3_policy_document.json`)
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
                domain_name: appendToTraversal(s3Bucket, 'bucket_regional_domain_name'),
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
                origin_request_policy_id: block.origin_request_policy_id || asTraversal(`data.aws_cloudfront_origin_request_policy.${bag.Name}_cf_for_s3_cors_s3_origin.id`),
                cache_policy_id: block.cache_policy_id || asTraversal(`data.aws_cloudfront_cache_policy.${bag.Name}_cf_for_s3_caching_optimized.id`),
                response_headers_policy_id: block.response_headers_policy_id || asTraversal(`data.aws_cloudfront_response_headers_policy.${bag.Name}_cf_for_s3_cors_w_preflight.id`),
                lambda_function_association: block.lambda_function_association || null,
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
            ]),
        })
    ]
    if(domainBlock) {
        databags.push(...domainBlock.databags)
    }
    if(enabledLogs) {
        databags.push(
            cloudResource('aws_cloudwatch_log_delivery_source', `${bag.Name}_cf_logs_source`, {
                region: 'us-east-1',
                name: `${bag.Name}-cf-logs-source`,
                log_type: 'ACCESS_LOGS',
                resource_arn: asTraversal(`aws_cloudfront_distribution.${bag.Name}_cf_for_s3.arn`),
            }),
        )
    }
    if(useS3Logs) {
        databags.push(
            cloudResource('aws_s3_bucket', `${bag.Name}_cf_logs`, {
                bucket: appendToTemplate(namePrefix, [bag.Name, '-logs']),
                force_destroy: block.force_destroy,
            }),
            cloudResource('aws_s3_bucket_public_access_block', `${bag.Name}_cf_logs_access_block`, {
                bucket: asTraversal(`aws_s3_bucket.${bag.Name}_cf_logs.id`),
                block_public_acls: true,
                block_public_policy: true,
                ignore_public_acls: true,
                restrict_public_buckets: true,
            }),
            cloudResource('aws_cloudwatch_log_delivery_destination', `${bag.Name}_cf_logs_destination`, {
                region: 'us-east-1',
                name: `${bag.Name}-cf-logs-s3-destination`,
                output_format: 'parquet',
                delivery_destination_configuration: asBlock([{
                    destination_resource_arn: asTemplate([
                        asTraversal(`aws_s3_bucket.${bag.Name}_cf_logs.arn`),
                        '/logs',
                    ]),
                }]),
            }),
            cloudResource('aws_cloudwatch_log_delivery', `${bag.Name}_cf_logs_delivery`, {
                region: 'us-east-1',
                delivery_source_name: asTraversal(`aws_cloudwatch_log_delivery_source.${bag.Name}_cf_logs_source.name`),
                delivery_destination_arn: asTraversal(`aws_cloudwatch_log_delivery_destination.${bag.Name}_cf_logs_destination.arn`),
                s3_delivery_configuration: asBlock([{
                    enable_hive_compatible_path: true,
                    suffix_path: asTemplate([
                        '{distributionid}/{yyyy}/{MM}/{dd}/{HH}',
                    ]),
                }]),
            }),
        )
        if(enabledAthenaTable) {
            const athenaDatabaseName = block.athena_database_name || `${bag.Name}_cf_logs`
            const athenaTableName = block.athena_table_name || `${bag.Name}_cf_logs`
            databags.push(
                cloudResource('aws_glue_catalog_database', `${bag.Name}_cf_logs_database`, {
                    name: athenaDatabaseName,
                }),
                cloudResource('aws_glue_catalog_table', `${bag.Name}_cf_logs_table`, {
                    name: athenaTableName,
                    database_name: asTraversal(`aws_glue_catalog_database.${bag.Name}_cf_logs_database.name`),
                    table_type: 'EXTERNAL_TABLE',
                    parameters: {
                        EXTERNAL: 'TRUE',
                        classification: 'parquet',
                        'projection.enabled': 'true',
                        'projection.distributionid.type': 'enum',
                        'projection.distributionid.values': asTraversal(`aws_cloudfront_distribution.${bag.Name}_cf_for_s3.id`),
                        'projection.year.type': 'integer',
                        'projection.year.range': block.athena_projection_year_range || '2020,2030',
                        'projection.month.type': 'integer',
                        'projection.month.range': '01,12',
                        'projection.month.digits': '2',
                        'projection.day.type': 'integer',
                        'projection.day.range': '01,31',
                        'projection.day.digits': '2',
                        'projection.hour.type': 'integer',
                        'projection.hour.range': '00,23',
                        'projection.hour.digits': '2',
                        'storage.location.template': asTemplate([
                            's3://',
                            asTraversal(`aws_s3_bucket.${bag.Name}_cf_logs.bucket`),
                            '/logs/distributionid=$${distributionid}/year=$${year}/month=$${month}/day=$${day}/hour=$${hour}/',
                        ]),
                    },
                    partition_keys: asBlock([
                        { name: 'distributionid', type: 'string' },
                        { name: 'year', type: 'int' },
                        { name: 'month', type: 'int' },
                        { name: 'day', type: 'int' },
                        { name: 'hour', type: 'int' },
                    ]),
                    storage_descriptor: asBlock([{
                        location: asTemplate([
                            's3://',
                            asTraversal(`aws_s3_bucket.${bag.Name}_cf_logs.bucket`),
                            '/logs/',
                        ]),
                        input_format: 'org.apache.hadoop.hive.ql.io.parquet.MapredParquetInputFormat',
                        output_format: 'org.apache.hadoop.hive.ql.io.parquet.MapredParquetOutputFormat',
                        ser_de_info: asBlock([{
                            serialization_library: 'org.apache.hadoop.hive.ql.io.parquet.serde.ParquetHiveSerDe',
                            parameters: {
                                'serialization.format': '1',
                            },
                        }]),
                        columns: asBlock(cloudfrontLogColumns.map(([name, type]) => ({ name, type }))),
                    }]),
                }),
            )
        }
    }
    if(useCloudWatchLogs) {
        databags.push(
            cloudResource('aws_cloudwatch_log_group', `${bag.Name}_cf_logs_group`, {
                region: 'us-east-1',
                name: block.cloudwatch_logs_group_name || asTemplate([
                    '/aws/cloudfront/',
                    namePrefix,
                    bag.Name,
                ]),
                retention_in_days: block.cloudwatch_logs_retention_days || block.logs_retention_days || 30,
            }),
            cloudResource('aws_cloudwatch_log_delivery_destination', `${bag.Name}_cf_logs_destination`, {
                region: 'us-east-1',
                name: `${bag.Name}-cf-logs-cloudwatch-destination`,
                output_format: block.cloudwatch_logs_output_format || 'json',
                delivery_destination_configuration: asBlock([{
                    destination_resource_arn: asTraversal(`aws_cloudwatch_log_group.${bag.Name}_cf_logs_group.arn`),
                }]),
            }),
            cloudResource('aws_cloudwatch_log_delivery', `${bag.Name}_cf_logs_delivery`, {
                region: 'us-east-1',
                delivery_source_name: asTraversal(`aws_cloudwatch_log_delivery_source.${bag.Name}_cf_logs_source.name`),
                delivery_destination_arn: asTraversal(`aws_cloudwatch_log_delivery_destination.${bag.Name}_cf_logs_destination.arn`),
            }),
        )
    }
    return databags
}

exportDatabags(iterateBlocks(container, AWS_CLOUDFRONT_FOR_S3, awsCfForS3Iterator).flat())