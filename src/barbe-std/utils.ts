import { barbeRpcCall, isFailure, RpcResponse } from './rpc';

export type CloudResourceBuilder = {
    // directory where the cloud resource configuration will be put
    dir?: string
    // unique id for the cloud resource, needed in case 2 resources have the same type and name
    id?: string
    // kind of cloud resource, e.g. 'data', 'resource', 'output'
    kind?: string
    // type of cloud resource, e.g. 'aws_s3_bucket'
    type?: string
    // name of the cloud resource, the type/name pair must be unique, or an id must be provided (in addition to the type/name pair)
    name: string
    // the value of the cloud resource, can be a syntax token or a plain object that will be converted to a syntax token
    value?: any
}

export type SyntaxTokenType = "literal_value" |
    "scope_traversal" |
    "function_call" |
    "template" |
    "object_const" |
    "array_const" |
    "index_access" |
    "for" |
    "relative_traversal" |
    "conditional" |
    "binary_op" |
    "unary_op" |
    "parens" |
    "splat" |
    "anon"

export const SyntaxTokenTypes: { [tokenType: string | SyntaxTokenType]: true } = {
    "literal_value": true,
    "scope_traversal": true,
    "function_call": true,
    "template": true,
    "object_const": true,
    "array_const": true,
    "index_access": true,
    "for": true,
    "relative_traversal": true,
    "conditional": true,
    "binary_op": true,
    "unary_op": true,
    "parens": true,
    "splat": true,
    "anon": true,
}


export type ObjectConstItem = {
    Key: string
    Value: SyntaxToken
}

export type TraverseType = "attr" | "index" | "splat"

export type Traverse = {
    Type: TraverseType

    //if TraverseTypeAttr
    Name?: string

    //if TraverseTypeIndex
    //can be either a int64 or a string
    Index?: number | string
}

export type SyntaxToken = {
    Type: SyntaxTokenType

    //if TokenTypeLiteralValue
    Value?: any

    // can be used by any type, used to carry extra metadata if needed
    Meta?: { 
        [key: string]: any
        Labels?: string[]
        IsBlock?: boolean
     }

    //if TokenTypeObjectConst
    //we dont support having expression for key names yet
    //CARE: may contain several time the same key, on purpose
    //for example when several of the same blocks are merged together.
    //needs to be taken into account by the formatter
    ObjectConst?: ObjectConstItem[]

    //if TokenTypeArrayConst
    ArrayConst?: SyntaxToken[]

    //if TokenTypeScopeTraversal TokenTypeRelativeTraversal
    Traversal?: Traverse[]

    //if TokenTypeFunctionCall
    FunctionName?: string
    FunctionArgs?: SyntaxToken[]

    //if TokenTypeTemplate
    Parts?: SyntaxToken[]

    //if TokenTypeIndexAccess
    IndexCollection?: SyntaxToken
    IndexKey?: SyntaxToken

    //if TokenTypeRelativeTraversal and TokenTypeParens and TokenTypeSplat
    Source?: SyntaxToken

    //if TokenTypeFor
    ForKeyVar?: string // empty if ignoring the key
    ForValVar?: string
    ForCollExpr?: SyntaxToken
    ForKeyExpr?: SyntaxToken // nil when producing a tuple
    ForValExpr?: SyntaxToken
    ForCondExpr?: SyntaxToken // null if no "if" clause is present

    //if TokenTypeConditional
    Condition?: SyntaxToken
    TrueResult?: SyntaxToken
    FalseResult?: SyntaxToken

    //if TokenTypeBinaryOp and TokenTypeUnaryOp
    RightHandSide?: SyntaxToken
    Operator?: string
    //if TokenTypeBinaryOp
    LeftHandSide?: SyntaxToken

    //if TokenTypeSplat
    SplatEach?: SyntaxToken
}

export type Databag = {
    Type: string
    Name: string
    Labels?: string[]
    Value?: SyntaxToken
}

