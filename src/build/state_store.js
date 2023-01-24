(() => {
  // barbe-sls-lib/consts.ts
  var STATE_STORE = "state_store";

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
      ArrayConst: arr.map((obj) => {
        if (typeof obj === "function") {
          const { block, labels } = obj();
          return {
            Type: "object_const",
            Meta: {
              IsBlock: true,
              BlockLabels: labels
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
    return [
      blockVal,
      compileNamePrefix(blockVal)
    ];
  }
  function compileNamePrefix(blockVal) {
    return concatStrArr(blockVal.name_prefix || asSyntax([]));
  }
  function compileBlockParam(blockVal, blockName) {
    return asVal(mergeTokens((blockVal[blockName] || asSyntax([])).ArrayConst || []));
  }
  function preConfCloudResourceFactory(blockVal, kind, preconf) {
    const cloudResourceId = blockVal.cloudresource_id ? asStr(blockVal.cloudresource_id) : void 0;
    const cloudResourceDir = blockVal.cloudresource_dir ? asStr(blockVal.cloudresource_dir) : void 0;
    return (type, name, value) => cloudResourceRaw({
      kind,
      dir: cloudResourceDir,
      id: cloudResourceId,
      type,
      name,
      value: {
        provider: blockVal.region ? asTraversal(`aws.${asStr(blockVal.region)}`) : void 0,
        ...preconf,
        ...value
      }
    });
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
  var __gcpTokenCached = "";
  function getGcpToken() {
    if (__gcpTokenCached) {
      return __gcpTokenCached;
    }
    const transformed = applyTransformers([{
      Name: "state_store_credentials",
      Type: "gcp_token_request",
      Value: {}
    }]);
    const token = transformed.gcp_token?.state_store_credentials[0]?.Value;
    if (!token) {
      throw new Error("gcp_token not found");
    }
    __gcpTokenCached = asStr(asVal(token).access_token);
    return __gcpTokenCached;
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
      throw new Error("aws_credentials not found");
    }
    const credsObj = asVal(creds);
    __awsCredsCached = {
      access_key_id: asStr(credsObj.access_key_id),
      secret_access_key: asStr(credsObj.secret_access_key),
      session_token: asStr(credsObj.session_token)
    };
    return __awsCredsCached;
  }

  // state_store.ts
  var container = readDatabagContainer();
  onlyRunForLifecycleSteps(["pre_generate", "generate", "post_generate"]);
  function stateStoreIterator(bag) {
    if (!bag.Value) {
      return [];
    }
    const [block, namePrefix] = applyDefaults(container, bag.Value);
    const cloudTerraform = preConfCloudResourceFactory(block, "terraform");
    const bucketNameTemplate = appendToTemplate(namePrefix, ["state-store"]);
    const bucketName = isSimpleTemplate(bucketNameTemplate) ? asStr(bucketNameTemplate) : void 0;
    const makeS3Store = () => {
      const dotS3 = compileBlockParam(block, "s3");
      if (!dotS3.existing_bucket && !bucketName) {
        return [];
      }
      const awsCreds = getAwsCreds();
      let localDatabags = [
        cloudTerraform("", "", {
          backend: asBlock([() => ({
            labels: ["s3"],
            block: {
              bucket: dotS3.existing_bucket || bucketName,
              key: appendToTemplate(
                dotS3.prefix || asSyntax(""),
                [dotS3.key || appendToTemplate(namePrefix, ["state.tfstate"])]
              ),
              region: dotS3.region || "us-east-1"
            }
          })])
        }),
        {
          Name: "s3",
          Type: "barbe_state_store",
          Value: {
            bucket: bucketName,
            key: appendToTemplate(
              dotS3.prefix || asSyntax(""),
              [dotS3.key || appendToTemplate(namePrefix, ["barbe_state.json"])]
            ),
            region: dotS3.region || "us-east-1"
          }
        }
      ];
      if (!dotS3.existing_bucket) {
        applyTransformers([{
          Type: "buildkit_run_in_container",
          Name: `s3_bucket_creator_${bucketName}`,
          Value: {
            display_name: `Creating state_store S3 bucket - ${bucketName}`,
            no_cache: true,
            dockerfile: `
                        FROM amazon/aws-cli:latest

                        ENV AWS_ACCESS_KEY_ID="${awsCreds.access_key_id}"
                        ENV AWS_SECRET_ACCESS_KEY="${awsCreds.secret_access_key}"
                        ENV AWS_SESSION_TOKEN="${awsCreds.session_token}"
                        ENV AWS_REGION="${os.getenv("AWS_REGION") || "us-east-1"}"
                        ENV AWS_PAGER=""

                        RUN aws s3api create-bucket --bucket ${bucketName} --output json || true
                    `
          }
        }]);
      }
      return localDatabags;
    };
    const makeGcsStore = () => {
      const dotGCS = compileBlockParam(block, "gcs");
      const gcpProject = dotGCS.project_id || block.project_id || os.getenv("CLOUDSDK_CORE_PROJECT");
      if (!dotGCS.existing_bucket && !bucketName) {
        return [];
      }
      if (!isSimpleTemplate(gcpProject)) {
        return [];
      }
      const gcpToken = getGcpToken();
      let localDatabags = [
        cloudTerraform("", "", {
          backend: asBlock([() => ({
            labels: ["gcs"],
            block: {
              bucket: dotGCS.existing_bucket || bucketName,
              prefix: appendToTemplate(
                dotGCS.prefix || asSyntax(""),
                [dotGCS.key || appendToTemplate(namePrefix, ["state.tfstate"])]
              )
            }
          })])
        }),
        {
          Name: "gcs",
          Type: "barbe_state_store",
          Value: {
            bucket: bucketName,
            key: appendToTemplate(
              dotGCS.prefix || asSyntax(""),
              [dotGCS.key || appendToTemplate(namePrefix, ["barbe_state.json"])]
            )
          }
        }
      ];
      if (!dotGCS.existing_bucket) {
        applyTransformers([{
          Type: "buildkit_run_in_container",
          Name: `gcs_bucket_creator_${bucketName}`,
          Value: {
            display_name: `Creating state_store GCS bucket - ${bucketName}`,
            no_cache: true,
            dockerfile: `
                        FROM google/cloud-sdk:slim

                        ENV CLOUDSDK_AUTH_ACCESS_TOKEN="${gcpToken}"
                        ENV CLOUDSDK_CORE_DISABLE_PROMPTS=1

                        RUN gcloud storage buckets create gs://${bucketName} --project ${asStr(gcpProject)} --quiet || true
                    `
          }
        }]);
      }
      return localDatabags;
    };
    let databags = [];
    if (block.s3) {
      databags.push(...makeS3Store());
    }
    if (block.gcs) {
      databags.push(...makeGcsStore());
    }
    return databags;
  }
  exportDatabags(iterateBlocks(container, STATE_STORE, stateStoreIterator).flat());
})();
