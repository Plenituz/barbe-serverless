// this is for functions that are pretty specific to components but could be shared between components

import {accumulateTokens, DatabagContainer, iterateAllBlocks, SyntaxToken, visitTokens, findInBlocks} from "../barbe-std/utils";

//collect all the regions referenced as `aws.<region>`
export function listReferencedAWSRegions(container: DatabagContainer): string[] {
    const regionNames = iterateAllBlocks(container, (bag): string[] => {
        if(!bag.Value) {
            return [];
        }
        const keepTokens = (token: SyntaxToken) => {
            return token.Type === "scope_traversal" &&
                (token.Traversal || []).length === 2 &&
                token.Traversal![0].Name === "aws";
        };
        const allTraversals = accumulateTokens(bag.Value, keepTokens);
        const regionNamesInThisBlock = allTraversals.map(token => {
            if (!token.Traversal || !token.Traversal[1] || !token.Traversal[1].Name) {
                console.log(`!!!malformatted region traversal: '${token}'`)
                return ''
            }
            return token.Traversal[1].Name
        })
        .filter(name => name)
        return Array.from(new Set(regionNamesInThisBlock));
    }).flat()
    return Array.from(new Set(regionNames));
}

export function hasToken(container: DatabagContainer, tokenFunc: (token: SyntaxToken) => boolean): boolean {
    return findInBlocks(container, (bag) => {
        if(!bag.Value) {
            return false;
        }
        let found = false
        visitTokens(bag.Value, token => {
            if(tokenFunc(token)) {
                found = true
                //non-null return stops the iteration
                return token
            }
            return null
        })
        return found;
    })
}