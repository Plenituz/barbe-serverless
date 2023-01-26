import { applyDefaults } from './barbe-sls-lib/lib';
import { readDatabagContainer, onlyRunForLifecycleSteps, SugarCoatedDatabag, iterateBlocks, exportDatabags, iterateAllBlocks } from './barbe-std/utils';


const container = readDatabagContainer()
onlyRunForLifecycleSteps(['pre_generate', 'generate', 'post_generate'])

let databags: SugarCoatedDatabag[] = [

    ...iterateBlocks(container, 'resource', (bag) => {
        if(!bag.Value) {
            return [];
        }
        return {
            Type: `cr_${bag.Name}`,
            Name: bag.Labels?.[0] || '',
            Value: bag.Value
        }
    }).flat(),

    ...iterateBlocks(container, 'data', (bag) => {
        if(!bag.Value) {
            return [];
        }
        return {
            Type: `cr_[data]_${bag.Name}`,
            Name: bag.Labels?.[0] || '',
            Value: bag.Value
        }
    }).flat(),

    ...iterateBlocks(container, 'module', (bag) => {
        if(!bag.Value) {
            return [];
        }
        return {
            Type: 'cr_[module]',
            Name: bag.Labels?.[0] || '',
            Value: bag.Value
        }
    }).flat(),

    ...iterateBlocks(container, 'terraform', (bag) => {
        if(!bag.Value) {
            return [];
        }
        return {
            Type: 'cr_[terraform]',
            Name: '',
            Value: bag.Value
        }
    }).flat(),

    ...iterateBlocks(container, 'variable', (bag) => {
        if(!bag.Value) {
            return [];
        }
        return {
            Type: 'cr_[variable]',
            Name: bag.Labels?.[0] || '',
            Value: bag.Value
        }
    }).flat(),

    ...iterateBlocks(container, 'locals', (bag) => {
        if(!bag.Value) {
            return [];
        }
        return {
            Type: 'cr_[locals]',
            Name: bag.Labels?.[0] || '',
            Value: bag.Value
        }
    }).flat(),

    ...iterateAllBlocks(container, (bag) => {
        if(!bag.Value) {
            return [];
        }
        if(!bag.Type.includes('provider')) {
            return [];
        }
        if(bag.Type.includes('cr_[provider')) {
            return [];
        }
        return {
            Type: `cr_[${bag.Type}]`,
            Name: bag.Labels?.[0] || '',
            Value: bag.Value
        }
    }).flat()
]


exportDatabags(databags)