(() => {
  // barbe-sls-lib/consts.ts
  var AWS_S3 = "aws_s3";
  var AWS_FUNCTION = "aws_function";
  var EVENT_S3 = "event_s3";

  // barbe-std/rpc.ts
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
    if (typeof token === "object" && token.hasOwnProperty("Type") && token.Type in SyntaxTokenTypes) {
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
    } else if (typeof token === "object") {
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
  function asTemplateStr(arr) {
    if (!Array.isArray(arr)) {
      arr = [arr];
    }
    return {
      Type: "template",
      Parts: arr.map((item) => {
        if (typeof item === "string") {
          return {
            Type: "literal_value",
            Value: item
          };
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
  function concatStrArr(token) {
    const arr = asValArrayConst(token);
    const parts = arr.map((item) => asTemplateStr(item).Parts || []).flat();
    return {
      Type: "template",
      Parts: parts
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
      ArrayConst: arr.map((obj) => ({
        Type: "object_const",
        Meta: { IsBlock: true },
        ObjectConst: Object.keys(obj).map((key) => ({
          Key: key,
          Value: asSyntax(obj[key])
        }))
      }))
    };
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
    const resp = barbeRpcCall({
      method: "exportDatabags",
      params: [{
        databags: bags
      }]
    });
    if (resp.error) {
      throw new Error(resp.error);
    }
  }
  function readDatabagContainer() {
    return JSON.parse(os.file.readFile("__barbe_input.json"));
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
    return [
      blockVal,
      compileNamePrefix(blockVal)
    ];
  }
  function compileNamePrefix(blockVal) {
    return concatStrArr(blockVal.name_prefix || asSyntax([]));
  }
  function preConfCloudResourceFactory(blockVal, kind, preconf) {
    const cloudResourceId = blockVal.cloudresource_id ? asStr(blockVal.cloudresource_id) : void 0;
    const cloudResourceDir = blockVal.cloudresource_dir ? asStr(blockVal.cloudresource_dir) : void 0;
    return (type, name, value) => cloudResourceRaw({
      kind,
      dir: cloudResourceId,
      id: cloudResourceDir,
      type,
      name,
      value: {
        provider: blockVal.region ? asTraversal(`aws.${asStr(blockVal.region)}`) : void 0,
        ...preconf,
        ...value
      }
    });
  }
  function preConfTraversalTransform(blockVal) {
    return (name, transforms) => ({
      Name: `${blockVal.Name}_${name}`,
      Type: "traversal_transform",
      Value: transforms
    });
  }

  // aws_s3.ts
  var container = readDatabagContainer();
  function awsS3Iterator(bag) {
    if (!bag.Value) {
      return [];
    }
    const [block, namePrefix] = applyDefaults(container, bag.Value);
    const cloudResource = preConfCloudResourceFactory(block, "resource");
    const traversalTransform = preConfTraversalTransform(block);
    const allEventS3 = iterateBlocks(container, AWS_FUNCTION, (awsFuncBag) => {
      if (!awsFuncBag.Value) {
        return [];
      }
      if (awsFuncBag.Value.Type !== "object_const" || !awsFuncBag.Value.ObjectConst) {
        return [];
      }
      const eventS3Keys = awsFuncBag.Value.ObjectConst.map((pair) => {
        if (pair.Key !== EVENT_S3 || !pair.Value || pair.Value.Type !== "array_const" || !pair.Value.ArrayConst) {
          return [];
        }
        const events = asValArrayConst(pair.Value);
        const eventsToMyBucket = events.filter(
          (event) => event.bucket && event.bucket.Type.includes("traversal") && event.bucket.Traversal[1] && event.bucket.Traversal[1].Name === bag.Name
        );
        return eventsToMyBucket.map((event) => ({
          event,
          bag: awsFuncBag
        }));
      }).flat();
      return eventS3Keys;
    }).flat();
    let databags = [
      traversalTransform("aws_s3_traversal_transform", {
        [`aws_s3.${bag.Name}`]: `aws_s3_bucket.${bag.Name}_s3`
      }),
      cloudResource("aws_s3_bucket", `${bag.Name}_s3`, {
        bucket: appendToTemplate(namePrefix, [bag.Name]),
        force_destroy: block.force_destroy
      })
    ];
    if (block.object_lock_enabled) {
      databags.push(
        traversalTransform("aws_s3_object_lock_traversal_transform", {
          [`aws_s3.${bag.Name}.object_lock`]: `aws_s3_bucket_object_lock_configuration.${bag.Name}_s3_object_lock`
        }),
        cloudResource("aws_s3_bucket_object_lock_configuration", `${bag.Name}_s3_object_lock`, {
          bucket: asTraversal(`aws_s3_bucket.${bag.Name}_s3.bucket`),
          object_lock_enabled: block.object_lock_enabled
        })
      );
    }
    if (block.versioning_enabled && asVal(block.versioning_enabled) === true) {
      databags.push(
        traversalTransform("aws_s3_versioning_traversal_transform", {
          [`aws_s3.${bag.Name}.versioning`]: `aws_s3_bucket_versioning.${bag.Name}_s3_versioning`
        }),
        cloudResource("aws_s3_bucket_versioning", `${bag.Name}_s3_versioning`, {
          bucket: asTraversal(`aws_s3_bucket.${bag.Name}_s3.bucket`),
          versioning_configuration: asBlock([{
            status: "Enabled"
          }])
        })
      );
    }
    if (block.cors_rule) {
      databags.push(
        traversalTransform("aws_s3_cors_traversal_transform", {
          [`aws_s3.${bag.Name}.cors`]: `aws_s3_bucket_cors_configuration.${bag.Name}_s3_cors`
        }),
        cloudResource("aws_s3_bucket_cors_configuration", `${bag.Name}_s3_cors`, {
          bucket: asTraversal(`aws_s3_bucket.${bag.Name}_s3.bucket`),
          cors_rule: asBlock(asValArrayConst(block.cors_rule).map((rule) => ({
            id: rule.id,
            allowed_headers: rule.allowed_headers,
            allowed_methods: rule.allowed_methods,
            allowed_origins: rule.allowed_origins,
            expose_headers: rule.expose_headers,
            max_age_seconds: rule.max_age_seconds
          })))
        })
      );
    }
    if (allEventS3.length !== 0) {
      databags.push(
        cloudResource("aws_s3_bucket_notification", `${bag.Name}_s3_notification`, {
          //TODO this is needed to avoid having to deploy twice the first time the template gets deployed
          // comment above: unsure if that's still true
          //depends_on: [
          //	for tuple in allEventS3 {
          //		let functionLabel = (barbe.#AsValArrayConst & {#In: tuple[1].labels}).out[0]
          //		barbe.#AsTraversal & {#In: "aws_lambda_permission.\(functionLabel)_\(labels[0])_s3_permission"}
          //	}
          //]
          bucket: asTraversal(`aws_s3_bucket.${bag.Name}_s3.bucket`),
          lambda_function: asBlock(allEventS3.map((tuple) => ({
            lambda_function_arn: asTraversal(`aws_lambda_function.${tuple.bag.Name}_lambda.arn`),
            events: tuple.event.events || ["s3:*"],
            filter_prefix: tuple.event.prefix,
            filter_suffix: tuple.event.suffix
          })))
        })
      );
    }
    return databags;
  }
  exportDatabags(iterateBlocks(container, AWS_S3, awsS3Iterator).flat());
})();
