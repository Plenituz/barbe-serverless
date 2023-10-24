import {
    accumulateTokens,
    iterateAllBlocks,
    readDatabagContainer,
    SyntaxToken,
    visitTokens,
    isSimpleTemplate,
    asStr,
    asSyntax,
    exportDatabags,
    Databag
} from './barbe-std/utils';

const container = readDatabagContainer()

let tokenMap: { match: SyntaxToken, replace_by: SyntaxToken }[] = []

const conditionSimplifier = (notifyChange: () => void) => (token: SyntaxToken): SyntaxToken | null => {
    if(token.Type !== 'conditional') {
        return null
    }
    if(token.Condition?.Type !== 'binary_op') {
        return null
    }
    if(token.Condition.Operator !== '==') {
        return null
    }
    if(!isSimpleTemplate(token.Condition.LeftHandSide) || !isSimpleTemplate(token.Condition.RightHandSide)) {
        return null
    }
    notifyChange()
    //here we know we have a simple template on both sides of the binary operator
    if(asStr(token.Condition.LeftHandSide) === asStr(token.Condition.RightHandSide)) {
        return token.TrueResult
    } else {
        return token.FalseResult
    }
}

function visitor(token: SyntaxToken): SyntaxToken | null {
    if(token.Type !== 'function_call') {
        return null
    }

    switch(token.FunctionName) {
        case 'replace':
            if(token.FunctionArgs?.length !== 3) {
                return null
            }
            if(!isSimpleTemplate(token.FunctionArgs[0]) || 
                !isSimpleTemplate(token.FunctionArgs[1]) || 
                !isSimpleTemplate(token.FunctionArgs[2])) {
                return null
            }
            const find = asStr(token.FunctionArgs[1])
            const replaceBy = asStr(token.FunctionArgs[2])
            const tokenMapReplaceBy = asStr(token.FunctionArgs[0]).split(find).join(replaceBy)
            tokenMap.push({
                match: token,
                replace_by: asSyntax(tokenMapReplaceBy)
            })
            break
    }

    return null
}

iterateAllBlocks(container, (bag) => {
    if(!bag.Value) {
        return []
    }
    visitTokens(bag.Value, visitor)
})

iterateAllBlocks(container, (bag) => {
    if(!bag.Value) {
        return []
    }
    let changed = false
    let newValue = visitTokens(bag.Value, conditionSimplifier(() => changed = true))
    if(changed) {
        bag.Value = newValue
        exportDatabags([bag])
    }
})

if(tokenMap.length !== 0) {
    exportDatabags([{
        Type: 'token_map',
        Name: 'baked_funcs_token_map',
        Value: tokenMap
    }])
}