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
  function lookupTraverse(rootInput, traverse, errorPrefix) {
    let root;
    if (rootInput.Meta?.IsBlock && rootInput.ArrayConst?.length === 1) {
      root = rootInput.ArrayConst[0];
    } else {
      root = rootInput;
    }
    switch (traverse.Type) {
      default:
        throw new Error(`${errorPrefix}: invalid traversal type '${traverse.Type}'`);
      case "attr":
        const rootObj = asVal(root);
        if (typeof rootObj !== "object") {
          throw new Error(`cannot find attribute '${traverse.Name}' on non-object (${root.Type}) '${errorPrefix}'`);
        }
        if (!(traverse.Name in rootObj)) {
          throw new Error(`cannot find attribute '${traverse.Name}' on object '${errorPrefix}'`);
        }
        return rootObj[traverse.Name];
      case "index":
        if (typeof traverse.Index === "string") {
          return lookupTraverse(root, { Type: "attr", Name: traverse.Index }, errorPrefix);
        }
        const rootArr = asVal(root);
        if (!Array.isArray(rootArr)) {
          throw new Error(`cannot find index '${traverse.Index}' on non-array '${errorPrefix}'`);
        }
        if (rootArr.length <= traverse.Index || traverse.Index < 0) {
          throw new Error(`index '${traverse.Index}' is out of bounds on '${errorPrefix}'`);
        }
        return rootArr[traverse.Index];
    }
  }
  function lookupTraversal(root, traverseArr, errorPrefix) {
    if (traverseArr.length === 0) {
      return root;
    }
    if (traverseArr.length === 1) {
      return lookupTraverse(root, traverseArr[0], errorPrefix);
    }
    const debugStr = asStr({ Type: "scope_traversal", Traversal: [traverseArr[0]] });
    return lookupTraversal(
      lookupTraverse(root, traverseArr[0], errorPrefix),
      traverseArr.slice(1),
      errorPrefix + (debugStr.startsWith("[") ? "" : ".") + debugStr
    );
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
  function applyMixins(str, mixins) {
    for (const mixinName in mixins) {
      str = str.replace(new RegExp(`{{${mixinName}}}`, "g"), mixins[mixinName]);
    }
    return str;
  }

  // cloudformation_reader/format_output.py
  var format_output_default = "import json\n\nwith open('cloudformation_output.json', 'r') as f:\n    data = json.load(f)\n\nformattedObj = {}\nfor i in data['Stacks'][0]['Outputs']:\n    formattedObj[i['OutputKey']] = i['OutputValue']\n\nformattedObj = {\n    'cloudformation_output_getter_result': {\n        '{{stackName}}': formattedObj\n    }\n}\nwith open('cloudformation_output.json', 'w') as f:\n    json.dump(formattedObj, f)";

  // cloudformation_reader/format_template.py
  var format_template_default = "import json\n\nwith open('cloudformation_resources.json', 'r') as f:\n    data = json.load(f)\n\nformattedObj = {\n    'cloudformation_resources_getter_result': {\n        '{{stackName}}': data['TemplateBody']['Resources']\n    }\n}\nwith open('cloudformation_resources.json', 'w') as f:\n    json.dump(formattedObj, f)";

  // cloudformation_reader/cloudformation_reader.ts
  var container = readDatabagContainer();
  onlyRunForLifecycleSteps(["pre_generate", "generate", "post_generate"]);
  function isCfOutputToken(token) {
    return token.Type === "relative_traversal" && !!token.Traversal && token.Traversal.length > 0 && token.Traversal[0].Name === "output" && token.Source?.Type === "function_call";
  }
  function isCfTemplateToken(token) {
    return token.Type === "relative_traversal" && !!token.Traversal && token.Traversal.length > 0 && token.Traversal[0].Name === "resources" && token.Source?.Type === "function_call";
  }
  function extractStackName(token) {
    const argLen = (token.Source?.FunctionArgs || []).length;
    if (argLen === 0) {
      throw new Error("cloudformation() requires 1 argument: the name of the cloudformation stack");
    }
    if (argLen > 1) {
      throw new Error("cloudformation() used with more than 1 argument");
    }
    return asStr(token.Source.FunctionArgs[0]);
  }
  var allCfOutputTokens = iterateAllBlocks(container, (bag) => {
    if (!bag.Value) {
      return [];
    }
    return accumulateTokens(bag.Value, isCfOutputToken);
  }).flat();
  var allCfTemplateTokens = iterateAllBlocks(container, (bag) => {
    if (!bag.Value) {
      return [];
    }
    return accumulateTokens(bag.Value, isCfTemplateToken);
  }).flat();
  var allCfOutputStackNames = Array.from(new Set(allCfOutputTokens.map(extractStackName)));
  var allCfTemplateStackNames = Array.from(new Set(allCfTemplateTokens.map(extractStackName)));
  if (allCfOutputStackNames.length === 0 && allCfTemplateStackNames.length === 0) {
    quit();
  }
  var awsCreds = getAwsCreds();
  if (!awsCreds) {
    quit();
  }
  var toExecute = [
    ...allCfOutputStackNames.map((stackName) => ({
      Type: "buildkit_run_in_container",
      Name: `cloudformation_output_getter_${stackName}`,
      Value: {
        input_files: {
          "formatter.py": applyMixins(format_output_default, { stackName })
        },
        dockerfile: `
                FROM amazon/aws-cli:latest

                ENV AWS_ACCESS_KEY_ID="${awsCreds.access_key_id}"
                ENV AWS_SECRET_ACCESS_KEY="${awsCreds.secret_access_key}"
                ENV AWS_SESSION_TOKEN="${awsCreds.session_token}"
                ENV AWS_REGION="${os.getenv("AWS_REGION") || "us-east-1"}"
                ENV AWS_PAGER=""

                RUN aws cloudformation describe-stacks --stack-name ${stackName} --output json > cloudformation_output.json
                COPY --from=src formatter.py formatter.py
                RUN python formatter.py`,
        display_name: `Reading Cloudformation output - ${stackName}`,
        no_cache: true,
        exported_files: {
          "cloudformation_output.json": `cloudformation_output_${stackName}.json`
        },
        read_back: [
          `cloudformation_output_${stackName}.json`
        ]
      }
    })),
    ...allCfTemplateStackNames.map((stackName) => ({
      Type: "buildkit_run_in_container",
      Name: `cloudformation_output_getter_${stackName}`,
      Value: {
        input_files: {
          "formatter.py": applyMixins(format_template_default, { stackName })
        },
        dockerfile: `
                FROM amazon/aws-cli:latest

                ENV AWS_ACCESS_KEY_ID="${awsCreds.access_key_id}"
                ENV AWS_SECRET_ACCESS_KEY="${awsCreds.secret_access_key}"
                ENV AWS_SESSION_TOKEN="${awsCreds.session_token}"
                ENV AWS_REGION="${os.getenv("AWS_REGION") || "us-east-1"}"
                ENV AWS_PAGER=""

                RUN aws cloudformation get-template --stack-name ${stackName} --output json > cloudformation_resources.json
                COPY --from=src formatter.py formatter.py
                RUN python formatter.py`,
        display_name: `Reading Cloudformation template - ${stackName}`,
        no_cache: true,
        exported_files: {
          "cloudformation_resources.json": `cloudformation_resources_${stackName}.json`
        },
        read_back: [
          `cloudformation_resources_${stackName}.json`
        ]
      }
    }))
  ];
  var result = applyTransformers(toExecute);
  var databags = [];
  if (result.cloudformation_resources_getter_result) {
    databags.push(
      ...allCfTemplateTokens.map((token) => {
        const stackName = extractStackName(token);
        if (!(stackName in result.cloudformation_resources_getter_result)) {
          throw new Error(`Could not find cloudformation resources for stack ${stackName}`);
        }
        const root = result.cloudformation_resources_getter_result[stackName][0].Value;
        if (!root) {
          throw new Error(`Could not find cloudformation resources for stack ${stackName}`);
        }
        return [{
          Type: "token_map",
          Name: `cloudformation_resources_${stackName}_token_map`,
          Value: [{
            match: token,
            replace_by: lookupTraversal(root, token.Traversal.slice(1), `cloudformation("${stackName}").resources`)
          }]
        }];
      }).flat()
    );
  }
  if (result.cloudformation_output_getter_result) {
    databags.push(
      ...allCfOutputTokens.map((token) => {
        const stackName = extractStackName(token);
        if (!(stackName in result.cloudformation_output_getter_result)) {
          throw new Error(`Could not find cloudformation output for stack ${stackName}`);
        }
        const root = result.cloudformation_output_getter_result[stackName][0].Value;
        if (!root) {
          throw new Error(`Could not find cloudformation resources for stack ${stackName}`);
        }
        return [{
          Type: "token_map",
          Name: `cloudformation_output_${stackName}_token_map`,
          Value: [{
            match: token,
            replace_by: lookupTraversal(root, token.Traversal.slice(1), `cloudformation("${stackName}").output`)
          }]
        }];
      }).flat()
    );
  }
  exportDatabags(databags);
})();
