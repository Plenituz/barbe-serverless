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
  function accumulateTokens(root, visitor) {
    const shouldKeep = visitor(root);
    if (shouldKeep) {
      return [root];
    }
    switch (root.Type) {
      default:
        return [];
      case "anon":
      case "literal_value":
      case "scope_traversal":
        return [];
      case "relative_traversal":
        return accumulateTokens(root.Source, visitor);
      case "splat":
        return [
          ...accumulateTokens(root.Source, visitor),
          ...accumulateTokens(root.SplatEach, visitor)
        ];
      case "object_const":
        return root.ObjectConst?.map((item) => accumulateTokens(item.Value, visitor)).flat() || [];
      case "array_const":
        return root.ArrayConst?.map((item) => accumulateTokens(item, visitor)).flat() || [];
      case "template":
        return root.Parts?.map((item) => accumulateTokens(item, visitor)).flat() || [];
      case "function_call":
        return root.FunctionArgs?.map((item) => accumulateTokens(item, visitor)).flat() || [];
      case "index_access":
        return [
          ...accumulateTokens(root.IndexCollection, visitor),
          ...accumulateTokens(root.IndexKey, visitor)
        ];
      case "conditional":
        return [
          ...accumulateTokens(root.Condition, visitor),
          ...accumulateTokens(root.TrueResult, visitor),
          ...accumulateTokens(root.FalseResult, visitor)
        ];
      case "parens":
        return accumulateTokens(root.Source, visitor);
      case "binary_op":
        return [
          ...accumulateTokens(root.LeftHandSide, visitor),
          ...accumulateTokens(root.RightHandSide, visitor)
        ];
      case "unary_op":
        return accumulateTokens(root.RightHandSide, visitor);
      case "for":
        return [
          ...accumulateTokens(root.ForCollExpr, visitor),
          root.ForKeyExpr ? accumulateTokens(root.ForKeyExpr, visitor) : [],
          ...accumulateTokens(root.ForValExpr, visitor),
          root.ForCondExpr ? accumulateTokens(root.ForCondExpr, visitor) : []
        ].flat();
    }
  }
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
  function findInBlocks(container2, func) {
    const types = Object.keys(container2);
    for (const type of types) {
      const blockNames = Object.keys(container2[type]);
      for (const blockName of blockNames) {
        for (const block of container2[type][blockName]) {
          const r = func(block);
          if (r) {
            return r;
          }
        }
      }
    }
    return null;
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
  var BARBE_SLS_VERSION = "v0.2.3";
  var ANYFRONT_VERSION = "v0.2.3";
  var TERRAFORM_EXECUTE_URL = `https://hub.barbe.app/barbe-serverless/terraform_execute.js:${BARBE_SLS_VERSION}`;
  var AWS_IAM_URL = `https://hub.barbe.app/barbe-serverless/aws_iam.js:${BARBE_SLS_VERSION}`;
  var AWS_LAMBDA_URL = `https://hub.barbe.app/barbe-serverless/aws_function.js:${BARBE_SLS_VERSION}`;
  var GCP_PROJECT_SETUP_URL = `https://hub.barbe.app/anyfront/gcp_project_setup.js:${ANYFRONT_VERSION}`;
  var AWS_S3_SYNC_URL = `https://hub.barbe.app/anyfront/aws_s3_sync_files.js:${ANYFRONT_VERSION}`;
  var FRONTEND_BUILD_URL = `https://hub.barbe.app/anyfront/frontend_build.js:${ANYFRONT_VERSION}`;
  var GCP_CLOUDRUN_STATIC_HOSTING_URL = `https://hub.barbe.app/anyfront/gcp_cloudrun_static_hosting.js:${ANYFRONT_VERSION}`;
  var AWS_NEXT_JS_URL = `https://hub.barbe.app/anyfront/aws_next_js.js:${ANYFRONT_VERSION}`;
  var GCP_NEXT_JS_URL = `https://hub.barbe.app/anyfront/gcp_next_js.js:${ANYFRONT_VERSION}`;
  var AWS_SVELTEKIT_URL = `https://hub.barbe.app/anyfront/aws_sveltekit.js:${ANYFRONT_VERSION}`;
  var AWS_CLOUDFRONT_STATIC_HOSTING_URL = `https://hub.barbe.app/anyfront/aws_cloudfront_static_hosting.js:${ANYFRONT_VERSION}`;
  var STATIC_HOSTING_URL = `https://hub.barbe.app/anyfront/static_hosting.js:${ANYFRONT_VERSION}`;

  // barbe-sls-lib/helpers.ts
  function listReferencedAWSRegions(container2) {
    const regionNames = iterateAllBlocks(container2, (bag) => {
      if (!bag.Value) {
        return [];
      }
      const keepTokens = (token) => {
        return token.Type === "scope_traversal" && (token.Traversal || []).length === 2 && token.Traversal[0].Name === "aws";
      };
      const allTraversals = accumulateTokens(bag.Value, keepTokens);
      const regionNamesInThisBlock = allTraversals.map((token) => {
        if (!token.Traversal || !token.Traversal[1] || !token.Traversal[1].Name) {
          console.log(`!!!malformatted region traversal: '${token}'`);
          return "";
        }
        return token.Traversal[1].Name;
      }).filter((name) => name);
      return Array.from(new Set(regionNamesInThisBlock));
    }).flat();
    return Array.from(new Set(regionNames));
  }

  // aws_provider.ts
  var container = readDatabagContainer();
  onlyRunForLifecycleSteps(["pre_generate", "generate", "post_generate"]);
  var allRegions = listReferencedAWSRegions(container);
  var alreadyDeclaredProviders = new Set(iterateAllBlocks(container, (bag) => {
    if (!bag.Value) {
      return [];
    }
    if (bag.Type.includes("provider")) {
      const block = asVal(bag.Value);
      if (block.alias) {
        return [asStr(block.alias)];
      }
    }
    return [];
  }).flat());
  var newProviders = allRegions.filter((region) => !alreadyDeclaredProviders.has(region));
  function isAwsBlock(bag) {
    return bag.Type.includes("aws");
  }
  var databags = [
    ...newProviders.map((region) => cloudResourceRaw({
      name: "aws",
      kind: "provider",
      id: region,
      value: {
        alias: region,
        region
      }
    }))
  ];
  if (findInBlocks(container, isAwsBlock)) {
    databags.push(cloudResourceRaw({
      name: "aws",
      kind: "provider",
      id: "default"
    }));
  }
  exportDatabags(databags);
})();
