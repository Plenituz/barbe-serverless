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
  var IS_VERBOSE = os.getenv("BARBE_VERBOSE") === "1";
  function barbeLifecycleStep() {
    return os.getenv("BARBE_LIFECYCLE_STEP");
  }
  var allGenerateSteps = ["pre_generate", "generate", "post_generate"];
  var allApplySteps = ["pre_do", "pre_apply", "apply", "post_apply", "post_do"];

  // barbe-sls-lib/consts.ts
  var AWS_ECR_REPOSITORY_WITH_IMAGE = "aws_ecr_repository_with_image";
  var BARBE_SLS_VERSION = "v0.2.3";
  var TERRAFORM_EXECUTE_URL = `barbe-serverless/terraform_execute.js:${BARBE_SLS_VERSION}`;
  var AWS_NETWORK_URL = `barbe-serverless/aws_network.js:${BARBE_SLS_VERSION}`;

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

  // aws_ecr_repository_with_image.ts
  var container = readDatabagContainer();
  function awsEcsIterator(bag) {
    const [block, namePrefix] = applyDefaults(container, bag.Value);
    const cloudResource = preConfCloudResourceFactory(block, "resource");
    const cloudData = preConfCloudResourceFactory(block, "data");
    const cloudOutput = preConfCloudResourceFactory(block, "output");
    const traversalTransform = preConfTraversalTransform(bag);
    const awsRegion = asStr(block.region || os.getenv("AWS_REGION") || "us-east-1");
    const dotContainerImage = compileBlockParam(block, "container_image");
    const hasProvidedImage = !!(block.image || dotContainerImage.image);
    const shouldCopyProvidedImage = asVal(block.copy_image || dotContainerImage.copy_image || asSyntax(true));
    let pipe = pipeline([]);
    pipe.pushWithParams({ name: "resources", lifecycleSteps: allGenerateSteps }, () => {
      let imageUrl;
      let databags = [];
      databags.push(
        cloudResource("aws_ecr_repository", `aws_ecr_wi_${bag.Name}_ecr_repository`, {
          name: appendToTemplate(namePrefix, [bag.Name]),
          force_delete: true
        }),
        cloudOutput("", `aws_ecr_wi_${bag.Name}_ecr_repository`, {
          value: asTraversal(`aws_ecr_repository.aws_ecr_wi_${bag.Name}_ecr_repository.repository_url`)
        }),
        traversalTransform(`aws_ecr_repository_with_image_transforms`, {
          [`aws_ecr_repository_with_image.${bag.Name}`]: `aws_ecr_repository.aws_ecr_wi_${bag.Name}_ecr_repository`
        })
      );
      if (hasProvidedImage && !shouldCopyProvidedImage) {
      } else {
        const dontExpireImages = asVal(block.dont_expire_images || asSyntax(false));
        if (!dontExpireImages) {
          let policy;
          if (block.policy) {
            policy = block.policy;
          } else if (block.max_untagged_count) {
            policy = asFuncCall("jsonencode", [{
              rules: [{
                rulePriority: 1,
                description: "Expire untagged images",
                selection: {
                  tagStatus: "untagged",
                  countType: "imageCountMoreThan",
                  countNumber: block.max_untagged_count
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
                  countNumber: block.expire_untagged_after_days || 30
                },
                action: {
                  type: "expire"
                }
              }]
            }]);
          }
          databags.push(
            cloudResource("aws_ecr_lifecycle_policy", `aws_ecr_wi_${bag.Name}_ecr_policy`, {
              repository: asTraversal(`aws_ecr_repository.aws_ecr_wi_${bag.Name}_ecr_repository.name`),
              policy
            })
          );
        }
      }
      return { databags };
    });
    pipe.pushWithParams({ name: "deploy", lifecycleSteps: allApplySteps }, (input) => {
      if (!container.terraform_execute_output?.default_apply) {
        return {};
      }
      const tfOutput = asValArrayConst(container.terraform_execute_output?.default_apply[0].Value);
      const imageUrl = asStr(tfOutput.find((pair) => asStr(pair.key) === `aws_ecr_wi_${bag.Name}_ecr_repository`).value);
      if (hasProvidedImage && shouldCopyProvidedImage) {
        const providedImage = asStr(block.image || dotContainerImage.image);
        let loginCommand = "";
        if (!block.repository_url) {
          loginCommand = `RUN --mount=type=ssh,id=docker.sock,target=/var/run/docker.sock aws ecr get-login-password --region ${awsRegion} | docker login --username AWS --password-stdin ${imageUrl.split("/")[0]}`;
        }
        const awsCreds = getAwsCreds();
        if (!awsCreds) {
          throwStatement(`aws_ecr_repository_with_image.${bag.Name} needs AWS credentials to build the image`);
        }
        const transforms = [{
          Type: "buildkit_run_in_container",
          Name: `${bag.Name}_aws_ecr_wi_image_copy`,
          Value: {
            display_name: `Image copy - aws_ecr_repository_with_image.${bag.Name}`,
            no_cache: true,
            dockerfile: `
                    FROM amazon/aws-cli:latest
                        
                    # https://forums.docker.com/t/docker-ce-stable-x86-64-repo-not-available-https-error-404-not-found-https-download-docker-com-linux-centos-7server-x86-64-stable-repodata-repomd-xml/98965
                    RUN yum install -y yum-utils &&                         yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo &&                         sed -i 's/$releasever/7/g' /etc/yum.repos.d/docker-ce.repo &&                         yum install docker-ce-cli -y

                    ENV AWS_ACCESS_KEY_ID="${awsCreds.access_key_id}"
                    ENV AWS_SECRET_ACCESS_KEY="${awsCreds.secret_access_key}"
                    ENV AWS_SESSION_TOKEN="${awsCreds.session_token}"
                    ENV AWS_REGION="${asStr(block.region || os.getenv("AWS_REGION") || "us-east-1")}"
                    ENV AWS_PAGER=""

                    RUN --mount=type=ssh,id=docker.sock,target=/var/run/docker.sock docker pull ${providedImage}
                    RUN --mount=type=ssh,id=docker.sock,target=/var/run/docker.sock docker tag ${providedImage} ${imageUrl}
                    ${loginCommand}
                    RUN --mount=type=ssh,id=docker.sock,target=/var/run/docker.sock docker push ${imageUrl}`
          }
        }];
        return { transforms };
      }
      if (!hasProvidedImage) {
        const baseDir = asStr(dotContainerImage.build_from || ".");
        let dockerfileContent = asStr(block.dockerfile || dotContainerImage.dockerfile || throwStatement(`aws_ecr_repository_with_image.${bag.Name} needs a 'dockerfile' (path or file content) or 'image' property`));
        if (!dockerfileContent.includes("\n")) {
          const isFileResult = statFile(dockerfileContent);
          if (isSuccess(isFileResult)) {
            if (isFileResult.result.isDir) {
              throwStatement(`aws_ecr_repository_with_image.${bag.Name}.dockerfile path is a directory`);
            }
            dockerfileContent = os.file.readFile(dockerfileContent);
          }
        }
        const dotBuildArgs = compileBlockParam(dotContainerImage, "build_args");
        const buildArgsStr = Object.entries(dotBuildArgs).map(([name, value]) => `--build-arg ${name}="${asStr(value)}"`).join(" ");
        const preBuildCmd = asStr(dotContainerImage.pre_build_cmd || "") || "";
        const buildCmd = asStr(dotContainerImage.build_cmd || "") || `docker build -f __barbe_dockerfile -t ${bag.Name}ecrwibarbeimg ${buildArgsStr} .`;
        const tagCmd = asStr(dotContainerImage.tag_cmd || "") || `docker tag ${bag.Name}ecrwibarbeimg:latest ${imageUrl}:latest`;
        const loginCmd = asStr(dotContainerImage.login_cmd || "") || `aws ecr get-login-password --region ${awsRegion} | docker login --username AWS --password-stdin ${imageUrl.split("/")[0]}`;
        const pushCmd = asStr(dotContainerImage.push_cmd || "") || `docker push ${imageUrl}:latest`;
        const awsCreds = getAwsCreds();
        if (!awsCreds) {
          throwStatement(`aws_ecr_repository_with_image.${bag.Name} needs AWS credentials to build the image`);
        }
        const transforms = [{
          Type: "buildkit_run_in_container",
          Name: `${bag.Name}_aws_ecr_repository_with_image_image_build`,
          Value: {
            display_name: `Image build - aws_ecr_repository_with_image.${bag.Name}`,
            no_cache: true,
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
                    # this is in case people want to override the docker commands
                    ENV ECR_REPOSITORY="${imageUrl}"

                    COPY --from=src ./${baseDir} .
                    COPY --from=src __barbe_dockerfile __barbe_dockerfile
                    RUN --mount=type=ssh,id=docker.sock,target=/var/run/docker.sock ${preBuildCmd}
                    RUN --mount=type=ssh,id=docker.sock,target=/var/run/docker.sock ${buildCmd}
                    RUN --mount=type=ssh,id=docker.sock,target=/var/run/docker.sock ${tagCmd}

                    RUN --mount=type=ssh,id=docker.sock,target=/var/run/docker.sock ${loginCmd}
                    RUN --mount=type=ssh,id=docker.sock,target=/var/run/docker.sock ${pushCmd}
                `
          }
        }];
        return { transforms };
      }
    });
    return pipe;
  }
  executePipelineGroup(container, iterateBlocks(container, AWS_ECR_REPOSITORY_WITH_IMAGE, awsEcsIterator).flat());
})();
