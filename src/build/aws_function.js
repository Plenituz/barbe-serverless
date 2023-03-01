(() => {
  // barbe-sls-lib/consts.ts
  var AWS_FUNCTION = "aws_function";
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
  function appendToTraversal(source, toAdd) {
    return {
      Type: source.Type,
      Traversal: [
        ...source.Traversal || [],
        ...toAdd.split(".").map((part) => ({
          Type: "attr",
          Name: part
        }))
      ]
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
  function readDatabagContainer() {
    return JSON.parse(os.file.readFile("__barbe_input.json"));
  }
  function onlyRunForLifecycleSteps(steps) {
    const step = barbeLifecycleStep();
    if (!steps.includes(step)) {
      quit();
    }
  }
  var IS_VERBOSE = os.getenv("BARBE_VERBOSE") === "1";
  function barbeLifecycleStep() {
    return os.getenv("BARBE_LIFECYCLE_STEP");
  }

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

  // aws_function.ts
  var container = readDatabagContainer();
  onlyRunForLifecycleSteps(["pre_generate", "generate", "post_generate"]);
  function awsFunctionIterator(bag) {
    if (!bag.Value) {
      return [];
    }
    const [block, namePrefix] = applyDefaults(container, bag.Value);
    const cloudResourceId = block.cloudresource_id ? asStr(block.cloudresource_id) : void 0;
    const cloudResourceDir = block.cloudresource_dir ? asStr(block.cloudresource_dir) : void 0;
    const cloudResource = preConfCloudResourceFactory(block, "resource");
    const cloudData = preConfCloudResourceFactory(block, "data");
    const traversalTransform = preConfTraversalTransform(bag);
    const dotPackage = compileBlockParam(block, "package");
    const packageLocation = dotPackage.packaged_file || `.package/${bag.Name}_lambda_package.zip`;
    const dotEnvironment = compileBlockParam(block, "environment");
    const dotProvisionedConc = compileBlockParam(block, "provisioned_concurrency");
    let databags = [
      //we need to duplicate this in case this component is imported without the aws_base component
      cloudData("aws_caller_identity", "current", {}),
      traversalTransform("aws_function_traversal_transform", {
        [`aws_function.${bag.Name}`]: `aws_lambda_function.${bag.Name}_lambda`,
        [`aws_function.${bag.Name}.function_url`]: `aws_lambda_function_url.${bag.Name}_lambda_url.function_url`
      }),
      //TODO allow using existing bucket
      cloudResource("aws_s3_bucket", "deployment_bucket", {
        bucket: appendToTemplate(namePrefix, ["deploy-bucket"]),
        force_destroy: true
      }),
      cloudResource("aws_s3_object", `${bag.Name}_package`, {
        bucket: asTraversal("aws_s3_bucket.deployment_bucket.id"),
        key: appendToTemplate(namePrefix, [`${bag.Name}_lambda_package.zip`]),
        source: packageLocation,
        etag: asFuncCall("filemd5", [packageLocation])
      }),
      cloudResource("aws_lambda_function", `${bag.Name}_lambda`, {
        function_name: appendToTemplate(namePrefix, [bag.Name]),
        package_type: "Zip",
        publish: true,
        description: block.description || void 0,
        handler: block.handler || void 0,
        runtime: block.runtime || void 0,
        memory_size: block.memory_size || 128,
        timeout: block.timeout || 900,
        ephemeral_storage: block.ephemeral_storage || void 0,
        role: block.role || asTraversal("aws_iam_role.default_lambda_role.arn"),
        architectures: [block.architecture || "x86_64"],
        layers: block.layers || void 0,
        s3_bucket: asTraversal("aws_s3_bucket.deployment_bucket.id"),
        s3_key: asTraversal(`aws_s3_object.${bag.Name}_package.id`),
        source_code_hash: asFuncCall("filebase64sha256", [packageLocation]),
        // "architectures" causes a re-deploys even when unchanged, so we kind of have to add this.
        // this technically forces users to delete/recreate lambda functions if they change the architecture
        // but it's probably a rare thing to do/a bad idea anyway
        lifecycle: asBlock([{
          ignore_changes: [
            asTraversal("architectures")
          ]
        }]),
        environment: block.environment ? asBlock([{ variables: dotEnvironment }]) : void 0
      }),
      cloudResource("aws_cloudwatch_log_group", `${bag.Name}_lambda_logs`, {
        name: asTemplate([
          "/aws/lambda/",
          asTraversal(`aws_lambda_function.${bag.Name}_lambda.function_name`)
        ]),
        retention_in_days: block.logs_retention_days || 30
      })
    ];
    if (!dotPackage.packaged_file) {
      databags.push({
        Name: `${bag.Name}_${cloudResourceId}${cloudResourceDir}_lambda_package`,
        Type: "zipper",
        Value: {
          output_file: `${cloudResourceDir ? `${cloudResourceDir}/` : ""}${packageLocation}`,
          file_map: dotPackage.file_map || {},
          include: dotPackage.include || [],
          exclude: dotPackage.exclude || []
        }
      });
    }
    if (block.function_url_enabled && asVal(block.function_url_enabled)) {
      databags.push(
        cloudResource("aws_lambda_function_url", bag.Name + "_lambda_url", {
          function_name: asTraversal(`aws_lambda_function.${bag.Name}_lambda.function_name`),
          authorization_type: "NONE"
        })
      );
    }
    if (block.provisioned_concurrency) {
      databags.push(
        cloudResource("aws_lambda_alias", `${bag.Name}_alias`, {
          name: dotProvisionedConc.alias_name || "provisioned",
          function_name: asTraversal(`aws_lambda_function.${bag.Name}_lambda.arn`),
          function_version: asTraversal(`aws_lambda_function.${bag.Name}_lambda.version`)
        }),
        cloudResource("aws_lambda_provisioned_concurrency_config", `${bag.Name}_prov_conc`, {
          function_name: asTraversal(`aws_lambda_function.${bag.Name}_lambda.arn`),
          qualifier: asTraversal(`aws_lambda_alias.${bag.Name}_alias.function_name`),
          provisioned_concurrent_executions: dotProvisionedConc.value || dotProvisionedConc.min || 1
        })
      );
      if (dotProvisionedConc.min || dotProvisionedConc.max) {
        databags.push(
          cloudResource("aws_appautoscaling_target", `${bag.Name}_autoscl_trgt`, {
            max_capacity: dotProvisionedConc.max || 1,
            min_capacity: dotProvisionedConc.min || 1,
            resource_id: asTemplate([
              "function:",
              asTraversal(`aws_lambda_function.${bag.Name}_lambda.function_name`),
              ":",
              asTraversal(`aws_lambda_alias.${bag.Name}_alias.name`)
            ]),
            scalable_dimension: "lambda:function:ProvisionedConcurrency",
            service_namespace: "lambda",
            role_arn: asTemplate([
              "arn:aws:iam::",
              asTraversal("data.aws_caller_identity.current.account_id"),
              ":role/aws-service-role/lambda.application-autoscaling.amazonaws.com/AWSServiceRoleForApplicationAutoScaling_LambdaConcurrency"
            ])
          }),
          cloudResource("aws_appautoscaling_policy", `${bag.Name}_autoscl_pol`, {
            name: asTemplate([
              "ProvConcAutoScal:",
              asTraversal(`aws_lambda_function.${bag.Name}_lambda.function_name`)
            ]),
            scalable_dimension: "lambda:function:ProvisionedConcurrency",
            service_namespace: "lambda",
            policy_type: "TargetTrackingScaling",
            resource_id: asTraversal(`aws_appautoscaling_target.${bag.Name}_autoscl_trgt.resource_id`),
            target_tracking_scaling_policy_configuration: asBlock([{
              //TODO make these configurable eventually
              target_value: 0.75,
              scale_in_cooldown: 120,
              scale_out_cooldown: 0,
              customized_metric_specification: asBlock([{
                metric_name: "ProvisionedConcurrencyUtilization",
                namespace: "AWS/Lambda",
                statistic: "Maximum",
                unit: "Count",
                dimensions: asBlock([
                  {
                    name: "FunctionName",
                    value: asTraversal(`aws_lambda_function.${bag.Name}_lambda.function_name`)
                  },
                  {
                    name: "Resource",
                    value: asTemplate([
                      asTraversal(`aws_lambda_function.${bag.Name}_lambda.function_name`),
                      ":",
                      asTraversal(`aws_lambda_alias.${bag.Name}_alias.name`)
                    ])
                  }
                ])
              }])
            }])
          })
        );
      }
    }
    if (block.event_s3) {
      const bucketTraversalsStr = Array.from(new Set(
        asValArrayConst(block.event_s3).map((event) => event.bucket).filter((t) => t).map(asStr)
      ));
      databags.push(
        ...bucketTraversalsStr.map((traversalStr, i) => cloudResource("aws_lambda_permission", `${bag.Name}_${i}_s3_permission`, {
          statement_id: "AllowExecutionFromS3Bucket",
          action: "lambda:InvokeFunction",
          principal: "s3.amazonaws.com",
          function_name: asTraversal(`aws_lambda_function.${bag.Name}_lambda.function_name`),
          source_arn: appendToTraversal(asTraversal(traversalStr), "arn")
        }))
      );
    }
    return databags;
  }
  exportDatabags(iterateBlocks(container, AWS_FUNCTION, awsFunctionIterator).flat());
})();
