// this is for functions that any component could find useful
import { DatabagContainer, SyntaxToken, asStr, mergeTokens, asVal, concatStrArr, asSyntax, cloudResourceRaw, asTraversal, CloudResourceBuilder, applyTransformers, Databag } from '../barbe-std/utils';

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
        compileNamePrefix(container, block)
    ];
}

export function compileNamePrefix(container: DatabagContainer, block: SyntaxToken): SyntaxToken {
    let namePrefixes: SyntaxToken[] = []
    if (container.global_default) {
        const globalDefaults = Object.values(container.global_default)
            .flatMap(group => group.map(block => block.Value!))
            .filter(block => block)
            .flatMap(block => block.ObjectConst?.filter(pair => pair.Key === 'name_prefix'))
            .filter(block => block)
            .map(block => block!.Value)
        namePrefixes.push(...globalDefaults);
    }

    let defaultName: string
    const copyFrom = block.ObjectConst?.find(pair => pair.Key === 'copy_from');
    if(copyFrom) {
        defaultName = asStr(copyFrom.Value);
    } else {
        // the unamed default block is actually named ''
        defaultName = '';
    }

    if (container.default && container.default[defaultName]) {
        const defaults = container.default[defaultName]
            .map(bag => bag.Value!)
            .filter(block => block)
            .flatMap(block => block.ObjectConst?.filter(pair => pair.Key === 'name_prefix'))
            .filter(block => block)
            .map(block => block!.Value)
        namePrefixes.push(...defaults);
    }
    namePrefixes.push(...(block.ObjectConst?.filter(pair => pair.Key === 'name_prefix').map(pair => pair.Value) || []))

    let output: SyntaxToken = {
        Type: 'template',
        Parts: []
    }
    const mergeIn = (namePrefixToken: SyntaxToken) => {
        switch(namePrefixToken.Type) {
            case 'literal_value':
                output.Parts!.push(namePrefixToken);
                break;
            case 'template':
                output.Parts!.push(...(namePrefixToken.Parts || []));
                break;
            case 'array_const':
                namePrefixToken.ArrayConst?.forEach(mergeIn);
                break
            default:
                console.log('unknown name_prefix type \'', namePrefixToken.Type, '\'');
        }
    }

    for(const namePrefixToken of namePrefixes) {
        mergeIn(namePrefixToken)
    }
    return output;
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

export type PreConfFactory = (type: string, name: string, value: any) => Databag
//pre configured cloud resource factory, handles cloud resource id/dir and provider setting based on region parameter
export function preConfCloudResourceFactory(blockVal: DatabagObjVal, kind: string, preconf?: any, bagPreconf?: any) {
    const cloudResourceId = blockVal.cloudresource_id ? asStr(blockVal.cloudresource_id) : undefined
    const cloudResourceDir = blockVal.cloudresource_dir ? asStr(blockVal.cloudresource_dir) : undefined
    
    return (type: string, name: string, value: any) => {
        value = {
            provider: blockVal.region && type.includes('aws') ? asTraversal(`aws.${asStr(blockVal.region)}`) : undefined,
            ...preconf,
            ...value,
        }
        return cloudResourceRaw({
            kind,
            dir: cloudResourceDir,
            id: cloudResourceId,
            type,
            name,
            value: Object.entries(value).filter(([_, v]) => v !== null && v !== undefined).reduce((acc, [k, v]) => Object.assign(acc, { [k]: v }), {}),
            ...bagPreconf
        })
    }
}

export function preConfTraversalTransform(blockVal: Databag) {
    return (name: string, transforms: {[traversal: string]: string}) => ({
        Name: `${blockVal.Name}_${name}`,
        Type: 'traversal_transform',
        Value: transforms
    })
}

//TODO we should group the requests for gcs token and aws creds together
//to avoid the overhead of multiple requests (parsing/marhsalling/component execution)
let __gcpTokenCached = '';
export function getGcpToken(optional: boolean): string | undefined {
    if(__gcpTokenCached) {
        return __gcpTokenCached;
    }
    const transformed = applyTransformers([{
        Name: "state_store_credentials",
        Type: "gcp_token_request",
        Value: { optional }
    }])
    const token = transformed.gcp_token?.state_store_credentials[0]?.Value
    if(!token) {
        return undefined
    }
    __gcpTokenCached = asStr(asVal(token).access_token);
    return __gcpTokenCached;
}

export type AwsCreds = {
    access_key_id: string,
    secret_access_key: string,
    session_token: string
}
let __awsCredsCached: AwsCreds | undefined = undefined;
export function getAwsCreds(): AwsCreds | undefined {
    if(__awsCredsCached) {
        return __awsCredsCached;
    }
    const transformed = applyTransformers([{
        Name: "state_store_credentials",
        Type: "aws_credentials_request",
        Value: {}
    }])
    const creds = transformed.aws_credentials?.state_store_credentials[0]?.Value
    if(!creds) {
        return undefined
    }
    const credsObj = asVal(creds)
    __awsCredsCached = {
        access_key_id: asStr(credsObj.access_key_id),
        secret_access_key: asStr(credsObj.secret_access_key),
        session_token: asStr(credsObj.session_token),
    }
    return __awsCredsCached;
}

export function applyMixins(str: string, mixins: { [name: string]: string }): string {
    for (const mixinName in mixins) {
        str = str.replace(new RegExp(`{{${mixinName}}}`, 'g'), mixins[mixinName]);
    }
    return str;
}