// type is to make it easier to create databags
// with a Value that's not a SyntaxToken.
// When using exportDatabags, the Value will be converted to a SyntaxToken for you
export type SugarCoatedDatabag = {
    Type: string
    Name: string
    Labels?: string[]
    Value?: any
}

export type SugarCoatedDatabagContainer = {
    [mType: string]: {
        [mName: string]: SugarCoatedDatabag[]
    }
}

export type DatabagContainer = {
    [mType: string]: {
        [mName: string]: Databag[]
    }
}

export function accumulateTokens(root: SyntaxToken, visitor: (token: SyntaxToken) => boolean): SyntaxToken[] {
    const shouldKeep = visitor(root)
    if (shouldKeep) {
        return [root]
    }
    switch (root.Type) {
        default:
            // console.log("!!!Unknown token type in accumulateTokens: '" + root.Type + "'", JSON.stringify(root))
            return []
        case "anon":
        case "literal_value":
        case "scope_traversal":
            return []

        case "relative_traversal":
            return accumulateTokens(root.Source!, visitor)

        case "splat":
            return [
                ...accumulateTokens(root.Source!, visitor),
                ...accumulateTokens(root.SplatEach!, visitor)
            ]

        case "object_const":
            return root.ObjectConst?.map(item => accumulateTokens(item.Value, visitor)).flat() || []

        case "array_const":
            return root.ArrayConst?.map(item => accumulateTokens(item, visitor)).flat() || []

        case "template":
            return root.Parts?.map(item => accumulateTokens(item, visitor)).flat() || []

        case "function_call":
            return root.FunctionArgs?.map(item => accumulateTokens(item, visitor)).flat() || []

        case "index_access":
            return [
                ...accumulateTokens(root.IndexCollection!, visitor),
                ...accumulateTokens(root.IndexKey!, visitor)
            ]

        case "conditional":
            return [
                ...accumulateTokens(root.Condition!, visitor),
                ...accumulateTokens(root.TrueResult!, visitor),
                ...accumulateTokens(root.FalseResult!, visitor)
            ]

        case "parens":
            return accumulateTokens(root.Source!, visitor)

        case "binary_op":
            return [
                ...accumulateTokens(root.LeftHandSide!, visitor),
                ...accumulateTokens(root.RightHandSide!, visitor)
            ]

        case "unary_op":
            return accumulateTokens(root.RightHandSide!, visitor)

        case "for":
            return [
                ...accumulateTokens(root.ForCollExpr!, visitor),
                root.ForKeyExpr ? accumulateTokens(root.ForKeyExpr, visitor) : [],
                ...accumulateTokens(root.ForValExpr!, visitor),
                root.ForCondExpr ? accumulateTokens(root.ForCondExpr, visitor) : []
            ].flat()
    }
}

