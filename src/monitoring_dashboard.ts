import {
    asValArrayConst,
    Databag, exportDatabags,
    iterateBlocks,
    onlyRunForLifecycleSteps,
    readDatabagContainer,
    SugarCoatedDatabag, uniq
} from "./barbe-std/utils";
import {MONITORING_DASHBOARD} from "./barbe-sls-lib/consts";
import {applyDefaults, preConfCloudResourceFactory, preConfTraversalTransform} from "./barbe-sls-lib/lib";


const container = readDatabagContainer()
onlyRunForLifecycleSteps(['pre_generate', 'generate', 'post_generate'])


function sizeToHeight(size: 'short' | 'medium' | 'tall'): number {
    switch (size) {
        default:
            console.log('invalid size for monitoring_dashboard widget: "' + size + '"')
        case 'short': return 3
        case 'medium': return 6
        case 'tall': return 9
    }
}

type CloudWatchWidget<T> = {
    height: number
    width: number
    x: number
    y: number
    type: 'metric' | 'text' // TODO add others
    properties: T
}

type CloudWatchWidgetMetrics = CloudWatchWidget<{
    view: 'timeSeries' //TODO add others
    stacked: boolean
    metrics: CloudWatchMetricDefinition
    region: string
    period: number
    title: string
}>

//TODO options and stuff
type CloudWatchMetricDefinition = (string | CloudWatchMetricDefinitionOptions)[][]
type CloudWatchMetricDefinitionOptions = {
    region?: string | 'Global'
    id?: string
    label?: string
    expression?: string
}

function monitoringDashboardIterator(bag: Databag): (Databag | SugarCoatedDatabag)[] {
    if(!bag.Value) {
        return []
    }
    const [block, namePrefix] = applyDefaults(container, bag.Value!);
    const cloudResource = preConfCloudResourceFactory(block, 'resource')

    let widgets: CloudWatchWidget<unknown>[] = []

    const lineSize = 15
    let currentX = 0
    let currentY = 0

    for(let row of asValArrayConst(block.row)) {
        let widgetWidth = lineSize/row.length
        let maxHeightOfLine = 0
        for(let line of asValArrayConst(row.line)) {
            let height = sizeToHeight(line.size)
            if(height > maxHeightOfLine) {
                maxHeightOfLine = height
            }
            let widget: CloudWatchWidgetMetrics = {
                height,
                width: widgetWidth,
                x: currentX,
                y: currentY,
                type: 'metric',
                properties: {
                    view: 'timeSeries',
                    stacked: false,
                    region: line.region || block.region || 'us-east-1'
                }
            }
            currentX += widgetWidth
            widgets.push(widget)
            console.log('line', JSON.stringify(line))
        }
        currentY += maxHeightOfLine
    }
    console.log('widgets', JSON.stringify(widgets, undefined, '    '))
}


exportDatabags([
    ...iterateBlocks(container, MONITORING_DASHBOARD, monitoringDashboardIterator).flat(),
])