import { accumulateTokens, iterateAllBlocks, readDatabagContainer, SyntaxToken, visitTokens, isSimpleTemplate, asStr, asSyntax, exportDatabags } from './barbe-std/utils';

const container = readDatabagContainer()

let tokenMap: { match: SyntaxToken, replace_by: SyntaxToken }[] = []

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

if(tokenMap.length !== 0) {
    exportDatabags([{
        Type: 'token_map',
        Name: 'baked_funcs_token_map',
        Value: tokenMap
    }])
}