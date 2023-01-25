import { AWS_KINESIS_STREAM } from './barbe-sls-lib/consts';
import { applyDefaults, preConfCloudResourceFactory, preConfTraversalTransform } from './barbe-sls-lib/lib';
import { appendToTemplate, asBlock, Databag, exportDatabags, iterateBlocks, onlyRunForLifecycleSteps, readDatabagContainer, SugarCoatedDatabag } from './barbe-std/utils';

const container = readDatabagContainer()
onlyRunForLifecycleSteps(['pre_generate', 'generate', 'post_generate'])

function awsKinesisStreamIterator(bag: Databag): (Databag | SugarCoatedDatabag)[] {
    if (!bag.Value) {
        return [];
    }
    const [block, namePrefix] = applyDefaults(container, bag.Value!);
    const cloudResource = preConfCloudResourceFactory(block, 'resource')
    const traversalTransform = preConfTraversalTransform(block)

    let databags: SugarCoatedDatabag[] = [
        traversalTransform('aws_kinesis_streams_traversal_transform', {
            [`aws_kinesis_stream.${bag.Name}`]: `aws_kinesis_stream.${bag.Name}_aws_kinesis_stream`
        }),
        cloudResource('aws_kinesis_stream', `${bag.Name}_aws_kinesis_stream`, {
            name: appendToTemplate(namePrefix, [bag.Name]),
            shard_count: block.shard_count || 1,
            retention_period: block.retention_period,
            shard_level_metrics: block.shard_level_metrics,
            enforce_consumer_deletion: block.enforce_consumer_deletion,
            encryption_type: block.encryption_type,
            kms_key_id: block.kms_key_id,
            stream_mode_details: block.stream_mode ? asBlock([{
                stream_mode: block.stream_mode,
            }]) : undefined,
        })
    ]
    return databags
}

exportDatabags(iterateBlocks(container, AWS_KINESIS_STREAM, awsKinesisStreamIterator).flat())

