(() => {
  // barbe-sls-lib/consts.ts
  var AWS_CERT_DOMAIN = "aws_cert_domain";
  var BARBE_SLS_VERSION = "v0.2.3";
  var TERRAFORM_EXECUTE_URL = `barbe-serverless/terraform_execute.js:${BARBE_SLS_VERSION}`;
  var AWS_NETWORK_URL = `barbe-serverless/aws_network.js:${BARBE_SLS_VERSION}`;

  // barbe-std/rpc.ts
  function isFailure(resp) {
    return resp.error !== void 0;
  }
  function barbeRpcCall(req) {
    const msg = JSON.stringify(req);
    console.log(msg);
    const rawResp = readline();
    return JSON.parse(rawResp);
  }

  // barbe-std/utils.ts
  var SyntaxTokenTypes = {
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
    "anon": true
  };
  function asStr(token) {
    if (typeof token === "string") {
      return token;
    }
    switch (token.Type) {
      default:
        throw new Error(`cannot convert token type '${token.Type}' to string`);
      case "scope_traversal":
        return token.Traversal?.map((traverse, i) => {
          if (traverse.Type === "attr") {
            return traverse.Name + (i === token.Traversal.length - 1 || token.Traversal[i + 1].Type !== "attr" ? "" : ".");
          } else {
            return "[" + (typeof traverse.Index === "string" ? '"' : "") + traverse.Index + (typeof traverse.Index === "string" ? '"' : "") + "]" + (i === token.Traversal.length - 1 || token.Traversal[i + 1].Type !== "attr" ? "" : ".");
          }
        }).join("") || "";
      case "literal_value":
        return token.Value + "";
      case "template":
        return token.Parts?.map((part) => asStr(part)).join("") || "";
    }
  }
  function mergeTokens(values) {
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
          ArrayConst: values.map((value) => value.ArrayConst || []).flat()
        };
      case "object_const":
        const allObjConst = values.map((value) => value.ObjectConst || []).flat();
        const v = {};
        allObjConst.forEach((item, i) => {
          if (!v.hasOwnProperty(item.Key)) {
            v[item.Key] = mergeTokens(
              allObjConst.slice(i).filter((v2) => v2.Key === item.Key).map((v2) => v2.Value)
            );
          }
        });
        return {
          Type: "object_const",
          ObjectConst: Object.keys(v).map((key) => ({
            Key: key,
            Value: v[key]
          }))
        };
    }
  }
  function isSimpleTemplate(token) {
    if (!token) {
      return false;
    }
    if (typeof token === "string" || token.Type === "literal_value") {
      return true;
    }
    if (token.Type !== "template") {
      return false;
    }
    if (!token.Parts) {
      return true;
    }
    return token.Parts.every(isSimpleTemplate);
  }
  function asVal(token) {
    switch (token.Type) {
      case "template":
        return token.Parts?.map((part) => asStr(part)).join("") || "";
      case "literal_value":
        return token.Value || null;
      case "array_const":
        return token.ArrayConst || [];
      case "object_const":
        const keys = token.ObjectConst?.map((pair) => pair.Key) || [];
        const uniqKeys = new Set(keys);
        const allValues = (key) => token.ObjectConst?.filter((pair) => pair.Key === key).map((pair) => pair.Value) || [];
        const obj = {};
        uniqKeys.forEach((key) => obj[key] = mergeTokens(allValues(key)));
        return obj;
      default:
        throw new Error(`cannot turn token type '${token.Type}' into a value`);
    }
  }
  function asSyntax(token) {
    if (typeof token === "object" && token !== null && token.hasOwnProperty("Type") && token.Type in SyntaxTokenTypes) {
      return token;
    } else if (typeof token === "string" || typeof token === "number" || typeof token === "boolean") {
      return {
        Type: "literal_value",
        Value: token
      };
    } else if (Array.isArray(token)) {
      return {
        Type: "array_const",
        ArrayConst: token.filter((child) => child !== null).map((child) => asSyntax(child))
      };
    } else if (typeof token === "object" && token !== null) {
      return {
        Type: "object_const",
        ObjectConst: Object.keys(token).map((key) => ({
          Key: key,
          Value: asSyntax(token[key])
        }))
      };
    } else {
      return token;
    }
  }
  function asTraversal(str) {
    return {
      Type: "scope_traversal",
      // TODO will output correct string for indexing ("abc[0]") but
      // is using the wrong syntax token (Type: "attr" instead of Type: "index")
      Traversal: str.split(".").map((part) => ({
        Type: "attr",
        Name: part
      }))
    };
  }
  function asBlock(arr) {
    return {
      Type: "array_const",
      Meta: { IsBlock: true },
      ArrayConst: arr.map((obj) => {
        if (typeof obj === "function") {
          const { block, labels } = obj();
          return {
            Type: "object_const",
            Meta: {
              IsBlock: true,
              Labels: labels
            },
            ObjectConst: Object.keys(block).map((key) => ({
              Key: key,
              Value: asSyntax(block[key])
            }))
          };
        }
        return {
          Type: "object_const",
          Meta: { IsBlock: true },
          ObjectConst: Object.keys(obj).map((key) => ({
            Key: key,
            Value: asSyntax(obj[key])
          }))
        };
      })
    };
  }
  function iterateAllBlocks(container2, func) {
    const types = Object.keys(container2);
    let output = [];
    for (const type of types) {
      const blockNames = Object.keys(container2[type]);
      for (const blockName of blockNames) {
        for (const block of container2[type][blockName]) {
          output.push(func(block));
        }
      }
    }
    return output;
  }
  function iterateBlocks(container2, ofType, func) {
    if (!(ofType in container2)) {
      return [];
    }
    let output = [];
    const blockNames = Object.keys(container2[ofType]);
    for (const blockName of blockNames) {
      for (const block of container2[ofType][blockName]) {
        output.push(func(block));
      }
    }
    return output;
  }
  function cloudResourceRaw(params) {
    let typeStr = "cr_";
    if (params.kind) {
      typeStr += "[" + params.kind;
      if (params.id) {
        typeStr += "(" + params.id + ")";
      }
      typeStr += "]";
      if (params.type) {
        typeStr += "_";
      }
    }
    if (params.type) {
      typeStr += params.type;
    }
    let value = params.value || {};
    value = asSyntax(value);
    if (params.dir) {
      value = {
        ...value,
        Meta: {
          sub_dir: params.dir
        }
      };
    }
    return {
      Type: typeStr,
      Name: params.name,
      Value: value
    };
  }
  function exportDatabags(bags) {
    if (!Array.isArray(bags)) {
      bags = iterateAllBlocks(bags, (bag) => bag);
    }
    if (bags.length === 0) {
      return;
    }
    const resp = barbeRpcCall({
      method: "exportDatabags",
      params: [{
        databags: bags
      }]
    });
    if (isFailure(resp)) {
      throw new Error(resp.error);
    }
  }
  function throwStatement(message) {
    throw new Error(message);
  }
  function readDatabagContainer() {
    return JSON.parse(os.file.readFile("__barbe_input.json"));
  }
  function onlyRunForLifecycleSteps(steps) {
    const step2 = barbeLifecycleStep();
    if (!steps.includes(step2)) {
      quit();
    }
  }
  var IS_VERBOSE = os.getenv("BARBE_VERBOSE") === "1";
  function barbeLifecycleStep() {
    return os.getenv("BARBE_LIFECYCLE_STEP");
  }

  // ../../anyfront/src/anyfront-lib/consts.ts
  var BARBE_SLS_VERSION2 = "v0.2.3";
  var ANYFRONT_VERSION = "v0.2.5";
  var TERRAFORM_EXECUTE_URL2 = `https://hub.barbe.app/barbe-serverless/terraform_execute.js:${BARBE_SLS_VERSION2}`;
  var AWS_IAM_URL = `https://hub.barbe.app/barbe-serverless/aws_iam.js:${BARBE_SLS_VERSION2}`;
  var AWS_LAMBDA_URL = `https://hub.barbe.app/barbe-serverless/aws_function.js:${BARBE_SLS_VERSION2}`;
  var GCP_PROJECT_SETUP_URL = `https://hub.barbe.app/anyfront/gcp_project_setup.js:${ANYFRONT_VERSION}`;
  var AWS_S3_SYNC_URL = `https://hub.barbe.app/anyfront/aws_s3_sync_files.js:${ANYFRONT_VERSION}`;
  var FRONTEND_BUILD_URL = `https://hub.barbe.app/anyfront/frontend_build.js:${ANYFRONT_VERSION}`;
  var GCP_CLOUDRUN_STATIC_HOSTING_URL = `https://hub.barbe.app/anyfront/gcp_cloudrun_static_hosting.js:${ANYFRONT_VERSION}`;
  var AWS_NEXT_JS_URL = `https://hub.barbe.app/anyfront/aws_next_js.js:${ANYFRONT_VERSION}`;
  var GCP_NEXT_JS_URL = `https://hub.barbe.app/anyfront/gcp_next_js.js:${ANYFRONT_VERSION}`;
  var AWS_SVELTEKIT_URL = `https://hub.barbe.app/anyfront/aws_sveltekit.js:${ANYFRONT_VERSION}`;
  var AWS_CLOUDFRONT_STATIC_HOSTING_URL = `https://hub.barbe.app/anyfront/aws_cloudfront_static_hosting.js:${ANYFRONT_VERSION}`;
  var STATIC_HOSTING_URL = `https://hub.barbe.app/anyfront/static_hosting.js:${ANYFRONT_VERSION}`;

  // barbe-sls-lib/lib.ts
  function compileDefaults(container2, name) {
    let blocks = [];
    if (container2.global_default) {
      const globalDefaults = Object.values(container2.global_default).flatMap((group) => group.map((block) => block.Value)).filter((block) => block);
      blocks.push(...globalDefaults);
    }
    if (container2.default && container2.default[name]) {
      blocks.push(...container2.default[name].map((block) => block.Value).filter((block) => block));
    }
    return mergeTokens(blocks);
  }
  function applyDefaults(container2, block) {
    if (block.Type !== "object_const") {
      throw new Error(`cannot apply defaults to token type '${block.Type}'`);
    }
    const copyFrom = block.ObjectConst?.find((pair) => pair.Key === "copy_from");
    let defaults;
    if (copyFrom) {
      defaults = compileDefaults(container2, asStr(copyFrom.Value));
    } else {
      defaults = compileDefaults(container2, "");
    }
    const blockVal = asVal(mergeTokens([defaults, block]));
    delete blockVal.name_prefix;
    return [
      blockVal,
      compileNamePrefix(container2, block)
    ];
  }
  function compileNamePrefix(container2, block) {
    let namePrefixes = [];
    if (container2.global_default) {
      const globalDefaults = Object.values(container2.global_default).flatMap((group) => group.map((block2) => block2.Value)).filter((block2) => block2).flatMap((block2) => block2.ObjectConst?.filter((pair) => pair.Key === "name_prefix")).filter((block2) => block2).map((block2) => block2.Value);
      namePrefixes.push(...globalDefaults);
    }
    let defaultName = "";
    if (block) {
      const copyFrom = block.ObjectConst?.find((pair) => pair.Key === "copy_from");
      if (copyFrom) {
        defaultName = asStr(copyFrom.Value);
      }
    }
    if (container2.default && container2.default[defaultName]) {
      const defaults = container2.default[defaultName].map((bag) => bag.Value).filter((block2) => block2).flatMap((block2) => block2.ObjectConst?.filter((pair) => pair.Key === "name_prefix")).filter((block2) => block2).map((block2) => block2.Value);
      namePrefixes.push(...defaults);
    }
    if (block) {
      namePrefixes.push(...block.ObjectConst?.filter((pair) => pair.Key === "name_prefix").map((pair) => pair.Value) || []);
    }
    let output = {
      Type: "template",
      Parts: []
    };
    const mergeIn = (namePrefixToken) => {
      switch (namePrefixToken.Type) {
        case "literal_value":
          output.Parts.push(namePrefixToken);
          break;
        case "template":
          output.Parts.push(...namePrefixToken.Parts || []);
          break;
        case "array_const":
          namePrefixToken.ArrayConst?.forEach(mergeIn);
          break;
        default:
          console.log("unknown name_prefix type '", namePrefixToken.Type, "'");
      }
    };
    for (const namePrefixToken of namePrefixes) {
      mergeIn(namePrefixToken);
    }
    return output;
  }
  function preConfCloudResourceFactory(blockVal, kind, preconf, bagPreconf) {
    const cloudResourceId = blockVal.cloudresource_id ? asStr(blockVal.cloudresource_id) : void 0;
    const cloudResourceDir = blockVal.cloudresource_dir ? asStr(blockVal.cloudresource_dir) : void 0;
    return (type, name, value) => {
      value = {
        provider: blockVal.region && type.includes("aws") ? asTraversal(`aws.${asStr(blockVal.region)}`) : void 0,
        ...preconf,
        ...value
      };
      return cloudResourceRaw({
        kind,
        dir: cloudResourceDir,
        id: cloudResourceId,
        type,
        name,
        value: Object.entries(value).filter(([_, v]) => v !== null && v !== void 0).reduce((acc, [k, v]) => Object.assign(acc, { [k]: v }), {}),
        ...bagPreconf
      });
    };
  }
  function preConfTraversalTransform(blockVal) {
    return (name, transforms) => ({
      Name: `${blockVal.Name}_${name}`,
      Type: "traversal_transform",
      Value: transforms
    });
  }

  // ../../anyfront/src/anyfront-lib/lib.ts
  function guessAwsDnsZoneBasedOnDomainName(domainName) {
    if (!domainName) {
      return null;
    }
    if (!isSimpleTemplate(domainName)) {
      return null;
    }
    const parts = asStr(domainName).split(".");
    if (parts.length === 2) {
      return `${parts[0]}.${parts[1]}`;
    }
    if (parts.length < 3) {
      return null;
    }
    return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
  }
  function isDomainNameApex(domainName, zoneName) {
    if (!domainName) {
      return null;
    }
    if (!isSimpleTemplate(domainName)) {
      return null;
    }
    const domainNameStr = asStr(domainName);
    if (zoneName && isSimpleTemplate(zoneName) && domainNameStr === asStr(zoneName)) {
      return true;
    }
    const parts = domainNameStr.split(".");
    if (parts.length === 2) {
      return true;
    }
    return false;
  }

  // barbe-sls-lib/helpers.ts
  function awsDomainBlockResources({ dotDomain, domainValue, resourcePrefix, apexHostedZoneId, cloudData, cloudResource }) {
    const nameToken = dotDomain.name || dotDomain.names;
    if (!nameToken) {
      return null;
    }
    let domainNames = [];
    if (nameToken.Type === "array_const") {
      domainNames = nameToken.ArrayConst || [];
    } else {
      domainNames = [nameToken];
    }
    let certArn;
    let certRef;
    const acmCertificateResources = (domains) => {
      return [
        cloudResource("aws_acm_certificate", `${resourcePrefix}_cert`, {
          domain_name: domains[0],
          subject_alternative_names: domains.slice(1),
          validation_method: "DNS"
        }),
        cloudResource("aws_route53_record", `${resourcePrefix}_validation_record`, {
          for_each: {
            Type: "for",
            ForKeyVar: "dvo",
            ForCollExpr: asTraversal(`aws_acm_certificate.${resourcePrefix}_cert.domain_validation_options`),
            ForKeyExpr: asTraversal("dvo.domain_name"),
            ForValExpr: asSyntax({
              name: asTraversal("dvo.resource_record_name"),
              record: asTraversal("dvo.resource_record_value"),
              type: asTraversal("dvo.resource_record_type")
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
        cloudResource("aws_acm_certificate_validation", `${resourcePrefix}_validation`, {
          certificate_arn: asTraversal(`aws_acm_certificate.${resourcePrefix}_cert.arn`),
          validation_record_fqdns: {
            Type: "for",
            ForValVar: "record",
            ForCollExpr: asTraversal(`aws_route53_record.${resourcePrefix}_validation_record`),
            ForValExpr: asTraversal("record.fqdn")
          }
        })
      ];
    };
    let zoneName = dotDomain.zone;
    if (!zoneName) {
      for (const domain of domainNames) {
        const guessedZone = guessAwsDnsZoneBasedOnDomainName(domain);
        if (guessedZone) {
          zoneName = asSyntax(guessedZone);
          break;
        }
      }
    }
    if (!zoneName) {
      throwStatement("no 'zone' given and could not guess based on domain name");
    }
    let databags = [];
    databags.push(
      cloudData("aws_route53_zone", `${resourcePrefix}_zone`, {
        name: zoneName
      })
    );
    const forceAlias = asVal(dotDomain.use_alias || asSyntax(false));
    for (let i = 0; i < domainNames.length; i++) {
      const domain = domainNames[i];
      const isApex = isDomainNameApex(domain, zoneName);
      if (forceAlias || isApex) {
        databags.push(
          cloudResource("aws_route53_record", `${resourcePrefix}_${i}_alias_record`, {
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
          cloudResource("aws_route53_record", `${resourcePrefix}_${i}_alias_record_ipv6`, {
            zone_id: asTraversal(`data.aws_route53_zone.${resourcePrefix}_zone.zone_id`),
            name: domain,
            type: "AAAA",
            alias: asBlock([{
              name: domainValue,
              zone_id: apexHostedZoneId,
              evaluate_target_health: false
            }])
          })
        );
      } else {
        databags.push(
          cloudResource("aws_route53_record", `${resourcePrefix}_${i}_domain_record`, {
            zone_id: asTraversal(`data.aws_route53_zone.${resourcePrefix}_zone.zone_id`),
            name: domain,
            type: "CNAME",
            ttl: 300,
            records: [domainValue]
          })
        );
      }
    }
    if (!dotDomain.certificate_arn) {
      if (dotDomain.existing_certificate_domain) {
        certArn = asTraversal(`data.aws_acm_certificate.${resourcePrefix}_imported_certificate.arn`);
        databags.push(
          cloudData("aws_acm_certificate", `${resourcePrefix}_imported_certificate`, {
            domain: dotDomain.existing_certificate_domain,
            types: ["AMAZON_ISSUED"],
            most_recent: true
          })
        );
      } else if (dotDomain.certificate_domain_to_create) {
        certArn = asTraversal(`aws_acm_certificate.${resourcePrefix}_cert.arn`);
        certRef = asTraversal(`aws_acm_certificate.${resourcePrefix}_cert`);
        let certsToCreate = [];
        if (dotDomain.certificate_domain_to_create.Type === "array_const") {
          certsToCreate = dotDomain.certificate_domain_to_create.ArrayConst || [];
        } else {
          certsToCreate = [dotDomain.certificate_domain_to_create];
        }
        databags.push(...acmCertificateResources(certsToCreate));
      } else {
        certArn = asTraversal(`aws_acm_certificate.${resourcePrefix}_cert.arn`);
        certRef = asTraversal(`aws_acm_certificate.${resourcePrefix}_cert`);
        databags.push(...acmCertificateResources(domainNames));
      }
    } else {
      certArn = dotDomain.certificate_arn;
    }
    return { certArn, certRef, databags, domainNames };
  }

  // aws_cert_domain.ts
  var container = readDatabagContainer();
  onlyRunForLifecycleSteps(["pre_generate", "generate", "post_generate"]);
  function awsCertDomainIterator(bag) {
    if (!bag.Value) {
      return [];
    }
    const [block, namePrefix] = applyDefaults(container, bag.Value);
    const cloudResource = preConfCloudResourceFactory(block, "resource");
    const cloudData = preConfCloudResourceFactory(block, "data");
    const traversalTransform = preConfTraversalTransform(bag);
    const domainBlock = awsDomainBlockResources({
      dotDomain: block,
      domainValue: block.value,
      resourcePrefix: `aws_cert_domain_${bag.Name}`,
      apexHostedZoneId: block.apex_hosted_zone_id,
      cloudData,
      cloudResource
    });
    if (!domainBlock) {
      throwStatement(`missing 'name' on aws_cert_domain.${bag.Name}`);
    }
    let databags = [
      {
        Type: "traversal_map",
        Name: "aws_cert_domain_traversal_map",
        Value: {
          [`aws_cert_domain.${bag.Name}.cert_arn`]: domainBlock.certArn
        }
      },
      ...domainBlock.databags
    ];
    return databags;
  }
  exportDatabags(iterateBlocks(container, AWS_CERT_DOMAIN, awsCertDomainIterator).flat());
})();