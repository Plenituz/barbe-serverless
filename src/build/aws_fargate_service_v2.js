(() => {
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
  function throwStatement(message) {
    throw new Error(message);
  }
  function readDatabagContainer() {
    return JSON.parse(os.file.readFile("__barbe_input.json"));
  }
  var IS_VERBOSE = os.getenv("BARBE_VERBOSE") === "1";
  function barbeLifecycleStep() {
    return os.getenv("BARBE_LIFECYCLE_STEP");
  }
  var allGenerateSteps = ["pre_generate", "generate", "post_generate"];
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
  var AWS_ECR_REPOSITORY_WITH_IMAGE = "aws_ecr_repository_with_image";
  var AWS_NETWORK = "aws_network";
  var BARBE_SLS_VERSION = "v0.2.3";
  var TERRAFORM_EXECUTE_URL = `barbe-serverless/terraform_execute.js:${BARBE_SLS_VERSION}`;
  var AWS_NETWORK_URL = `barbe-serverless/aws_network.js:${BARBE_SLS_VERSION}`;
  var AWS_ECR_REPOSITORY_WITH_IMAGE_URL = `barbe-serverless/aws_ecr_repository_with_image.js:${BARBE_SLS_VERSION}`;

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

  // ../../anyfront/src/anyfront-lib/pipeline.ts
  function mergeDatabagContainers(...containers) {
    let output = {};
    for (const container2 of containers) {
      for (const [blockType, block] of Object.entries(container2)) {
        output[blockType] = output[blockType] || {};
        for (const [bagName, bag] of Object.entries(block)) {
          output[blockType][bagName] = output[blockType][bagName] || [];
          output[blockType][bagName].push(...bag);
        }
      }
    }
    return output;
  }
  function databagArrayToContainer(array) {
    let output = {};
    for (const bag of array) {
      output[bag.Type] = output[bag.Type] || {};
      output[bag.Type][bag.Name] = output[bag.Type][bag.Name] || [];
      output[bag.Type][bag.Name].push(bag);
    }
    return output;
  }
  function executePipelineGroup(container2, pipelines) {
    const lifecycleStep = barbeLifecycleStep();
    const maxStep = pipelines.map((p) => p.steps.length).reduce((a, b) => Math.max(a, b), 0);
    let previousStepResult = {};
    let history = [];
    for (let i = 0; i < maxStep; i++) {
      let stepResults = {};
      let stepImports = [];
      let stepTransforms = [];
      let stepDatabags = [];
      let stepNames = [];
      for (let pipeline2 of pipelines) {
        if (i >= pipeline2.steps.length) {
          continue;
        }
        const stepMeta = pipeline2.steps[i];
        if (stepMeta.name) {
          stepNames.push(stepMeta.name);
        }
        if (stepMeta.lifecycleSteps && stepMeta.lifecycleSteps.length > 0) {
          if (!stepMeta.lifecycleSteps.includes(lifecycleStep)) {
            if (IS_VERBOSE) {
              console.log(`${pipeline2.name}: skipping step ${i}${stepMeta.name ? ` (${stepMeta.name})` : ""} (${lifecycleStep} not in [${stepMeta.lifecycleSteps.join(", ")}]`);
            }
            continue;
          }
        }
        if (IS_VERBOSE) {
          console.log(`${pipeline2.name}: running step ${i}${stepMeta.name ? ` (${stepMeta.name})` : ""}`);
          console.log(`step ${i} input:`, JSON.stringify(previousStepResult));
        }
        let stepRequests = stepMeta.f({
          previousStepResult,
          history
        });
        if (IS_VERBOSE) {
          console.log(`${pipeline2.name}: step ${i}${stepMeta.name ? ` (${stepMeta.name})` : ""} requests:`, JSON.stringify(stepRequests));
        }
        if (!stepRequests) {
          continue;
        }
        if (stepRequests.imports) {
          stepImports.push(...stepRequests.imports);
        }
        if (stepRequests.transforms) {
          stepTransforms.push(...stepRequests.transforms);
        }
        if (stepRequests.databags) {
          stepDatabags.push(...stepRequests.databags);
        }
      }
      if (stepImports.length > 0) {
        const importsResults = importComponents(container2, stepImports);
        stepResults = mergeDatabagContainers(stepResults, importsResults);
      }
      if (stepTransforms.length > 0) {
        const transformResults = applyTransformers(stepTransforms);
        stepResults = mergeDatabagContainers(stepResults, transformResults);
      }
      if (stepDatabags.length > 0) {
        exportDatabags(stepDatabags);
        stepResults = mergeDatabagContainers(stepResults, databagArrayToContainer(stepDatabags));
      }
      if (IS_VERBOSE) {
        console.log(`step ${i} output:`, JSON.stringify(stepResults));
      }
      history.push({
        databags: stepResults,
        stepNames
      });
      previousStepResult = stepResults;
      for (let pipeline2 of pipelines) {
        pipeline2.mostRecentInput = {
          previousStepResult,
          history
        };
      }
    }
  }
  function step(f, params) {
    return {
      ...params,
      f
    };
  }
  function pipeline(steps, params) {
    return {
      ...params,
      steps,
      pushWithParams(params2, f) {
        this.steps.push(step(f, params2));
      },
      push(f) {
        this.steps.push(step(f));
      },
      merge(...steps2) {
        this.steps.push(...steps2);
      },
      runAfter(other) {
        this.steps = [
          ...Array.from({ length: other.steps.length }, () => step(() => {
          }, { name: `padding_${other.name || ""}` })),
          ...this.steps
        ];
      }
    };
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

  // aws_fargate_service_v2.ts
  var container = readDatabagContainer();
  function awsFargateServiceIterator(bag) {
    if (!bag.Value) {
      return pipeline([]);
    }
    let pipe = pipeline([]);
    const [block, namePrefix] = applyDefaults(container, bag.Value);
    const dotNetwork = compileBlockParam(block, "network");
    const dotEcrRepository = compileBlockParam(block, "ecr_repository");
    pipe.pushWithParams({ name: "resources", lifecycleSteps: allGenerateSteps }, () => {
      return {
        databags: awsFargateServiceResources(bag),
        imports: [
          {
            url: AWS_NETWORK_URL,
            //copy over the fargate_service block just to notify the aws_network to create the right vpc endpoints
            //we could also just add vpc_endpoints manually but just in case it changes in the future we let the aws_network handle it
            copyFromContainer: [AWS_FARGATE_SERVICE],
            input: [{
              Type: AWS_NETWORK,
              Name: `aws_fargate_service_${bag.Name}`,
              Value: {
                use_default_vpc: dotNetwork.use_default_vpc,
                vpc_id: dotNetwork.vpc_id,
                cidr_block: dotNetwork.cidr_block,
                make_nat_gateway: dotNetwork.make_nat_gateway,
                one_nat_gateway_per_az: dotNetwork.one_nat_gateway_per_az,
                name_prefix: [namePrefix]
              }
            }]
          },
          {
            url: AWS_ECR_REPOSITORY_WITH_IMAGE_URL,
            copyFromContainer: ["cr_[terraform]", "state_store"],
            input: [{
              Type: AWS_ECR_REPOSITORY_WITH_IMAGE,
              Name: `${bag.Name}-ecr`,
              Value: {
                region: block.region,
                image: block.image,
                copy_image: block.copy_image,
                container_image: block.container_image,
                repository_url: block.repository_url,
                policy: dotEcrRepository.policy,
                max_untagged_count: dotEcrRepository.max_untagged_count,
                dont_expire_images: dotEcrRepository.dont_expire_images,
                expire_untagged_after_days: dotEcrRepository.expire_untagged_after_days,
                skip_build: block.skip_build,
                name_prefix: [namePrefix]
              }
            }]
          }
        ]
      };
    });
    pipe.pushWithParams({ name: "export_generate", lifecycleSteps: allGenerateSteps }, (input) => exportDatabags(input.previousStepResult));
    pipe.pushWithParams({ name: "ecr_pre_do", lifecycleSteps: ["pre_do"] }, (input) => {
      return {
        imports: [
          {
            url: AWS_ECR_REPOSITORY_WITH_IMAGE_URL,
            copyFromContainer: ["cr_[terraform]", "state_store"],
            input: [{
              Type: AWS_ECR_REPOSITORY_WITH_IMAGE,
              Name: `${bag.Name}-ecr`,
              Value: {
                region: block.region,
                image: block.image,
                copy_image: block.copy_image,
                container_image: block.container_image,
                repository_url: block.repository_url,
                policy: dotEcrRepository.policy,
                max_untagged_count: dotEcrRepository.max_untagged_count,
                dont_expire_images: dotEcrRepository.dont_expire_images,
                expire_untagged_after_days: dotEcrRepository.expire_untagged_after_days,
                skip_build: block.skip_build,
                name_prefix: [namePrefix]
              }
            }]
          }
        ]
      };
    });
    pipe.pushWithParams({ name: "export_pre_do", lifecycleSteps: ["pre_do"] }, (input) => exportDatabags(input.previousStepResult));
    pipe.pushWithParams({ name: "trigger_deploy", lifecycleSteps: ["post_apply"] }, (input) => {
      if (!asVal(block.dont_redeploy_on_apply || asSyntax(false))) {
        const tfOutput = asValArrayConst(container.terraform_execute_output?.default_apply[0].Value);
        const clusterName = asStr(tfOutput.find((pair) => asStr(pair.key) === `aws_fargate_service_${bag.Name}_cluster`).value);
        const serviceName = asStr(tfOutput.find((pair) => asStr(pair.key) === `aws_fargate_service_${bag.Name}_service`).value);
        const awsCreds = getAwsCreds();
        if (!awsCreds) {
          throwStatement(`aws_fargate_service.${bag.Name} needs AWS credentials to build the image`);
        }
        const transforms = [{
          Type: "buildkit_run_in_container",
          Name: `aws_fargate_service_${bag.Name}_redeploy`,
          Value: {
            no_cache: true,
            display_name: `Trigger deployment - aws_fargate_service.${bag.Name}`,
            dockerfile: `
                        FROM amazon/aws-cli:latest
    
                        ENV AWS_ACCESS_KEY_ID="${awsCreds.access_key_id}"
                        ENV AWS_SECRET_ACCESS_KEY="${awsCreds.secret_access_key}"
                        ENV AWS_SESSION_TOKEN="${awsCreds.session_token}"
                        ENV AWS_REGION="${asStr(block.region || os.getenv("AWS_REGION") || "us-east-1")}"
                        ENV AWS_PAGER=""
    
                        RUN aws ecs update-service --service ${serviceName} --cluster ${clusterName} --force-new-deployment`
          }
        }];
        return { transforms };
      }
    });
    pipe.pushWithParams({ name: "ecr_destroy", lifecycleSteps: ["destroy"] }, (input) => {
      return {
        imports: [
          {
            url: AWS_ECR_REPOSITORY_WITH_IMAGE_URL,
            copyFromContainer: ["cr_[terraform]", "state_store"],
            input: [{
              Type: AWS_ECR_REPOSITORY_WITH_IMAGE,
              Name: `${bag.Name}-ecr`,
              Value: {
                region: block.region,
                image: block.image,
                copy_image: block.copy_image,
                container_image: block.container_image,
                repository_url: block.repository_url,
                policy: dotEcrRepository.policy,
                max_untagged_count: dotEcrRepository.max_untagged_count,
                dont_expire_images: dotEcrRepository.dont_expire_images,
                expire_untagged_after_days: dotEcrRepository.expire_untagged_after_days,
                skip_build: block.skip_build,
                name_prefix: [namePrefix]
              }
            }]
          }
        ]
      };
    });
    pipe.pushWithParams({ name: "export_destroy", lifecycleSteps: ["destroy"] }, (input) => exportDatabags(input.previousStepResult));
    return pipe;
  }
  function awsFargateServiceResources(bag) {
    if (!bag.Value) {
      return [];
    }
    const [block, namePrefix] = applyDefaults(container, bag.Value);
    const cloudResource = preConfCloudResourceFactory(block, "resource");
    const cloudData = preConfCloudResourceFactory(block, "data");
    const cloudOutput = preConfCloudResourceFactory(block, "output");
    const traversalTransform = preConfTraversalTransform(bag);
    const dotEnvironment = compileBlockParam(block, "environment");
    const dotAutoScaling = compileBlockParam(block, "auto_scaling");
    const dotContainerImage = compileBlockParam(block, "container_image");
    const dotNetwork = compileBlockParam(block, "network");
    const dotLoadBalancer = compileBlockParam(block, "load_balancer");
    const cpu = block.cpu || 256;
    const memory = block.memory || 512;
    const regionDataName = asStr(block.region || "current");
    const portMapping = asValArrayConst(block.port_mapping || asSyntax([]));
    const mappedPorts = asVal(block.mapped_ports || asSyntax([]));
    const hasProvidedImage = !!(block.image || dotContainerImage.image);
    const shouldCopyProvidedImage = asVal(block.copy_image || dotContainerImage.copy_image || asSyntax(true));
    const taskAccessibility = block.task_accessibility ? asStr(block.task_accessibility) : null;
    const containerName = appendToTemplate(namePrefix, [`${bag.Name}-fs-task-def`]);
    const enableHttps = !!dotLoadBalancer.domain;
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
      mappedPorts.push(asSyntax(80));
      portsToOpen.push(
        {
          port: "80",
          protocol: "tcp"
        }
      );
    }
    let executionRole;
    let securityGroupId;
    let databags = [];
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
    if (block.auto_scaling && !asVal(dotAutoScaling.disabled || asSyntax(false))) {
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
    let ecsLoadBalancers = [];
    function getTaskSubnets() {
      if (taskAccessibility) {
        switch (taskAccessibility) {
          case "public":
            return asTraversal(`aws_network.aws_fargate_service_${bag.Name}.public_subnets.*.id`);
          case "private":
            return asTraversal(`aws_network.aws_fargate_service_${bag.Name}.private_subnets.*.id`);
          default:
            throw new Error(`Unknown value '${taskAccessibility}' on aws_fargate_service.${bag.Name}.task_accessibility, it must be either 'public' or 'private'`);
        }
      }
      if (block.load_balancer) {
        return asTraversal(`aws_network.aws_fargate_service_${bag.Name}.private_subnets.*.id`);
      }
      if (block.network && dotNetwork.make_nat_gateway && asVal(dotNetwork.make_nat_gateway)) {
        return asTraversal(`aws_network.aws_fargate_service_${bag.Name}.private_subnets`);
      }
      return asTraversal(`aws_network.aws_fargate_service_${bag.Name}.public_subnets.*.id`);
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
        subnets: getTaskSubnets(),
        security_groups: [securityGroupId],
        assign_public_ip: true
      }])
    };
    if (block.auto_scaling && !asVal(dotAutoScaling.disabled || asSyntax(false))) {
      ecsService.lifecycle = asBlock([{
        ignore_changes: [asTraversal("desired_count")]
      }]);
    }
    if (block.load_balancer) {
      ecsService.depends_on = [
        asTraversal(`aws_lb.${bag.Name}_fargate_lb`)
      ];
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
      const defineAccessLogsResources = asVal(dotLoadBalancer.enable_access_logs || asSyntax(false)) || !!dotAutoScaling.access_logs;
      const dotAccessLogs = compileBlockParam(dotLoadBalancer, "access_logs");
      const portMappingLoadBalancer = asValArrayConst(dotLoadBalancer.port_mapping || asSyntax([]));
      const dotHealthCheck = compileBlockParam(dotLoadBalancer, "health_check");
      const loadBalancerType = asStr(dotLoadBalancer.type || "application");
      const internal = asVal(dotLoadBalancer.internal || asSyntax(false));
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
      let healthCheckBlock;
      if (dotLoadBalancer.health_check) {
        healthCheckBlock = asBlock([{
          enabled: dotHealthCheck.enabled || true,
          healthy_threshold: dotHealthCheck.healthy_threshold,
          unhealthy_threshold: dotHealthCheck.unhealthy_threshold,
          timeout: dotHealthCheck.timeout,
          interval: dotHealthCheck.interval,
          matcher: dotHealthCheck.matcher || "200-399",
          // '/healthCheck' is the same route that route53 health checks use
          path: dotHealthCheck.path || "/healthCheck"
        }]);
      }
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
        ...portsToOpenLoadBalancer.flatMap((obj) => {
          ecsLoadBalancers.push({
            target_group_arn: asTraversal(`aws_lb_target_group.aws_fargate_service_${bag.Name}_${obj.protocol}${obj.load_balancer_port}_lb_listener_target.arn`),
            container_name: containerName,
            container_port: obj.target_port
          });
          return [
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
              target_type: "ip",
              health_check: healthCheckBlock
            })
          ];
        })
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
          ecsLoadBalancers.push({
            target_group_arn: asTraversal(`aws_lb_target_group.aws_fargate_service_${bag.Name}_lonely_http_lb_listener_target.arn`),
            container_name: containerName,
            container_port: portsToOpen[0].port
          });
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
              target_type: "ip",
              health_check: healthCheckBlock
            })
          );
          if (enableHttps) {
            const dotDomain = compileBlockParam(dotLoadBalancer, "domain");
            const domainBlock = awsDomainBlockResources({
              dotDomain,
              domainValue: asTraversal(`aws_lb.${bag.Name}_fargate_lb.dns_name`),
              resourcePrefix: `aws_fargate_service_${bag.Name}`,
              apexHostedZoneId: asTraversal(`aws_lb.${bag.Name}_fargate_lb.zone_id`),
              cloudData,
              cloudResource
            });
            if (!domainBlock) {
              throwStatement(`missing 'name' on aws_fargate_service.${bag.Name}.load_balancer.domain`);
            }
            databags.push(
              ...domainBlock.databags,
              cloudResource("aws_lb_listener", `aws_fargate_service_${bag.Name}_lonely_https_lb_listener`, {
                depends_on: domainBlock.certRef ? [domainBlock.certRef] : null,
                load_balancer_arn: asTraversal(`aws_lb.${bag.Name}_fargate_lb.arn`),
                port: 443,
                protocol: "HTTPS",
                certificate_arn: domainBlock.certArn,
                default_action: asBlock([{
                  type: "forward",
                  target_group_arn: asTraversal(`aws_lb_target_group.aws_fargate_service_${bag.Name}_lonely_http_lb_listener_target.arn`)
                }])
              })
            );
          }
        } else if (portsToOpen.some((obj) => obj.port === "80" || obj.port === "443")) {
          const eightyIsOpen = portsToOpen.some((obj) => obj.port === "80");
          const fourFourThreeIsOpen = portsToOpen.some((obj) => obj.port === "443");
          if (eightyIsOpen) {
            ecsLoadBalancers.push({
              target_group_arn: asTraversal(`aws_lb_target_group.aws_fargate_service_${bag.Name}_http_lb_listener_target.arn`),
              container_name: containerName,
              container_port: 80
            });
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
                target_type: "ip",
                health_check: healthCheckBlock
              })
            );
          }
          if (fourFourThreeIsOpen) {
            if (enableHttps) {
              const dotDomain = compileBlockParam(dotLoadBalancer, "domain");
              const domainBlock = awsDomainBlockResources({
                dotDomain,
                domainValue: asTraversal(`aws_lb.${bag.Name}_fargate_lb.dns_name`),
                resourcePrefix: `aws_fargate_service_${bag.Name}`,
                apexHostedZoneId: asTraversal(`aws_lb.${bag.Name}_fargate_lb.zone_id`),
                cloudData,
                cloudResource
              });
              if (!domainBlock) {
                throwStatement(`missing 'name' on aws_fargate_service.${bag.Name}.load_balancer.domain`);
              }
              databags.push(
                ...domainBlock.databags,
                cloudResource("aws_lb_listener", `aws_fargate_service_${bag.Name}_https_lb_listener`, {
                  depends_on: domainBlock.certRef ? [domainBlock.certRef] : null,
                  load_balancer_arn: asTraversal(`aws_lb.${bag.Name}_fargate_lb.arn`),
                  port: 443,
                  protocol: "HTTPS",
                  certificate_arn: domainBlock.certArn,
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
            ecsLoadBalancers.push({
              target_group_arn: asTraversal(`aws_lb_target_group.aws_fargate_service_${bag.Name}_https_lb_listener_target.arn`),
              container_name: containerName,
              container_port: 443
            });
            databags.push(
              cloudResource("aws_lb_target_group", `aws_fargate_service_${bag.Name}_https_lb_listener_target`, {
                name: appendToTemplate(namePrefix, [`${bag.Name}-fs-https-lb-tg`]),
                port: 443,
                protocol: "HTTPS",
                vpc_id: asTraversal(`aws_network.aws_fargate_service_${bag.Name}.vpc.id`),
                target_type: "ip",
                health_check: healthCheckBlock
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
            ...portsToOpen.flatMap((obj) => {
              ecsLoadBalancers.push({
                target_group_arn: asTraversal(`aws_lb_target_group.aws_fargate_service_${bag.Name}_net_${obj.port}_lb_listener_target.arn`),
                container_name: containerName,
                container_port: obj.port
              });
              return [
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
              ];
            })
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
    if (ecsLoadBalancers.length !== 0) {
      ecsService.load_balancer = asBlock(ecsLoadBalancers);
    }
    databags.push(
      cloudData("aws_availability_zones", "current", {}),
      cloudResource("aws_ecs_cluster", `${bag.Name}_fargate_cluster`, {
        name: appendToTemplate(namePrefix, [`${bag.Name}-fs-cluster`])
      }),
      traversalTransform(`aws_fargate_service_transforms`, {
        [`aws_fargate_service.${bag.Name}.ecs_cluster`]: `aws_ecs_cluster.${bag.Name}_fargate_cluster`,
        [`aws_fargate_service.${bag.Name}.ecs_service`]: `aws_ecs_service.${bag.Name}_fargate_service`,
        [`aws_fargate_service.${bag.Name}.load_balancer`]: `aws_lb.${bag.Name}_fargate_lb`,
        [`aws_fargate_service.${bag.Name}.run_task_payload`]: `data.template_file.${bag.Name}_fargate_run_task_payload.rendered`
      }),
      cloudData("template_file", `${bag.Name}_fargate_run_task_payload`, {
        template: `{
                "taskDefinition": "\${task_definition}",
                "cluster": "\${cluster}",
                "launchType": "FARGATE",
                "count": 1,
                "networkConfiguration": {
                    "awsvpcConfiguration": {
                        "subnets": \${subnet_ids},
                        "securityGroups": ["\${security_group_id}"],
                        "assignPublicIp": "ENABLED"
                    }
                },
                "overrides": {
                    "containerOverrides": [
                        {
                            "name": "\${container_name}"
                        }
                    ]
                }
            }`,
        vars: {
          task_definition: asTraversal(`aws_ecs_task_definition.${bag.Name}_fargate_task_def.arn`),
          cluster: asTraversal(`aws_ecs_cluster.${bag.Name}_fargate_cluster.name`),
          subnet_ids: asFuncCall("jsonencode", [
            getTaskSubnets()
          ]),
          security_group_id: securityGroupId,
          container_name: containerName
        }
      }),
      cloudOutput("", `aws_fargate_service_${bag.Name}_cluster`, {
        value: asTraversal(`aws_ecs_cluster.${bag.Name}_fargate_cluster.name`)
      }),
      cloudResource("aws_ecs_service", `${bag.Name}_fargate_service`, ecsService),
      cloudOutput("", `aws_fargate_service_${bag.Name}_service`, {
        value: asTraversal(`aws_ecs_service.${bag.Name}_fargate_service.name`)
      }),
      cloudResource("aws_cloudwatch_log_group", `${bag.Name}_fargate_task_logs`, {
        name: appendToTemplate(asSyntax("/ecs/"), [namePrefix, bag.Name]),
        retention_in_days: block.logs_retention_days || 30
      }),
      cloudResource("aws_ecs_task_definition", `${bag.Name}_fargate_task_def`, {
        family: containerName,
        cpu,
        memory,
        network_mode: "awsvpc",
        requires_compatibilities: ["FARGATE"],
        execution_role_arn: executionRole,
        task_role_arn: block.role || asTraversal("aws_iam_role.default_lambda_role.arn"),
        runtime_platform: block.operating_system_family || block.cpu_architecture ? asBlock([{
          operating_system_family: block.operating_system_family || "LINUX",
          cpu_architecture: block.cpu_architecture || "X86_64"
        }]) : void 0,
        container_definitions: asFuncCall(
          "jsonencode",
          //that's an array of arrays cause we're json marshalling a list of objects
          [[
            {
              name: containerName,
              image: asTemplate([
                asTraversal(`aws_ecr_repository_with_image.${bag.Name}-ecr.repository_url`),
                ":latest"
              ]),
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
    return databags;
  }
  executePipelineGroup(container, iterateBlocks(container, AWS_FARGATE_SERVICE, awsFargateServiceIterator).flat());
})();