export function visitTokens(root: SyntaxToken, visitor: (token: SyntaxToken) => SyntaxToken | null): SyntaxToken {
    const result = visitor(root)
    if (result) {
        return result
    }
    switch (root.Type) {
        default:
            // console.log("!!!Unknown token type in visitTokens: '" + root.Type + "'", JSON.stringify(root))
            return root
        case "anon":
        case "literal_value":
        case "scope_traversal":
            return root
        case "relative_traversal":
            return {
                Type: "relative_traversal",
                Meta: root.Meta || undefined,
                Source: visitTokens(root.Source!, visitor),
                Traversal: root.Traversal
            }
        case "splat":
            return {
                Type: "splat",
                Meta: root.Meta || undefined,
                Source: visitTokens(root.Source!, visitor),
                SplatEach: visitTokens(root.SplatEach!, visitor),
            }
        case "object_const":
            return {
                Type: "object_const",
                Meta: root.Meta || undefined,
                ObjectConst: root.ObjectConst?.map((item) => ({
                    Key: item.Key,
                    Value: visitTokens(item.Value, visitor)
                })),
            }
        case "array_const":
            return {
                Type: "array_const",
                Meta: root.Meta || undefined,
                ArrayConst: root.ArrayConst?.map((item) => visitTokens(item, visitor)),
            }
        case "template":
            return {
                Type: "template",
                Meta: root.Meta || undefined,
                Parts: root.Parts?.map((item) => visitTokens(item, visitor)),
            }
        case "function_call":
            return {
                Type: "function_call",
                Meta: root.Meta || undefined,
                FunctionName: root.FunctionName,
                FunctionArgs: root.FunctionArgs?.map((item) => visitTokens(item, visitor)),
            }
        case "index_access":
            return {
                Type: "index_access",
                Meta: root.Meta || undefined,
                IndexCollection: visitTokens(root.IndexCollection!, visitor),
                IndexKey: visitTokens(root.IndexKey!, visitor),
            }
        case "conditional":
            return {
                Type: "conditional",
                Meta: root.Meta || undefined,
                Condition: visitTokens(root.Condition!, visitor),
                TrueResult: visitTokens(root.TrueResult!, visitor),
                FalseResult: visitTokens(root.FalseResult!, visitor),
            }
        case "parens":
            return {
                Type: "parens",
                Meta: root.Meta || undefined,
                Source: visitTokens(root.Source!, visitor),
            }
        case "binary_op":
            return {
                Type: "binary_op",
                Meta: root.Meta || undefined,
                Operator: root.Operator,
                RightHandSide: visitTokens(root.RightHandSide!, visitor),
                LeftHandSide: visitTokens(root.LeftHandSide!, visitor),
            }
        case "unary_op":
            return {
                Type: 'unary_op',
                Meta: root.Meta || undefined,
                Operator: root.Operator,
                RightHandSide: visitTokens(root.RightHandSide!, visitor),
            };
        case "for":
            return {
                Type: 'for',
                Meta: root.Meta || undefined,
                ForKeyVar: root.ForKeyVar,
                ForValVar: root.ForValVar,
                ForCollExpr: visitTokens(root.ForCollExpr!, visitor),
                ForKeyExpr: root.ForKeyExpr ? visitTokens(root.ForKeyExpr, visitor) : undefined,
                ForValExpr: visitTokens(root.ForValExpr!, visitor),
                ForCondExpr: root.ForCondExpr ? visitTokens(root.ForCondExpr, visitor) : undefined,
            }
    }
}

// lookup the value of a single traverse on an object or array
// root is a syntax token of type object_const or array_const
// traverse is a Traverse object, typically from a scope_traversal.Traverse array
export function lookupTraverse(rootInput: SyntaxToken, traverse: Traverse, errorPrefix: string): any {
    let root: SyntaxToken;
    if (rootInput.Meta?.IsBlock && rootInput.ArrayConst?.length === 1) {
        root = rootInput.ArrayConst[0];
    } else {
        root = rootInput;
    }
    switch (traverse.Type) {
        default:
            throw new Error(`${errorPrefix}: invalid traversal type '${traverse.Type}'`);

        case "attr":
            const rootObj = asVal(root);
            if (typeof rootObj !== "object") {
                throw new Error(`cannot find attribute '${traverse.Name}' on non-object (${root.Type}) '${errorPrefix}'`);
            }
            if (!(traverse.Name! in rootObj)) {
                throw new Error(`cannot find attribute '${traverse.Name}' on object '${errorPrefix}'`);
            }
            return rootObj[traverse.Name!];

        case "index":
            if (typeof traverse.Index === "string") {
                return lookupTraverse(root, { Type: "attr", Name: traverse.Index }, errorPrefix);
            }
            const rootArr = asVal(root);
            if (!Array.isArray(rootArr)) {
                throw new Error(`cannot find index '${traverse.Index}' on non-array '${errorPrefix}'`);
            }
            if (rootArr.length <= traverse.Index! || traverse.Index! < 0) {
                throw new Error(`index '${traverse.Index}' is out of bounds on '${errorPrefix}'`);
            }
            return rootArr[traverse.Index!];
    }
}

