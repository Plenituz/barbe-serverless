(() => {
  // barbe-std/rpc.ts
  function isSuccess(resp) {
    return resp.result !== void 0;
  }
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
  function asValArrayConst(token) {
    return asVal(token).map((item) => asVal(item));
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
  function asFuncCall(funcName, args) {
    return {
      Type: "function_call",
      FunctionName: funcName,
      FunctionArgs: args.map(asSyntax)
    };
  }
  function asTemplate(arr) {
    return {
      Type: "template",
      Parts: arr.map(asSyntax)
    };
  }
  function appendToTemplate(source, toAdd) {
    let parts = [];
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
  function applyTransformers(input) {
    const resp = barbeRpcCall({
      method: "transformContainer",
      params: [{
        databags: input
      }]
    });
    if (isFailure(resp)) {
      throw new Error(resp.error);
    }
    return resp.result;
  }
  function importComponents(container2, components) {
    let barbeImportComponent = [];
    for (const component of components) {
      let importComponentInput = {
        url: component.url,
        input: {}
      };
      if (component.copyFromContainer) {
        for (const copyFrom of component.copyFromContainer) {
          if (copyFrom in container2) {
            importComponentInput.input[copyFrom] = container2[copyFrom];
          }
        }
      }
      if (component.input) {
        for (const databag of component.input) {
          const type = databag.Type;
          const name = databag.Name;
          if (!(type in importComponentInput.input)) {
            importComponentInput.input[type] = {};
          }
          if (!(name in importComponentInput.input[type])) {
            importComponentInput.input[type][name] = [];
          }
          importComponentInput.input[type][name].push(databag);
        }
      }
      const id = `${component.name || ""}_${component.url}`;
      barbeImportComponent.push({
        Type: "barbe_import_component",
        Name: id,
        Value: importComponentInput
      });
    }
    if (barbeImportComponent.length === 0) {
      return {};
    }
    const resp = barbeRpcCall({
      method: "importComponents",
      params: [{
        databags: barbeImportComponent
      }]
    });
    if (isFailure(resp)) {
      throw new Error(resp.error);
    }
    return resp.result;
  }
  function statFile(fileName) {
    return barbeRpcCall({
      method: "statFile",
      params: [fileName]
    });
  }
  function throwStatement(message) {
    throw new Error(message);
  }
  function readDatabagContainer() {
    return JSON.parse(os.file.readFile("__barbe_input.json"));
  }
  function barbeLifecycleStep() {
    return os.getenv("BARBE_LIFECYCLE_STEP");
  }
  function uniq(arr, key) {
    const seen = /* @__PURE__ */ new Set();
    return arr.filter((item) => {
      const val = key ? key(item) : item;
      if (seen.has(val)) {
        return false;
      }
      seen.add(val);
      return true;
    });
  }

  // barbe-sls-lib/consts.ts
  var AWS_FARGATE_SERVICE = "aws_fargate_service";
  var AWS_NETWORK = "aws_network";
  var BARBE_SLS_VERSION = "v0.2.2";
  var TERRAFORM_EXECUTE_URL = `barbe-serverless/terraform_execute.js:${BARBE_SLS_VERSION}`;
  var AWS_NETWORK_URL = `barbe-serverless/aws_network.js:${BARBE_SLS_VERSION}`;

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
  function compileBlockParam(blockVal, blockName) {
    return asVal(mergeTokens((blockVal[blockName] || asSyntax([])).ArrayConst || []));
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
  var __awsCredsCached = void 0;
  function getAwsCreds() {
    if (__awsCredsCached) {
      return __awsCredsCached;
    }
    const transformed = applyTransformers([{
      Name: "state_store_credentials",
      Type: "aws_credentials_request",
      Value: {}
    }]);
    const creds = transformed.aws_credentials?.state_store_credentials[0]?.Value;
    if (!creds) {
      return void 0;
    }
    const credsObj = asVal(creds);
    __awsCredsCached = {
      access_key_id: asStr(credsObj.access_key_id),
      secret_access_key: asStr(credsObj.secret_access_key),
      session_token: asStr(credsObj.session_token)
    };
    return __awsCredsCached;
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

  // barbe-sls-lib/helpers.ts
  function domainBlockResources(dotDomain, domainValue, resourcePrefix, cloudData, cloudResource) {
    if (!dotDomain.name) {
      throw new Error("no domain name given");
    }
    let certArn;
    const acmCertificateResources = (domain) => {
      return [
        cloudResource("aws_acm_certificate", `${resourcePrefix}_cert`, {
          domain_name: domain,
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
    let databags = [];
    databags.push(
      cloudData("aws_route53_zone", `${resourcePrefix}_zone`, {
        name: dotDomain.zone || guessAwsDnsZoneBasedOnDomainName(dotDomain.name) || throwStatement("no 'zone' given and could not guess based on domain name")
      }),
      cloudResource("aws_route53_record", `${resourcePrefix}_domain_record`, {
        zone_id: asTraversal(`data.aws_route53_zone.${resourcePrefix}_zone.zone_id`),
        name: dotDomain.name,
        type: "CNAME",
        ttl: 300,
        records: [domainValue]
      })
    );
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
        databags.push(...acmCertificateResources(dotDomain.certificate_domain_to_create));
      } else {
        certArn = asTraversal(`aws_acm_certificate.${resourcePrefix}_cert.arn`);
        databags.push(...acmCertificateResources(dotDomain.name));
      }
    } else {
      certArn = dotDomain.certificate_arn;
    }
    return { certArn, databags };
  }

  // aws_fargate_service.ts
  var container = readDatabagContainer();
  function awsFargateServiceGenerateIterator(bag) {
    if (!bag.Value) {
      return { databags: [], imports: [] };
    }
    const [block, namePrefix] = applyDefaults(container, bag.Value);
    const cloudResourceId = block.cloudresource_id ? asStr(block.cloudresource_id) : void 0;
    const cloudResourceDir = block.cloudresource_dir ? asStr(block.cloudresource_dir) : void 0;
    const cloudResource = preConfCloudResourceFactory(block, "resource");
    const cloudData = preConfCloudResourceFactory(block, "data");
    const cloudOutput = preConfCloudResourceFactory(block, "output");
    const traversalTransform = preConfTraversalTransform(bag);
    const dotEnvironment = compileBlockParam(block, "environment");
    const dotAutoScaling = compileBlockParam(block, "auto_scaling");
    const dotContainerImage = compileBlockParam(block, "container_image");
    const dotEcrRepository = compileBlockParam(block, "ecr_repository");
    const dotNetwork = compileBlockParam(block, "network");
    const dotLoadBalancer = compileBlockParam(block, "load_balancer");
    const cpu = block.cpu || 256;
    const memory = block.memory || 512;
    const regionDataName = asStr(block.region || "current");
    const portMapping = asValArrayConst(block.port_mapping || asSyntax([]));
    const mappedPorts = asVal(block.mapped_ports || asSyntax([]));
    const hasProvidedImage = !!(block.image || dotContainerImage.image);
    const shouldCopyProvidedImage = asVal(block.copy_image || dotContainerImage.copy_image || asSyntax(true));
    const portsToOpen = uniq([
      ...portMapping.map((portMapping2) => ({
        port: asStr(portMapping2.host_port || portMapping2.container_port),
        protocol: asStr(portMapping2.protocol || "tcp")
      })),
      ...mappedPorts.map((port) => ({
        port: asStr(port),
        protocol: "tcp"
      }))
    ], (i) => i.port + i.protocol);
    if (portsToOpen.length === 0 && block.load_balancer) {
      portsToOpen.push(
        {
          port: "80",
          protocol: "tcp"
        },
        {
          port: "443",
          protocol: "tcp"
        }
      );
    }
    let executionRole;
    let imageUrl;
    let securityGroupId;
    let databags = [];
    let imports = [{
      url: AWS_NETWORK_URL,
      input: [{
        Type: AWS_NETWORK,
        Name: `aws_fargate_service_${bag.Name}`,
        Value: {
          use_default_vpc: dotNetwork.use_default_vpc,
          vpc_id: dotNetwork.vpc_id,
          cidr_block: dotNetwork.cidr_block,
          make_nat_gateway: dotNetwork.make_nat_gateway,
          one_nat_gateway_per_az: dotNetwork.one_nat_gateway_per_az
        }
      }]
    }];
    if (block.execution_role_arn) {
      executionRole = block.execution_role_arn;
    } else {
      executionRole = asTraversal("data.aws_iam_role.ecs_task_execution_role.arn");
      databags.push(
        cloudData("aws_iam_role", "ecs_task_execution_role", {
          name: "ecsTaskExecutionRole"
        })
      );
    }
    if (hasProvidedImage && !shouldCopyProvidedImage) {
      imageUrl = block.image || dotContainerImage.image;
    } else if (block.repository_url) {
      imageUrl = block.repository_url;
    } else {
      imageUrl = asTraversal(`aws_ecr_repository.aws_fargate_service_${bag.Name}_ecr_repository.repository_url`);
      databags.push(
        cloudResource("aws_ecr_repository", `aws_fargate_service_${bag.Name}_ecr_repository`, {
          name: appendToTemplate(namePrefix, [`${bag.Name}-fs-ecr`]),
          force_delete: true
        }),
        cloudOutput("", `aws_fargate_service_${bag.Name}_ecr_repository`, {
          value: asTraversal(`aws_ecr_repository.aws_fargate_service_${bag.Name}_ecr_repository.repository_url`)
        })
      );
      const dontExpireImages = asVal(dotEcrRepository.dont_expire_images || asSyntax(false));
      if (!dontExpireImages) {
        let policy;
        if (dotEcrRepository.policy) {
          policy = dotEcrRepository.policy;
        } else if (dotEcrRepository.max_untagged_count) {
          policy = asFuncCall("jsonencode", [{
            rules: [{
              rulePriority: 1,
              description: "Expire untagged images",
              selection: {
                tagStatus: "untagged",
                countType: "imageCountMoreThan",
                countNumber: dotEcrRepository.max_untagged_count
              },
              action: {
                type: "expire"
              }
            }]
          }]);
        } else {
          policy = asFuncCall("jsonencode", [{
            rules: [{
              rulePriority: 1,
              description: "Expire untagged images",
              selection: {
                tagStatus: "untagged",
                countType: "sinceImagePushed",
                countUnit: "days",
                countNumber: dotEcrRepository.expire_untagged_after_days || 30
              },
              action: {
                type: "expire"
              }
            }]
          }]);
        }
        databags.push(
          cloudResource("aws_ecr_lifecycle_policy", `aws_fargate_service_${bag.Name}_ecr_policy`, {
            repository: asTraversal(`aws_ecr_repository.aws_fargate_service_${bag.Name}_ecr_repository.name`),
            policy
          })
        );
      }
    }
    if (block.security_group_id) {
      securityGroupId = block.security_group_id;
    } else {
      securityGroupId = asTraversal(`aws_security_group.aws_fargate_service_${bag.Name}_secgr.id`);
      databags.push(
        cloudResource("aws_security_group", `aws_fargate_service_${bag.Name}_secgr`, {
          name: appendToTemplate(namePrefix, [`${bag.Name}-fs-sg`]),
          vpc_id: asTraversal(`aws_network.aws_fargate_service_${bag.Name}.vpc.id`)
        }),
        //allow all traffic from elements in the same security group
        cloudResource("aws_security_group_rule", `aws_fargate_service_${bag.Name}_self_secgr_ingress`, {
          type: "ingress",
          security_group_id: asTraversal(`aws_security_group.aws_fargate_service_${bag.Name}_secgr.id`),
          from_port: 0,
          to_port: 65535,
          protocol: -1,
          source_security_group_id: asTraversal(`aws_security_group.aws_fargate_service_${bag.Name}_secgr.id`)
        }),
        ...portsToOpen.map((obj) => cloudResource("aws_security_group_rule", `aws_fargate_service_${bag.Name}_${obj.protocol}${obj.port}_secgr_ingress`, {
          type: "ingress",
          security_group_id: asTraversal(`aws_security_group.aws_fargate_service_${bag.Name}_secgr.id`),
          from_port: parseInt(obj.port),
          to_port: parseInt(obj.port),
          protocol: obj.protocol,
          cidr_blocks: ["0.0.0.0/0"]
        })),
        //allow all outbound traffic
        cloudResource("aws_security_group_rule", `aws_fargate_service_${bag.Name}_secgr_egress`, {
          type: "egress",
          security_group_id: asTraversal(`aws_security_group.aws_fargate_service_${bag.Name}_secgr.id`),
          from_port: 0,
          to_port: 65535,
          protocol: -1,
          cidr_blocks: ["0.0.0.0/0"]
        })
      );
    }
    if (block.auto_scaling) {
      let predefinedMetric = "ECSServiceAverageCPUUtilization";
      if (dotAutoScaling.metric) {
        const metric = asStr(dotAutoScaling.metric);
        switch (metric) {
          case "cpu":
            predefinedMetric = "ECSServiceAverageCPUUtilization";
            break;
          case "memory":
            predefinedMetric = "ECSServiceAverageMemoryUtilization";
            break;
          default:
            throw new Error(`Unknown auto scaling metric '${metric}' on aws_fargate_service.${bag.Name}.auto_scaling.metric`);
        }
      }
      databags.push(
        cloudResource("aws_appautoscaling_target", `${bag.Name}_fargate_scaling_target`, {
          max_capacity: dotAutoScaling.max || 5,
          min_capacity: dotAutoScaling.min || 1,
          resource_id: asTemplate([
            "service/",
            asTraversal(`aws_ecs_cluster.${bag.Name}_fargate_cluster.name`),
            "/",
            asTraversal(`aws_ecs_service.${bag.Name}_fargate_service.name`)
          ]),
          scalable_dimension: "ecs:service:DesiredCount",
          service_namespace: "ecs"
        }),
        cloudResource("aws_appautoscaling_policy", `${bag.Name}_fargate_scaling_policy`, {
          name: appendToTemplate(namePrefix, [`${bag.Name}-fs-scaling-policy`]),
          policy_type: "TargetTrackingScaling",
          resource_id: asTraversal(`aws_appautoscaling_target.${bag.Name}_fargate_scaling_target.resource_id`),
          scalable_dimension: asTraversal(`aws_appautoscaling_target.${bag.Name}_fargate_scaling_target.scalable_dimension`),
          service_namespace: asTraversal(`aws_appautoscaling_target.${bag.Name}_fargate_scaling_target.service_namespace`),
          target_tracking_scaling_policy_configuration: asBlock([{
            target_value: dotAutoScaling.target || 80,
            scale_in_cooldown: dotAutoScaling.scale_in_cooldown || null,
            scale_out_cooldown: dotAutoScaling.scale_out_cooldown || null,
            predefined_metric_specification: asBlock([{
              predefined_metric_type: predefinedMetric
            }])
          }])
        })
      );
    }
    let ecsService = {
      name: appendToTemplate(namePrefix, [`${bag.Name}-fargate-service`]),
      cluster: asTraversal(`aws_ecs_cluster.${bag.Name}_fargate_cluster.id`),
      task_definition: asTraversal(`aws_ecs_task_definition.${bag.Name}_fargate_task_def.arn`),
      desired_count: block.desired_count || 1,
      launch_type: "FARGATE",
      enable_ecs_managed_tags: true,
      propagate_tags: "SERVICE",
      network_configuration: asBlock([{
        subnets: (() => {
          if (block.task_accessibility) {
            const accessibility = asStr(block.task_accessibility);
            switch (accessibility) {
              case "public":
                return asTraversal(`aws_network.aws_fargate_service_${bag.Name}.public_subnets.*.id`);
              case "private":
                return asTraversal(`aws_network.aws_fargate_service_${bag.Name}.private_subnets.*.id`);
              default:
                throw new Error(`Unknown value '${accessibility}' on aws_fargate_service.${bag.Name}.task_accessibility, it must be either 'public' or 'private'`);
            }
          }
          if (block.load_balancer) {
            return asTraversal(`aws_network.aws_fargate_service_${bag.Name}.private_subnets.*.id`);
          }
          if (block.network && dotNetwork.make_nat_gateway && asVal(dotNetwork.make_nat_gateway)) {
            return asTraversal(`aws_network.aws_fargate_service_${bag.Name}.private_subnets`);
          }
          return asTraversal(`aws_network.aws_fargate_service_${bag.Name}.public_subnets.*.id`);
        })(),
        security_groups: [securityGroupId],
        assign_public_ip: true
      }])
    };
    if (asVal(block.dont_redeploy_on_apply || asSyntax(false))) {
      ecsService.force_new_deployment = false;
    } else {
      ecsService.force_new_deployment = true;
    }
    if (block.auto_scaling) {
      ecsService.lifecycle = asBlock([{
        ignore_changes: [asSyntax("desired_count")]
      }]);
    }
    if (block.load_balancer) {
      const asSgProtocol = (protocol) => {
        switch (protocol.toLowerCase()) {
          case "http":
          case "https":
            return "tcp";
          default:
            return protocol.toLowerCase();
        }
      };
      const asLbProtocol = (protocol) => {
        switch (protocol.toLowerCase()) {
          case "http":
          case "tcp":
            return "HTTP";
          case "https":
            return "HTTPS";
          default:
            return protocol.toUpperCase();
        }
      };
      const enableHttps = !!dotLoadBalancer.domain;
      const defineAccessLogsResources = asVal(dotLoadBalancer.enable_access_logs || asSyntax(false)) || !!dotAutoScaling.access_logs;
      const dotAccessLogs = compileBlockParam(dotLoadBalancer, "access_logs");
      const portMappingLoadBalancer = asValArrayConst(dotLoadBalancer.port_mapping || asSyntax([]));
      const portsToOpenLoadBalancer = uniq(portMappingLoadBalancer.map((portMapping2, i) => {
        if (!portMapping2.target_port) {
          throw new Error(`'target_port' is required for aws_fargate_service.${bag.Name}.load_balancer.port_mapping[${i}]`);
        }
        if (!portMapping2.load_balancer_port) {
          throw new Error(`'load_balancer_port' is required for aws_fargate_service.${bag.Name}.load_balancer.port_mapping[${i}]`);
        }
        const targetPort = asStr(portMapping2.target_port);
        if (!portsToOpen.find((m) => m.port === targetPort)) {
          throw new Error(`'target_port' ${targetPort} is not open on the container but used in aws_fargate_service.${bag.Name}.load_balancer.port_mapping[${i}], add it to aws_fargate_service.${bag.Name}.mapped_ports or aws_fargate_service.${bag.Name}.port_mapping, or remove it from aws_fargate_service.${bag.Name}.load_balancer.port_mapping[${i}]`);
        }
        return {
          target_port: targetPort,
          load_balancer_port: asStr(portMapping2.load_balancer_port),
          protocol: asStr(portMapping2.protocol || "HTTP").toUpperCase()
        };
      }), (x) => `${x.target_port}-${x.load_balancer_port}-${x.protocol}`);
      const loadBalancerType = asStr(dotLoadBalancer.type || "application");
      const internal = asVal(dotLoadBalancer.internal || asSyntax(false));
      databags.push(
        cloudResource("aws_security_group", `aws_fargate_service_${bag.Name}_lb_secgr`, {
          name: appendToTemplate(namePrefix, [`${bag.Name}-fsn-sg`]),
          vpc_id: asTraversal(`aws_network.aws_fargate_service_${bag.Name}.vpc.id`)
        }),
        //allow all traffic from elements in the same security group
        cloudResource("aws_security_group_rule", `aws_fargate_service_${bag.Name}_lb_self_secgr_ingress`, {
          type: "ingress",
          security_group_id: asTraversal(`aws_security_group.aws_fargate_service_${bag.Name}_lb_secgr.id`),
          from_port: 0,
          to_port: 65535,
          protocol: -1,
          source_security_group_id: asTraversal(`aws_security_group.aws_fargate_service_${bag.Name}_lb_secgr.id`)
        }),
        //allow all outbound traffic
        cloudResource("aws_security_group_rule", `aws_fargate_service_${bag.Name}_lb_secgr_egress`, {
          type: "egress",
          security_group_id: asTraversal(`aws_security_group.aws_fargate_service_${bag.Name}_lb_secgr.id`),
          from_port: 0,
          to_port: 65535,
          protocol: -1,
          cidr_blocks: ["0.0.0.0/0"]
        }),
        ...portsToOpenLoadBalancer.map((obj) => cloudResource("aws_security_group_rule", `aws_fargate_service_${bag.Name}_${obj.protocol}${obj.load_balancer_port}_lb_secgr_ingress`, {
          type: "ingress",
          security_group_id: asTraversal(`aws_security_group.aws_fargate_service_${bag.Name}_lb_secgr.id`),
          from_port: parseInt(obj.load_balancer_port),
          to_port: parseInt(obj.load_balancer_port),
          protocol: asSgProtocol(obj.protocol),
          cidr_blocks: ["0.0.0.0/0"]
        })),
        ...portsToOpenLoadBalancer.flatMap((obj) => [
          cloudResource("aws_lb_listener", `aws_fargate_service_${bag.Name}_${obj.protocol}${obj.load_balancer_port}_lb_listener`, {
            load_balancer_arn: asTraversal(`aws_lb.${bag.Name}_fargate_lb.arn`),
            port: obj.load_balancer_port,
            protocol: asLbProtocol(obj.protocol),
            default_action: asBlock([{
              type: "forward",
              target_group_arn: asTraversal(`aws_lb_target_group.aws_fargate_service_${bag.Name}_${obj.protocol}${obj.load_balancer_port}_lb_listener_target.arn`)
            }])
          }),
          cloudResource("aws_lb_target_group", `aws_fargate_service_${bag.Name}_${obj.protocol}${obj.load_balancer_port}_lb_listener_target`, {
            name: appendToTemplate(namePrefix, [`${bag.Name}-${obj.protocol}${obj.load_balancer_port}-fs-lb-tg`]),
            port: obj.target_port,
            protocol: asLbProtocol(obj.protocol),
            vpc_id: asTraversal(`aws_network.aws_fargate_service_${bag.Name}.vpc.id`),
            target_type: "ip"
          })
        ])
      );
      if (loadBalancerType === "application") {
        databags.push(
          cloudResource("aws_security_group_rule", `aws_fargate_service_${bag.Name}_http_lb_secgr_ingress`, {
            type: "ingress",
            security_group_id: asTraversal(`aws_security_group.aws_fargate_service_${bag.Name}_lb_secgr.id`),
            from_port: 80,
            to_port: 80,
            protocol: "tcp",
            cidr_blocks: ["0.0.0.0/0"]
          })
        );
        if (enableHttps) {
          databags.push(
            cloudResource("aws_security_group_rule", `aws_fargate_service_${bag.Name}_https_lb_secgr_ingress`, {
              type: "ingress",
              security_group_id: asTraversal(`aws_security_group.aws_fargate_service_${bag.Name}_lb_secgr.id`),
              from_port: 443,
              to_port: 443,
              protocol: "tcp",
              cidr_blocks: ["0.0.0.0/0"]
            })
          );
        }
        if (portsToOpen.length === 1) {
          databags.push(
            cloudResource("aws_lb_listener", `aws_fargate_service_${bag.Name}_lonely_http_lb_listener`, {
              load_balancer_arn: asTraversal(`aws_lb.${bag.Name}_fargate_lb.arn`),
              port: 80,
              protocol: "HTTP",
              default_action: asBlock([{
                type: "forward",
                target_group_arn: asTraversal(`aws_lb_target_group.aws_fargate_service_${bag.Name}_lonely_http_lb_listener_target.arn`)
              }])
            }),
            cloudResource("aws_lb_target_group", `aws_fargate_service_${bag.Name}_lonely_http_lb_listener_target`, {
              name: appendToTemplate(namePrefix, [`${bag.Name}-fs-lhttp-lb-tg`]),
              port: portsToOpen[0].port,
              protocol: asLbProtocol(portsToOpen[0].protocol),
              vpc_id: asTraversal(`aws_network.aws_fargate_service_${bag.Name}.vpc.id`),
              target_type: "ip"
            })
          );
        } else if (portsToOpen.some((obj) => obj.port === "80" || obj.port === "443")) {
          const eightyIsOpen = portsToOpen.some((obj) => obj.port === "80");
          const fourFourThreeIsOpen = portsToOpen.some((obj) => obj.port === "443");
          if (eightyIsOpen) {
            databags.push(
              cloudResource("aws_lb_listener", `aws_fargate_service_${bag.Name}_http_lb_listener`, {
                load_balancer_arn: asTraversal(`aws_lb.${bag.Name}_fargate_lb.arn`),
                port: 80,
                protocol: "HTTP",
                default_action: asBlock([{
                  type: "forward",
                  target_group_arn: asTraversal(`aws_lb_target_group.aws_fargate_service_${bag.Name}_http_lb_listener_target.arn`)
                }])
              }),
              cloudResource("aws_lb_target_group", `aws_fargate_service_${bag.Name}_http_lb_listener_target`, {
                name: appendToTemplate(namePrefix, [`${bag.Name}-fs-http-lb-tg`]),
                port: 80,
                protocol: "HTTP",
                vpc_id: asTraversal(`aws_network.aws_fargate_service_${bag.Name}.vpc.id`),
                target_type: "ip"
              })
            );
          }
          if (fourFourThreeIsOpen) {
            if (enableHttps) {
              const dotDomain = compileBlockParam(dotLoadBalancer, "domain");
              const { certArn, databags: domainResources } = domainBlockResources(dotDomain, asTraversal(`aws_lb.${bag.Name}_fargate_lb.dns_name`), `aws_fargate_service_${bag.Name}`, cloudData, cloudResource);
              databags.push(
                ...domainResources,
                cloudResource("aws_lb_listener", `aws_fargate_service_${bag.Name}_https_lb_listener`, {
                  load_balancer_arn: asTraversal(`aws_lb.${bag.Name}_fargate_lb.arn`),
                  port: 443,
                  protocol: "HTTPS",
                  certificate_arn: certArn,
                  default_action: asBlock([{
                    type: "forward",
                    target_group_arn: asTraversal(`aws_lb_target_group.aws_fargate_service_${bag.Name}_https_lb_listener_target.arn`)
                  }])
                })
              );
            } else if (!eightyIsOpen) {
              databags.push(
                cloudResource("aws_lb_listener", `aws_fargate_service_${bag.Name}_http_lb_listener`, {
                  load_balancer_arn: asTraversal(`aws_lb.${bag.Name}_fargate_lb.arn`),
                  port: 80,
                  protocol: "HTTP",
                  default_action: asBlock([{
                    type: "forward",
                    target_group_arn: asTraversal(`aws_lb_target_group.aws_fargate_service_${bag.Name}_https_lb_listener_target.arn`)
                  }])
                })
              );
            }
            databags.push(
              cloudResource("aws_lb_target_group", `aws_fargate_service_${bag.Name}_https_lb_listener_target`, {
                name: appendToTemplate(namePrefix, [`${bag.Name}-fs-https-lb-tg`]),
                port: 443,
                protocol: "HTTPS",
                vpc_id: asTraversal(`aws_network.aws_fargate_service_${bag.Name}.vpc.id`),
                target_type: "ip"
              })
            );
          }
        } else {
        }
      }
      if (loadBalancerType === "network") {
        databags.push(
          ...portsToOpen.map((obj) => cloudResource("aws_security_group_rule", `aws_fargate_service_${bag.Name}_${obj.protocol}${obj.port}_lb_secgr_ingress`, {
            type: "ingress",
            security_group_id: asTraversal(`aws_security_group.aws_fargate_service_${bag.Name}_lb_secgr.id`),
            from_port: parseInt(obj.port),
            to_port: parseInt(obj.port),
            protocol: obj.protocol,
            cidr_blocks: ["0.0.0.0/0"]
          }))
        );
        if (!dotLoadBalancer.port_mapping) {
          databags.push(
            ...portsToOpen.flatMap((obj) => [
              cloudResource("aws_lb_listener", `aws_fargate_service_${bag.Name}_net_${obj.port}_lb_listener`, {
                load_balancer_arn: asTraversal(`aws_lb.${bag.Name}_fargate_lb.arn`),
                port: obj.port,
                //listeners attaches to network load balancers must be TCP
                protocol: "TCP",
                default_action: asBlock([{
                  type: "forward",
                  target_group_arn: asTraversal(`aws_lb_target_group.aws_fargate_service_${bag.Name}_net_${obj.port}_lb_listener_target.arn`)
                }])
              }),
              cloudResource("aws_lb_target_group", `aws_fargate_service_${bag.Name}_net_${obj.port}_lb_listener_target`, {
                name: appendToTemplate(namePrefix, [`${bag.Name}-fsn${obj.port}`]),
                port: obj.port,
                protocol: "TCP",
                vpc_id: asTraversal(`aws_network.aws_fargate_service_${bag.Name}.vpc.id`),
                target_type: "ip"
              })
            ])
          );
        }
      }
      if (defineAccessLogsResources && !dotAccessLogs.bucket) {
        databags.push(
          cloudResource("aws_s3_bucket", `aws_fargate_service_${bag.Name}_lb_access_logs_bucket`, {
            bucket: appendToTemplate(namePrefix, [`${bag.Name}-fs-lb-access-logs`]),
            force_destroy: true
          })
        );
      }
      databags.push(
        cloudResource("aws_lb", `${bag.Name}_fargate_lb`, {
          name: appendToTemplate(namePrefix, [`${bag.Name}-fs-lb`]),
          internal,
          load_balancer_type: loadBalancerType,
          subnets: internal ? asTraversal(`aws_network.aws_fargate_service_${bag.Name}.private_subnets.*.id`) : asTraversal(`aws_network.aws_fargate_service_${bag.Name}.public_subnets.*.id`),
          security_groups: loadBalancerType === "network" ? null : [
            asTraversal(`aws_security_group.aws_fargate_service_${bag.Name}_lb_secgr.id`)
          ],
          access_logs: defineAccessLogsResources ? asBlock([{
            enabled: dotAccessLogs.enabled || true,
            bucket: dotAccessLogs.bucket ? dotAccessLogs.bucket : asTraversal(`aws_s3_bucket.aws_fargate_service_${bag.Name}_lb_access_logs_bucket.id`),
            prefix: dotAccessLogs.prefix || appendToTemplate(namePrefix, [`${bag.Name}-fs-lb-access-logs`])
          }]) : null,
          customer_owned_ipv4_pool: dotLoadBalancer.customer_owned_ipv4_pool,
          desync_mitigation_mode: dotLoadBalancer.desync_mitigation_mode,
          drop_invalid_header_fields: dotLoadBalancer.drop_invalid_header_fields,
          enable_cross_zone_load_balancing: dotLoadBalancer.enable_cross_zone_load_balancing,
          enable_deletion_protection: dotLoadBalancer.enable_deletion_protection,
          enable_http2: dotLoadBalancer.enable_http2,
          enable_waf_fail_open: dotLoadBalancer.enable_waf_fail_open,
          idle_timeout: dotLoadBalancer.idle_timeout,
          ip_address_type: dotLoadBalancer.ip_address_type,
          preserve_host_header: dotLoadBalancer.preserve_host_header
        })
      );
    }
    databags.push(
      cloudData("aws_availability_zones", "current", {}),
      cloudResource("aws_ecs_cluster", `${bag.Name}_fargate_cluster`, {
        name: appendToTemplate(namePrefix, [`${bag.Name}-fs-cluster`])
      }),
      cloudResource("aws_ecs_service", `${bag.Name}_fargate_service`, ecsService),
      cloudResource("aws_cloudwatch_log_group", `${bag.Name}_fargate_task_logs`, {
        name: appendToTemplate(asSyntax("/ecs/"), [namePrefix, bag.Name]),
        retention_in_days: block.logs_retention_days || 30
      }),
      cloudResource("aws_ecs_task_definition", `${bag.Name}_fargate_task_def`, {
        family: appendToTemplate(namePrefix, [`${bag.Name}-fs-task-def`]),
        cpu,
        memory,
        network_mode: "awsvpc",
        requires_compatibilities: ["FARGATE"],
        execution_role_arn: executionRole,
        task_role_arn: block.role || asTraversal("aws_iam_role.default_lambda_role.arn"),
        container_definitions: asFuncCall(
          "jsonencode",
          //that's an array of arrays cause we're json marshalling a list of objects
          [[
            {
              name: appendToTemplate(namePrefix, [`${bag.Name}-fs-task-def`]),
              image: imageUrl,
              cpu,
              memory,
              environment: Object.entries(dotEnvironment).map(([name, value]) => ({ name, value })),
              logConfiguration: {
                logDriver: "awslogs",
                options: {
                  "awslogs-group": asTraversal(`aws_cloudwatch_log_group.${bag.Name}_fargate_task_logs.name`),
                  "awslogs-region": asTraversal(`data.aws_region.${regionDataName}.name`),
                  "awslogs-stream-prefix": appendToTemplate(namePrefix, [bag.Name])
                }
              },
              portMappings: [
                ...portMapping.map((portMapping2) => ({
                  containerPort: portMapping2.container_port,
                  hostPort: portMapping2.host_port || portMapping2.container_port,
                  protocol: portMapping2.protocol || "tcp"
                })),
                ...mappedPorts.map((port) => ({
                  containerPort: port,
                  hostPort: port,
                  protocol: "tcp"
                }))
              ]
            }
          ]]
        )
      })
    );
    return { databags, imports };
  }
  function generate() {
    const g = iterateBlocks(container, AWS_FARGATE_SERVICE, awsFargateServiceGenerateIterator).flat();
    exportDatabags(g.map((x) => x.databags).flat());
    exportDatabags(importComponents(container, g.map((x) => x.imports).flat()));
  }
  function awsFargateServiceApplyIterator(bag) {
    const [block, namePrefix] = applyDefaults(container, bag.Value);
    const awsRegion = asStr(block.region || os.getenv("AWS_REGION") || "us-east-1");
    const dotContainerImage = compileBlockParam(block, "container_image");
    const hasProvidedImage = !!(block.image || dotContainerImage.image);
    const shouldCopyProvidedImage = asVal(block.copy_image || dotContainerImage.copy_image || asSyntax(true));
    let databags = [];
    if (hasProvidedImage && shouldCopyProvidedImage) {
      console.log("copying image to ecr", JSON.stringify(container));
      if (!container.terraform_execute_output?.default_apply) {
        return [];
      }
      const tfOutput = asValArrayConst(container.terraform_execute_output?.default_apply[0].Value);
      const imageUrl = asStr(tfOutput.find((pair) => asStr(pair.key) === `aws_fargate_service_${bag.Name}_ecr_repository`).value);
      const providedImage = asStr(block.image || dotContainerImage.image);
      let loginCommand = "";
      if (!block.repository_url) {
        loginCommand = `RUN --mount=type=ssh,id=docker.sock,target=/var/run/docker.sock aws ecr get-login-password --region ${awsRegion} | docker login --username AWS --password-stdin ${imageUrl.split("/")[0]}`;
      }
      databags.push({
        Type: "buildkit_run_in_container",
        Name: `${bag.Name}_aws_fargate_service_image_copy`,
        Value: {
          display_name: `Image copy - aws_fargate_service.${bag.Name}`,
          no_cache: true,
          dockerfile: `
                    FROM docker

                    RUN apk add curl && curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" &&                         unzip awscliv2.zip &&                         ./aws/install

                    RUN --mount=type=ssh,id=docker.sock,target=/var/run/docker.sock docker pull ${providedImage}
                    RUN --mount=type=ssh,id=docker.sock,target=/var/run/docker.sock docker tag ${providedImage} ${imageUrl}
                    ${loginCommand}
                    RUN --mount=type=ssh,id=docker.sock,target=/var/run/docker.sock docker push ${imageUrl}`
        }
      });
    }
    if (!hasProvidedImage) {
      console.log("building img", JSON.stringify(container));
      if (!container.terraform_execute_output?.default_apply) {
        return [];
      }
      const tfOutput = asValArrayConst(container.terraform_execute_output?.default_apply[0].Value);
      const imageUrl = asStr(tfOutput.find((pair) => asStr(pair.key) === `aws_fargate_service_${bag.Name}_ecr_repository`).value);
      const baseDir = asStr(dotContainerImage.build_from || ".");
      let dockerfileContent = asStr(block.dockerfile || dotContainerImage.dockerfile || throwStatement(`aws_fargate_service.${bag.Name} needs a 'dockerfile' (path or file content) or 'image' property`));
      if (!dockerfileContent.includes("\n")) {
        const isFileResult = statFile(dockerfileContent);
        if (isSuccess(isFileResult)) {
          if (isFileResult.result.isDir) {
            throwStatement(`aws_fargate_service.${bag.Name}.dockerfile path is a directory`);
          }
          dockerfileContent = os.file.readFile(dockerfileContent);
        }
      }
      const awsCreds = getAwsCreds();
      if (!awsCreds) {
        throwStatement(`aws_fargate_service.${bag.Name} needs AWS credentials to build the image`);
      }
      databags.push({
        Type: "buildkit_run_in_container",
        Name: `${bag.Name}_aws_fargate_service_image_build`,
        Value: {
          display_name: `Image build - aws_fargate_service.${bag.Name}`,
          input_files: {
            "__barbe_dockerfile": dockerfileContent
          },
          dockerfile: `
                    FROM amazon/aws-cli:latest
                    
                    # https://forums.docker.com/t/docker-ce-stable-x86-64-repo-not-available-https-error-404-not-found-https-download-docker-com-linux-centos-7server-x86-64-stable-repodata-repomd-xml/98965
                    RUN yum install -y yum-utils &&                         yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo &&                         sed -i 's/$releasever/7/g' /etc/yum.repos.d/docker-ce.repo &&                         yum install docker-ce-cli -y

                    ENV AWS_ACCESS_KEY_ID="${awsCreds.access_key_id}"
                    ENV AWS_SECRET_ACCESS_KEY="${awsCreds.secret_access_key}"
                    ENV AWS_SESSION_TOKEN="${awsCreds.session_token}"
                    ENV AWS_REGION="${asStr(block.region || os.getenv("AWS_REGION") || "us-east-1")}"
                    ENV AWS_PAGER=""

                    RUN --mount=type=ssh,id=docker.sock,target=/var/run/docker.sock aws ecr get-login-password --region ${awsRegion} | docker login --username AWS --password-stdin ${imageUrl.split("/")[0]}

                    COPY --from=src __barbe_dockerfile __barbe_dockerfile
                    RUN --mount=type=ssh,id=docker.sock,target=/var/run/docker.sock docker build -f __barbe_dockerfile -t barbeimg ${baseDir}
                    RUN --mount=type=ssh,id=docker.sock,target=/var/run/docker.sock docker tag barbeimg:latest ${imageUrl}:latest
                    RUN --mount=type=ssh,id=docker.sock,target=/var/run/docker.sock docker push ${imageUrl}:latest
                `
        }
      });
    }
    return databags;
  }
  function apply() {
    exportDatabags(iterateBlocks(container, AWS_FARGATE_SERVICE, awsFargateServiceApplyIterator).flat());
  }
  switch (barbeLifecycleStep()) {
    case "pre_generate":
    case "generate":
    case "post_generate":
      generate();
      break;
    case "post_apply":
      apply();
      break;
  }
})();
