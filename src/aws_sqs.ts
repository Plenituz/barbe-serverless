import { AWS_FUNCTION, EVENT_S3, AWS_S3, AWS_SQS } from './barbe-sls-lib/consts';
import { applyDefaults, DatabagObjVal, preConfCloudResourceFactory, preConfTraversalTransform } from './barbe-sls-lib/lib';
import { Databag, exportDatabags, readDatabagContainer, iterateBlocks, SugarCoatedDatabag, asValArrayConst, appendToTemplate, asTraversal, asVal, asBlock, onlyRunForLifecycleSteps } from './barbe-std/utils';

const container = readDatabagContainer()
onlyRunForLifecycleSteps(['pre_generate', 'generate', 'post_generate'])


function awsSQSIterator(bag: Databag): (Databag | SugarCoatedDatabag)[] {
    if (!bag.Value) {
        return [];
    }
    const [block, namePrefix] = applyDefaults(container, bag.Value!);
    const cloudResource = preConfCloudResourceFactory(block, 'resource')
    const traversalTransform = preConfTraversalTransform(bag)

    let sqsQueue: any = {
        name: appendToTemplate(namePrefix, [bag.Name]),
        delay_seconds: block.delay_seconds,
        max_message_size: block.max_message_size,
        message_retention_seconds: block.message_retention_seconds,
        receive_wait_time_seconds: block.receive_wait_time_seconds,
        //TODO override lambda timeout if this queue is plugged to a lambda
        visibility_timeout_seconds: block.visibility_timeout_seconds,
        content_based_deduplication: block.content_based_deduplication,
        sqs_managed_sse_enabled: block.sqs_managed_sse_enabled,
        kms_master_key_id: block.kms_master_key_id,
        kms_data_key_reuse_period_seconds: block.kms_data_key_reuse_period_seconds,
        deduplication_scope: block.deduplication_scope,
        fifo_throughput_limit: block.fifo_throughput_limit,
    }
    if(block.max_receive_count && !block.dead_letter_queue_arn) {
        throw new Error(`max_receive_count is set but dead_letter_queue_arn is not set for '${bag.Type}.${bag.Name}'`)
    }
    if(block.dead_letter_queue_arn) {
        sqsQueue.redrive_policy = {
            dead_letter_target_arn: block.dead_letter_queue_arn,
            max_receive_count: block.max_receive_count || 5,
        }
    }

    let databags: SugarCoatedDatabag[] = [
        traversalTransform('aws_sqs_traversal_transform', {
            [`aws_sqs.${bag.Name}`]: `aws_sqs_queue.${bag.Name}_sqs`
        }),
        cloudResource('aws_sqs_queue', `${bag.Name}_sqs`, sqsQueue)
    ]

    return databags
}

exportDatabags(iterateBlocks(container, AWS_SQS, awsSQSIterator).flat())