export function lookupTraversal(root: SyntaxToken, traverseArr: Traverse[], errorPrefix: string): any {
    if (traverseArr.length === 0) {
        return root;
    }
    if (traverseArr.length === 1) {
        return lookupTraverse(root, traverseArr[0], errorPrefix);
    }
    const debugStr = asStr({ Type: "scope_traversal", Traversal: [traverseArr[0]] });
    return lookupTraversal(
        lookupTraverse(root, traverseArr[0], errorPrefix),
        traverseArr.slice(1),
        errorPrefix + (debugStr.startsWith("[") ? "" : ".") + debugStr
    );
}

export function asStr(token: SyntaxToken | string): string {
    if (typeof token === "string") {
        return token;
    }
    switch (token.Type) {
        default:
            throw new Error(`cannot convert token type '${token.Type}' to string`);

        case "scope_traversal":
            return token.Traversal?.map((traverse, i) => {
                if (traverse.Type === "attr") {
                    return traverse.Name +
                        (i === token.Traversal!.length - 1 || token.Traversal![i + 1].Type !== "attr" ? "" : ".");
                } else {
                    return "[" +
                        (typeof traverse.Index === "string" ? "\"" : "") +
                        traverse.Index +
                        (typeof traverse.Index === "string" ? "\"" : "") +
                        "]" +
                        (i === token.Traversal!.length - 1 || token.Traversal![i + 1].Type !== "attr" ? "" : ".");
                }
            }).join("") || ''

        case "literal_value":
            return token.Value + "";

        case "template":
            return token.Parts?.map(part => asStr(part)).join("") || "";
    }
}

