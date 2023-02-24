// this is for functions that are pretty specific to components but could be shared between components

import { guessAwsDnsZoneBasedOnDomainName, isDomainNameApex } from '../../../anyfront/src/anyfront-lib/lib';
import { accumulateTokens, DatabagContainer, iterateAllBlocks, SyntaxToken, visitTokens, findInBlocks, SugarCoatedDatabag, asTraversal, asSyntax, throwStatement, asVal, asBlock } from '../barbe-std/utils';
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
certRef is only returned if the ACM certificate is created by this function
*/
type awsDomainBlockResourcesInput = {
    dotDomain: DatabagObjVal
    domainValue: SyntaxToken
    resourcePrefix: string
    apexHostedZoneId: SyntaxToken
    cloudData: PreConfFactory
    cloudResource: PreConfFactory
}
type awsDomainBlockResourcesOutput = {
    certArn: SyntaxToken
    // certRef is only returned if the ACM certificate is created by this function
    certRef?: SyntaxToken
    databags: SugarCoatedDatabag[]
    // the inputed dotDomain.name or dotDomain.names as an array
    domainNames: SyntaxToken[]
}
export function awsDomainBlockResources({ dotDomain, domainValue, resourcePrefix, apexHostedZoneId, cloudData, cloudResource }: awsDomainBlockResourcesInput): awsDomainBlockResourcesOutput | null {
    const nameToken = dotDomain.name || dotDomain.names
    if(!nameToken) {
        return null
    }
    let domainNames: SyntaxToken[] = []
    if(nameToken.Type === 'array_const') {
        domainNames = nameToken.ArrayConst || []
    } else {
        domainNames = [nameToken]
    }

    let certArn: SyntaxToken
    let certRef: SyntaxToken | undefined
    const acmCertificateResources = (domains: SyntaxToken[]): SugarCoatedDatabag[] => {
        return [
            cloudResource('aws_acm_certificate', `${resourcePrefix}_cert`, {
                domain_name: domains[0],
                subject_alternative_names: domains.slice(1),
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

    let zoneName = dotDomain.zone
    if(!zoneName) {
        for(const domain of domainNames) {
            const guessedZone = guessAwsDnsZoneBasedOnDomainName(domain)
            if(guessedZone) {
                zoneName = asSyntax(guessedZone)
                break
            }
        }
    }
    if(!zoneName) {
        throwStatement('no \'zone\' given and could not guess based on domain name')
    }
    let databags: SugarCoatedDatabag[] = []
    databags.push(
        cloudData('aws_route53_zone', `${resourcePrefix}_zone`, {
            name: zoneName,
        })
    )
    const forceAlias = asVal(dotDomain.use_alias || asSyntax(false))
    for(let i = 0; i < domainNames.length; i++) {
        const domain = domainNames[i]
        //an apex domain is the root domain of a zone, e.g. example.com's apex is example.com (non apex would be abc.example.com)
        const isApex = isDomainNameApex(domain, zoneName)
        if(forceAlias || isApex) {
            databags.push(
                cloudResource('aws_route53_record', `${resourcePrefix}_${i}_alias_record`, {
                    zone_id: asTraversal(`data.aws_route53_zone.${resourcePrefix}_zone.zone_id`),
                    name: domain,
                    type: "A",
                    alias: asBlock([{
                        name: domainValue,
                        zone_id: apexHostedZoneId,
                        evaluate_target_health: false
                    }])
                }),
                //when a cloudfront distribution has ipv6 enabled we need 2 alias records, one A for ipv4 and one AAAA for ipv6
                cloudResource('aws_route53_record', `${resourcePrefix}_${i}_alias_record_ipv6`, {
                    zone_id: asTraversal(`data.aws_route53_zone.${resourcePrefix}_zone.zone_id`),
                    name: domain,
                    type: "AAAA",
                    alias: asBlock([{
                        name: domainValue,
                        zone_id: apexHostedZoneId,
                        evaluate_target_health: false
                    }])
                })
            )
        } else {
            databags.push(
                cloudResource('aws_route53_record', `${resourcePrefix}_${i}_domain_record`, {
                    zone_id: asTraversal(`data.aws_route53_zone.${resourcePrefix}_zone.zone_id`),
                    name: domain,
                    type: "CNAME",
                    ttl: 300,
                    records: [domainValue]
                })
            )
        }
    }
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
            certRef = asTraversal(`aws_acm_certificate.${resourcePrefix}_cert`)
            let certsToCreate: SyntaxToken[] = []
            if(dotDomain.certificate_domain_to_create.Type === 'array_const') {
                certsToCreate = dotDomain.certificate_domain_to_create.ArrayConst || []
            } else {
                certsToCreate = [dotDomain.certificate_domain_to_create]
            }
            databags.push(...acmCertificateResources(certsToCreate))
        } else {
            certArn = asTraversal(`aws_acm_certificate.${resourcePrefix}_cert.arn`)
            certRef = asTraversal(`aws_acm_certificate.${resourcePrefix}_cert`)
            databags.push(...acmCertificateResources(domainNames))
        }
    } else {
        certArn = dotDomain.certificate_arn
    }
    return { certArn, certRef, databags, domainNames }
}