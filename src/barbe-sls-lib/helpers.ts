// this is for functions that are pretty specific to components but could be shared between components

import { guessAwsDnsZoneBasedOnDomainName } from '../../../anyfront/src/anyfront-lib/lib';
import { accumulateTokens, DatabagContainer, iterateAllBlocks, SyntaxToken, visitTokens, findInBlocks, SugarCoatedDatabag, asTraversal, asSyntax } from '../barbe-std/utils';
import { PreConfFactory, DatabagObjVal } from './lib';

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
    return !!findInBlocks(container, (bag) => {
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

/*
dotDomain: {
    name: string,
    zone?: string,
    certificate_arn?: string,
    existing_certificate_domain?: string,
    certificate_domain_to_create?: string,
}
*/
export function domainBlockResources(dotDomain: DatabagObjVal, domainValue: SyntaxToken, resourcePrefix: string, cloudData: PreConfFactory, cloudResource: PreConfFactory): { certArn: SyntaxToken, databags: SugarCoatedDatabag[] } {
    if(!dotDomain.name) {
        throw new Error('no domain name given')
    }
    let certArn: SyntaxToken
    const acmCertificateResources = (domain: SyntaxToken): SugarCoatedDatabag[] => {
        return [
            cloudResource('aws_acm_certificate', `${resourcePrefix}_cert`, {
                domain_name: domain,
                validation_method: 'DNS'
            }),
            cloudResource('aws_route53_record', `${resourcePrefix}_validation_record`, {
                for_each: {
                    Type: 'for',
                    ForKeyVar: "dvo",
                    ForCollExpr: asTraversal(`aws_acm_certificate.${resourcePrefix}_cert.domain_validation_options`),
                    ForKeyExpr: asTraversal("dvo.domain_name"),
                    ForValExpr: asSyntax({
                        name: asTraversal("dvo.resource_record_name"),
                        record: asTraversal("dvo.resource_record_value"),
                        type: asTraversal("dvo.resource_record_type"),
                    })
                },
                allow_overwrite: true,
                name: asTraversal("each.value.name"),
                records: [
                    asTraversal("each.value.record")
                ],
                ttl: 60,
                type: asTraversal("each.value.type"),
                zone_id: asTraversal(`data.aws_route53_zone.${resourcePrefix}_zone.zone_id`)
            }),
            cloudResource('aws_acm_certificate_validation', `${resourcePrefix}_validation`, {
                certificate_arn: asTraversal(`aws_acm_certificate.${resourcePrefix}_cert.arn`),
                validation_record_fqdns: {
                    Type: 'for',
                    ForValVar: "record",
                    ForCollExpr: asTraversal(`aws_route53_record.${resourcePrefix}_validation_record`),
                    ForValExpr: asTraversal("record.fqdn"),
                }
            })
        ]
    }

    let databags: SugarCoatedDatabag[] = []
    databags.push(
        cloudData('aws_route53_zone', `${resourcePrefix}_zone`, {
            name: dotDomain.zone || guessAwsDnsZoneBasedOnDomainName(dotDomain.name) || (() => {throw new Error('no \'zone\' given and could not guess based on domain name')})(),
        }),
        cloudResource('aws_route53_record', `${resourcePrefix}_domain_record`, {
            zone_id: asTraversal(`data.aws_route53_zone.${resourcePrefix}_zone.zone_id`),
            name: dotDomain.name,
            type: "CNAME",
            ttl: 300,
            records: [domainValue]
        })
    )
    if(!dotDomain.certificate_arn) {
        if(dotDomain.existing_certificate_domain) {
            certArn = asTraversal(`data.aws_acm_certificate.${resourcePrefix}_imported_certificate.arn`)
            databags.push(
                cloudData('aws_acm_certificate', `${resourcePrefix}_imported_certificate`, {
                    domain: dotDomain.existing_certificate_domain,
                    types: ['AMAZON_ISSUED'],
                    most_recent: true
                })
            )
        } else if(dotDomain.certificate_domain_to_create) {
            certArn = asTraversal(`aws_acm_certificate.${resourcePrefix}_cert.arn`)
            databags.push(...acmCertificateResources(dotDomain.certificate_domain_to_create))
        } else {
            certArn = asTraversal(`aws_acm_certificate.${resourcePrefix}_cert.arn`)
            databags.push(...acmCertificateResources(dotDomain.name))
        }
    } else {
        certArn = dotDomain.certificate_arn
    }
    return { certArn, databags }
}