export function mergeTokens(values: SyntaxToken[]): SyntaxToken {
    if (values.length === 0) {
        return asSyntax({});
    }
    if (values.length === 1) {
        return values[0];
    }
    if (values[0] === null) {
        throw new Error("tried to merge null value");
    }
    switch (values[0].Type) {
        default:
            return values[values.length - 1];

        case "literal_value":
            return values[values.length - 1];

        case "array_const":
            return {
                Type: "array_const",
                ArrayConst: values.map(value => value.ArrayConst || []).flat(),
            };

        case "object_const":
            const allObjConst = values.map(value => value.ObjectConst || []).flat();
            const v = {};
            allObjConst.forEach((item, i) => {
                if (!v.hasOwnProperty(item.Key)) {
                    v[item.Key] = mergeTokens(
                        allObjConst
                            .slice(i)
                            .filter((v) => v.Key === item.Key)
                            .map((v) => v.Value)
                    );
                }
            });
            return {
                Type: "object_const",
                ObjectConst: Object.keys(v).map((key) => ({
                    Key: key,
                    Value: v[key],
                })),
            };
    }
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

export function asVal(token: SyntaxToken): any {
    switch (token.Type) {
        case "template":
            return token.Parts?.map(part => asStr(part)).join("") || "";
        case "literal_value":
            return token.Value || null;
        case "array_const":
            return token.ArrayConst || [];
        case "object_const":
            const keys = token.ObjectConst?.map(pair => pair.Key) || [];
            const uniqKeys = new Set(keys);
            const allValues = (key) => token.ObjectConst?.filter(pair => pair.Key === key).map(pair => pair.Value) || [];
            const obj = {};
            uniqKeys.forEach(key => obj[key] = mergeTokens(allValues(key)));
            return obj;
        default:
            throw new Error(`cannot turn token type '${token.Type}' into a value`);
    }
}

export function asValArrayConst(token: SyntaxToken): any[] {
    return asVal(token).map(item => asVal(item));
}

export function asSyntax(token: any): SyntaxToken {
    //typeof null === 'object' so we need to check for null first
    if (typeof token === 'object' && token !== null && token.hasOwnProperty('Type') && (token.Type in SyntaxTokenTypes)) {
        return token;
    } else if (typeof token === 'string' || typeof token === 'number' || typeof token === 'boolean') {
        return {
            Type: "literal_value",
            Value: token
        };
    } else if (Array.isArray(token)) {
        return {
            Type: "array_const",
            ArrayConst: token.filter(child => child !== null).map(child => asSyntax(child))
        };
    } else if (typeof token === 'object' && token !== null) {
        return {
            Type: "object_const",
            ObjectConst: Object.keys(token).map(key => ({
                Key: key,
                Value: asSyntax(token[key])
            }))
        };
    } else {
        //nulls or undefined most likely
        return token;
    }
}

export function asTraversal(str: string): SyntaxToken {
    return {
        Type: "scope_traversal",
        // TODO will output correct string for indexing ("abc[0]") but
        // is using the wrong syntax token (Type: "attr" instead of Type: "index")
        Traversal: str.split(".").map(part => ({
            Type: "attr",
            Name: part
        }))
    };
}

export function asBinaryOp(left: SyntaxToken | number, op: string, right: SyntaxToken | number): SyntaxToken {
    return {
        Type: "binary_op",
        LeftHandSide: asSyntax(left),
        Operator: op,
        RightHandSide: asSyntax(right)
    };
}

export function appendToTraversal(source: SyntaxToken, toAdd: string): SyntaxToken {
    return {
        Type: source.Type,
        Traversal: [
            ...(source.Traversal || []),
            ...toAdd.split(".").map(part => ({
                Type: "attr" as TraverseType,
                Name: part
            }))
        ]
    };
}

export function asFuncCall(funcName: string, args: any[]): SyntaxToken {
    return {
        Type: "function_call",
        FunctionName: funcName,
        FunctionArgs: args.map(asSyntax)
    };
}

export function asTemplate(arr: any[]): SyntaxToken {
    return {
        Type: "template",
        Parts: arr.map(asSyntax)
    };
}

// turns an array of various syntax types into a templated string
export function asTemplateStr(arr: (string | SyntaxToken)[] | (string | SyntaxToken)): SyntaxToken {
    if (!Array.isArray(arr)) {
        arr = [arr];
    }
    return {
        Type: "template",
        Parts: arr.map(item => {
            if (typeof item === 'string') {
                return {
                    Type: "literal_value",
                    Value: item
                }
            }
            if (item.Type === "scope_traversal" || item.Type === "relative_traversal" || item.Type === "literal_value" || item.Type === "template") {
                return item;
            }
            return {
                Type: "literal_value",
                Value: asStr(item)
            };
        })
    };
}

//string concatenation for syntax tokens
export function concatStrArr(token: SyntaxToken): SyntaxToken {
    return {
        Type: "template",
        Parts: asTemplateStr(token.ArrayConst || []).Parts?.flat() || []
    }
}

export function appendToTemplate(source: SyntaxToken, toAdd: any[]): SyntaxToken {
    let parts: SyntaxToken[] = [];
    if (source.Type === "template") {
        parts = source.Parts?.slice() || [];
    } else if (source.Type === "literal_value") {
        parts = [source];
    } else {
        parts = [source];
    }
    parts.push(...toAdd.map(asSyntax));
    return {
        Type: "template",
        Parts: parts
    };
}

export type LabeledBlockCreator = () => {
    block: { [key: string]: any },
    labels: string[]
}

export function asBlock(arr: (LabeledBlockCreator | { [key: string]: any })[]): SyntaxToken {
    return {
        Type: "array_const",
        Meta: { IsBlock: true },
        ArrayConst: arr.map(obj => {
            if (typeof obj === 'function') {
                const { block, labels } = obj();
                return {
                    Type: "object_const",
                    Meta: { 
                        IsBlock: true,
                        Labels: labels
                    },
                    ObjectConst: Object.keys(block).map(key => ({
                        Key: key,
                        Value: asSyntax(block[key])
                    }))
                }
            }
            return {
                Type: "object_const",
                Meta: { IsBlock: true },
                ObjectConst: Object.keys(obj).map(key => ({
                    Key: key,
                    Value: asSyntax(obj[key])
                }))
            }
        })
    }
}

export function iterateAllBlocks<T>(container: DatabagContainer, func: (bag: Databag) => T): T[] {
    const types = Object.keys(container);
    let output: T[] = []
    for (const type of types) {
        const blockNames = Object.keys(container[type]);
        for (const blockName of blockNames) {
            for (const block of container[type][blockName]) {
                output.push(func(block));
            }
        }
    }
    return output;
}

export function iterateBlocks<T>(container: DatabagContainer, ofType: string, func: (bag: Databag) => T): T[] {
    if(!(ofType in container)) {
        return [];
    }
    let output: T[] = []
    const blockNames = Object.keys(container[ofType]);
    for (const blockName of blockNames) {
        for (const block of container[ofType][blockName]) {
            output.push(func(block));
        }
    }
    return output;
}

//this stops at the first non-falsy returned value
export function findInBlocks<T>(container: DatabagContainer, func: (bag: Databag) => T): T | null {
    const types = Object.keys(container);
    for (const type of types) {
        const blockNames = Object.keys(container[type]);
        for (const blockName of blockNames) {
            for (const block of container[type][blockName]) {
                const r = func(block)
                if(r) {
                    return r
                }
            }
        }
    }
    return null
}


export function cloudResourceRaw(params: CloudResourceBuilder): Databag {
    let typeStr = "cr_";
    if (params.kind) {
        typeStr += "[" + params.kind;
        if (params.id) {
            typeStr += "(" + params.id + ")";
        }
        typeStr += "]"
        if (params.type) {
            typeStr += "_";
        }
    }
    if (params.type) {
        typeStr += params.type;
    }

    let value = params.value || {}
    value = asSyntax(value);
    if (params.dir) {
        value = {
            ...value,
            Meta: {
                sub_dir: params.dir
            }
        }
    }
    return {
        Type: typeStr,
        Name: params.name,
        Value: value,
    }
}

export function exportDatabags(bags: (Databag | SugarCoatedDatabag)[] | DatabagContainer) {
    if (!Array.isArray(bags)) {
        bags = iterateAllBlocks(bags, bag => bag);
    }
    if(bags.length === 0) {
        return;
    }
    // console.log("exportDatabags", JSON.stringify(bags));
    const resp = barbeRpcCall({
        method: "exportDatabags",
        params: [{
            databags: bags
        }]
    });
    if (isFailure(resp)) {
        throw new Error(resp.error)
    }
}

export function applyTransformers(input: SugarCoatedDatabag[]): DatabagContainer {
    const resp = barbeRpcCall<DatabagContainer>({
        method: "transformContainer",
        params: [{
            databags: input
        }]
    });
    if (isFailure(resp)) {
        throw new Error(resp.error)
    }
    return resp.result;
}

export type ImportComponentInput = {
    url: string
    name?: string
    copyFromContainer?: string[]
    input?: SugarCoatedDatabag[]
}

export function importComponents(container: DatabagContainer, components: ImportComponentInput[]): DatabagContainer {
    type RealImportComponentInput = {
        url: string
        input: SugarCoatedDatabagContainer
    }
    let barbeImportComponent: SugarCoatedDatabag[] = []
    
    for (const component of components) {
        //TODO include lifecycle step maybe?
        let importComponentInput: RealImportComponentInput = {
            url: component.url,
            input: {}
        }
        if(component.copyFromContainer) {
            for (const copyFrom of component.copyFromContainer) {
                if (copyFrom in container) {
                    importComponentInput.input[copyFrom] = container[copyFrom];
                }
            }
        }
        if(component.input) {
            for(const databag of component.input) {
                const type = databag.Type;
                const name = databag.Name;
                if(!(type in importComponentInput.input)) {
                    importComponentInput.input[type] = {}
                }
                if(!(name in importComponentInput.input[type])){ 
                    importComponentInput.input[type][name] = []
                }
                importComponentInput.input[type][name].push(databag);
            }
        }
        
        const id = `${component.name || ''}_${component.url}`
        barbeImportComponent.push({
            Type: "barbe_import_component",
            Name: id,
            Value: importComponentInput
        })
    }

    // console.log('barbeImportComponent', JSON.stringify(barbeImportComponent))
    const resp = barbeRpcCall<DatabagContainer>({
        method: "importComponents",
        params: [{
            databags: barbeImportComponent
        }]
    });
    // console.log('barbeImportComponent resp', JSON.stringify(resp))
    if (isFailure(resp)) {
        throw new Error(resp.error)
    }
    return resp.result;
}

type FileStat = {
    name: string
    size: number
    isDir: boolean
}
export function statFile(fileName: string): RpcResponse<FileStat> {
    return barbeRpcCall<FileStat>({
        method: "statFile",
        params: [fileName]
    });
}

export function dirname(path: string): string {
    const parts = path.split("/");
    if (parts.length === 1) {
        return ".";
    } else if (parts.length === 2 && parts[0] === "") {
        return "/";
    } else {
        parts.pop();
        return parts.join("/");
    }
}

export function throwStatement(message: string): never {
    throw new Error(message)
}

export function readDatabagContainer() {
    return JSON.parse(os.file.readFile("__barbe_input.json"))
}

export function onlyRunForLifecycleSteps(steps: string[]) {
    const step = barbeLifecycleStep();
    if (!steps.includes(step)) {
        quit()
    }
}

export type LifecycleStep = 'pre_generate' |
    'generate' |
    'post_generate' |
    'pre_do' |
    'pre_apply' |
    'apply' |
    'post_apply' |
    'pre_destroy' |
    'destroy' |
    'post_destroy' |
    'post_do'


export const IS_VERBOSE = os.getenv("BARBE_VERBOSE") === "1"

//this is the current step being run, even if the user is running 'barbe apply', the step might be 'generate'
export function barbeLifecycleStep(): LifecycleStep {
    return os.getenv("BARBE_LIFECYCLE_STEP") as LifecycleStep;
}

export const allGenerateSteps: LifecycleStep[] = ['pre_generate', 'generate', 'post_generate'];
export const allApplySteps: LifecycleStep[] = ['pre_do', 'pre_apply', 'apply', 'post_apply', 'post_do'];
export const allDestroySteps: LifecycleStep[] = ['pre_do', 'pre_destroy', 'destroy', 'post_destroy', 'post_do'];

type Command = 'generate' | 'apply' | 'destroy'
//this is the command that barbe is 'aiming for'
//meaning even if we're in the 'generate' lifecycle step, the command might be 'apply'
export function barbeCommand(): Command {
    return os.getenv("BARBE_COMMAND") as Command;
}

export function barbeOutputDir(): string {
    return os.getenv("BARBE_OUTPUT_DIR")!;
}

export function uniq<T>(arr: T[], key?: (item: T) => any): T[] {
    const seen = new Set();
    return arr.filter(item => {
        const val = key ? key(item) : item;
        if (seen.has(val)) {
            return false;
        }
        seen.add(val);
        return true;
    });
}

export const BarbeState = {
    readState: () => JSON.parse(os.file.readFile("__barbe_state.json")),

    setValue: (key: string, value: any) => ({
        Type: 'barbe_state(set_value)',
        Name: key,
        Value: value
    }),

    deleteKey: (key: string) => ({
        Type: 'barbe_state(delete_key)',
        Name: key,
        Value: null
    }),

    putInObject: (key: string, value: { [key: string]: any }) => ({
        Type: 'barbe_state(put_in_object)',
        Name: key,
        Value: value
    }),

    getObjectValue: (state: any, key: string, valueKey: string): any | undefined => state && state[key] && state[key][valueKey],

    deleteFromObject: (key: string, valueKey: string) => ({
        Type: 'barbe_state(delete_from_object)',
        Name: key,
        Value: valueKey
    })
}