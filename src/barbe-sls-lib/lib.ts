// this is for functions that any component could find useful
import { DatabagContainer, SyntaxToken, asStr, mergeTokens, asVal, concatStrArr, asSyntax, cloudResourceRaw, asTraversal, CloudResourceBuilder } from '../barbe-std/utils';

export type DatabagObjVal = {
    [key: string]: SyntaxToken | undefined 
}

export function compileDefaults(container: DatabagContainer, name: string): SyntaxToken {
    let blocks: SyntaxToken[] = [];
    if (container.global_default) {
        const globalDefaults = Object.values(container.global_default)
            .flatMap(group => group.map(block => block.Value!))
            .filter(block => block)
        blocks.push(...globalDefaults);
    }
    if (container.default && container.default[name]) {
        blocks.push(...container.default[name].map(block => block.Value!).filter(block => block));
    }
    return mergeTokens(blocks);
}

//returns block, namePrefix
export function applyDefaults(container: DatabagContainer, block: SyntaxToken): [block: DatabagObjVal, namePefix: SyntaxToken] {
    if(block.Type !== 'object_const') {
        throw new Error(`cannot apply defaults to token type '${block.Type}'`);
    }
    const copyFrom = block.ObjectConst?.find(pair => pair.Key === 'copy_from');
    let defaults: SyntaxToken
    if(copyFrom) {
        defaults = compileDefaults(container, asStr(copyFrom.Value));
    } else {
        // the unamed default block is actually named ''
        defaults = compileDefaults(container, '');
    }
    const blockVal = asVal(mergeTokens([defaults, block])) as DatabagObjVal;
    return [
        blockVal,
        compileNamePrefix(blockVal)
    ];
}

export function compileNamePrefix(blockVal: DatabagObjVal): SyntaxToken {
    //TODO this is going to change to allow using strings instead of array for name_prefix
    return concatStrArr(blockVal.name_prefix || asSyntax([]));
}

export function compileGlobalNamePrefix(container: DatabagContainer): SyntaxToken {
    const globalDefaults = asVal(compileDefaults(container, ''));
    return concatStrArr(globalDefaults.name_prefix || asSyntax([]));
}

/*
compileBlockParam(
    block {
        block_param {
            a = 1
        }
        block_param {
            b = 2
        }
    },
    "block_param"
)
=>
{
    a = 1
    b = 2
}
*/
export function compileBlockParam(blockVal: DatabagObjVal, blockName: string): DatabagObjVal {
    return asVal(mergeTokens((blockVal[blockName] || asSyntax([])).ArrayConst || []))
}

//pre configured cloud resource factory, handles cloud resource id/dir and provider setting based on region parameter
export function preConfCloudResourceFactory(blockVal: DatabagObjVal, kind: string, preconf?: any) {
    const cloudResourceId = blockVal.cloudresource_id ? asStr(blockVal.cloudresource_id) : undefined
    const cloudResourceDir = blockVal.cloudresource_dir ? asStr(blockVal.cloudresource_dir) : undefined
    return (type: string, name: string, value: any) => cloudResourceRaw({
        kind,
        dir: cloudResourceDir,
        id: cloudResourceId,
        type,
        name,
        value: {
            provider: blockVal.region ? asTraversal(`aws.${asStr(blockVal.region)}`) : undefined,
            ...preconf,
            ...value,
        }
    })
}

export function preConfTraversalTransform(blockVal: DatabagObjVal) {
    return (name: string, transforms: {[traversal: string]: string}) => ({
        Name: `${blockVal.Name}_${name}`,
        Type: 'traversal_transform',
        Value: transforms
    })
}

export function isSimpleTemplate(token: SyntaxToken | string | undefined): boolean {
    if(!token) {
        return false;
    }
    if(typeof token === 'string' || token.Type === 'literal_value') {
        return true;
    }
    if(token.Type !== 'template') {
        return false;
    }
    if(!token.Parts) {
        return true;
    }
    return token.Parts.every(isSimpleTemplate);
}