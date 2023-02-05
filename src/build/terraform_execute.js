(() => {
  // barbe-sls-lib/consts.ts
  var TERRAFORM_EXECUTE = "terraform_execute";
  var TERRAFORM_EXECUTE_GET_OUTPUT = "terraform_execute_get_output";
  var TERRAFORM_EMPTY_EXECUTE = "terraform_empty_execute";
  var BARBE_SLS_VERSION = "v0.2.1";
  var TERRAFORM_EXECUTE_URL = `https://hub.barbe.app/barbe-serverless/terraform_execute/${BARBE_SLS_VERSION}/.js`;

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
  function barbeLifecycleStep() {
    return os.getenv("BARBE_LIFECYCLE_STEP");
  }
  function barbeOutputDir() {
    return os.getenv("BARBE_OUTPUT_DIR");
  }

  // barbe-sls-lib/lib.ts
  var __gcpTokenCached = "";
  function getGcpToken(optional) {
    if (__gcpTokenCached) {
      return __gcpTokenCached;
    }
    const transformed = applyTransformers([{
      Name: "state_store_credentials",
      Type: "gcp_token_request",
      Value: { optional }
    }]);
    const token = transformed.gcp_token?.state_store_credentials[0]?.Value;
    if (!token) {
      return void 0;
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

  // terraform_execute.ts
  var container = readDatabagContainer();
  var outputDir = barbeOutputDir();
  onlyRunForLifecycleSteps(["apply", "destroy"]);
  function removeBarbeOutputPrefix(path) {
    if (path.startsWith(outputDir)) {
      return path.slice(outputDir.length);
    }
    if (path.startsWith(`${outputDir}/`)) {
      return path.slice(outputDir.length + 1);
    }
    return path;
  }
  function terraformExecuteIterator(bag) {
    if (!bag.Value) {
      return [];
    }
    const block = asVal(bag.Value);
    const mode = asStr(block.mode || "apply");
    if (mode !== "apply" && mode !== "destroy") {
      throw new Error(`Invalid mode '${mode}' for terraform_execute block. Valid values are 'apply' and 'destroy'`);
    }
    const awsCreds = getAwsCreds();
    const gcpToken = getGcpToken(true);
    const dir = asStr(block.dir);
    let readBack = null;
    if (mode === "apply") {
      readBack = removeBarbeOutputPrefix(`${dir}/terraform_output_${bag.Name}.json`);
    }
    let vars = "";
    if (block.variable_values) {
      vars = asValArrayConst(block.variable_values).map((pair) => `-var="${asStr(pair.key)}=${asStr(pair.value)}"`).join(" ");
    }
    return [{
      Type: "buildkit_run_in_container",
      Name: `terraform_${mode}_${bag.Name}`,
      Value: {
        require_confirmation: block.require_confirmation || null,
        display_name: block.display_name || null,
        message: block.message || null,
        no_cache: true,
        excludes: [
          ".terraform",
          ".terraform.lock.hcl"
        ],
        dockerfile: `
                FROM hashicorp/terraform:latest
                RUN apk add jq

                COPY --from=src ./${dir} /src
                WORKDIR /src

                ENV GOOGLE_OAUTH_ACCESS_TOKEN="${gcpToken}"

                ENV AWS_ACCESS_KEY_ID="${awsCreds?.access_key_id}"
                ENV AWS_SECRET_ACCESS_KEY="${awsCreds?.secret_access_key}"
                ENV AWS_SESSION_TOKEN="${awsCreds?.session_token}"
                ENV AWS_REGION="${os.getenv("AWS_REGION") || "us-east-1"}"

                RUN terraform init -input=false
                RUN terraform ${mode} -auto-approve -input=false ${vars}
                RUN terraform output -json > terraform_output.json
                RUN cat terraform_output.json | jq 'to_entries | map({ "key": .key, "value": .value.value }) | { "terraform_execute_output": { "${bag.Name}": . } }' > terraform_output_${bag.Name}.json

                RUN touch tmp
                RUN touch terraform.tfstate
                RUN touch .terraform.lock.hcl
                RUN touch .terraform`,
        read_back: readBack,
        exported_files: mode === "destroy" ? "tmp" : {
          "terraform.tfstate": removeBarbeOutputPrefix(`${dir}/terraform.tfstate`),
          [`terraform_output_${bag.Name}.json`]: removeBarbeOutputPrefix(`${dir}/terraform_output_${bag.Name}.json`)
        }
      }
    }];
  }
  function terraformEmptyExecuteIterator(bag) {
    if (!bag.Value) {
      return [];
    }
    const block = asVal(bag.Value);
    const mode = asStr(block.mode || "apply");
    if (mode !== "apply" && mode !== "destroy") {
      throw new Error(`Invalid mode '${mode}' for terraform_execute block. Valid values are 'apply' and 'destroy'`);
    }
    const awsCreds = getAwsCreds();
    const gcpToken = getGcpToken(true);
    const dir = asStr(block.dir);
    let vars = "";
    if (block.variable_values) {
      vars = asValArrayConst(block.variable_values).map((pair) => `-var="${asStr(pair.key)}=${asStr(pair.value)}"`).join(" ");
    }
    return [{
      Type: "buildkit_run_in_container",
      Name: `terraform_empty_${mode}_${bag.Name}`,
      Value: {
        require_confirmation: block.require_confirmation || null,
        display_name: block.display_name || null,
        message: block.message || null,
        no_cache: true,
        input_files: {
          "tf_output.json": JSON.stringify({
            terraform_empty_execute_output: {
              [bag.Name]: true
            }
          }),
          "template.tf.json": asStr(block.template_json)
        },
        dockerfile: `
                FROM hashicorp/terraform:latest

                ENV GOOGLE_OAUTH_ACCESS_TOKEN="${gcpToken}"

                ENV AWS_ACCESS_KEY_ID="${awsCreds?.access_key_id}"
                ENV AWS_SECRET_ACCESS_KEY="${awsCreds?.secret_access_key}"
                ENV AWS_SESSION_TOKEN="${awsCreds?.session_token}"
                ENV AWS_REGION="${os.getenv("AWS_REGION") || "us-east-1"}"

                COPY --from=src template.tf.json template.tf.json
                RUN terraform init -input=false
                RUN terraform ${mode} -auto-approve -input=false ${vars}

                COPY --from=src tf_output.json tf_output.json`,
        read_back: [
          `tf_empty_output_${bag.Name}.json`
        ],
        exported_files: {
          "tf_output.json": `tf_empty_output_${bag.Name}.json`
        }
      }
    }];
  }
  function terraformExecuteGetOutputIterator(bag) {
    if (!bag.Value) {
      return [];
    }
    const block = asVal(bag.Value);
    const awsCreds = getAwsCreds();
    const gcpToken = getGcpToken(true);
    const dir = asStr(block.dir);
    let vars = "";
    if (block.variable_values) {
      vars = asValArrayConst(block.variable_values).map((pair) => `-var="${asStr(pair.key)}=${asStr(pair.value)}"`).join(" ");
    }
    return [{
      Type: "buildkit_run_in_container",
      Name: `terraform_get_output_${bag.Name}`,
      Value: {
        display_name: block.display_name || null,
        message: block.message || null,
        no_cache: true,
        dockerfile: `
                FROM hashicorp/terraform:latest
                RUN apk add jq

                COPY --from=src ./${dir} /src
                WORKDIR /src

                ENV GOOGLE_OAUTH_ACCESS_TOKEN="${gcpToken}"

                ENV AWS_ACCESS_KEY_ID="${awsCreds?.access_key_id}"
                ENV AWS_SECRET_ACCESS_KEY="${awsCreds?.secret_access_key}"
                ENV AWS_SESSION_TOKEN="${awsCreds?.session_token}"
                ENV AWS_REGION="${os.getenv("AWS_REGION") || "us-east-1"}"

                RUN terraform init -input=false
                RUN terraform output -json > terraform_output.json
                RUN cat terraform_output.json | jq 'to_entries | map({ "key": .key, "value": .value.value }) | { "terraform_execute_output": { "${bag.Name}": . } }' > terraform_output_${bag.Name}.json
                RUN touch terraform_output_${bag.Name}.json`,
        read_back: [
          removeBarbeOutputPrefix(`${dir}/terraform_output_${bag.Name}.json`)
        ],
        exported_files: {
          [`terraform_output_${bag.Name}.json`]: removeBarbeOutputPrefix(`${dir}/terraform_output_${bag.Name}.json`)
        }
      }
    }];
  }
  exportDatabags(applyTransformers([
    ...iterateBlocks(container, TERRAFORM_EXECUTE, terraformExecuteIterator).flat(),
    ...iterateBlocks(container, TERRAFORM_EXECUTE_GET_OUTPUT, terraformExecuteGetOutputIterator).flat(),
    ...iterateBlocks(container, TERRAFORM_EMPTY_EXECUTE, terraformEmptyExecuteIterator).flat()
  ]));
})();
