(() => {
  // barbe-sls-lib/consts.ts
  var AWS_S3 = "aws_s3";
  var AWS_FUNCTION = "aws_function";
  var AWS_DYNAMODB = "aws_dynamodb";
  var AWS_KINESIS_STREAM = "aws_kinesis_stream";
  var AWS_IAM_LAMBDA_ROLE = "aws_iam_lambda_role";
  var AWS_FARGATE_TASK = "aws_fargate_task";
  var AWS_FARGATE_SERVICE = "aws_fargate_service";
  var BARBE_SLS_VERSION = "v0.2.2";
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

  // aws_iam.ts
  var container = readDatabagContainer();
  onlyRunForLifecycleSteps(["pre_generate", "generate", "post_generate"]);
  function lambdaRoleStatement(label, namePrefix, assumableBy) {
    let statements = [];
    if (AWS_FUNCTION in container || assumableBy.includes("lambda.amazonaws.com") || assumableBy.includes("edgelambda.amazonaws.com")) {
      if (assumableBy.includes("edgelambda.amazonaws.com")) {
        statements.push(
          {
            Action: [
              "logs:CreateLogGroup",
              "logs:CreateLogStream"
            ],
            Effect: "Allow",
            Resource: asTemplate([
              "arn:",
              asTraversal("data.aws_partition.current.partition"),
              ":logs:*:",
              asTraversal("data.aws_caller_identity.current.account_id"),
              ":log-group:/aws/lambda/",
              ...(() => {
                if (!namePrefix.Parts || namePrefix.Parts.length === 0) {
                  return ["*:*"];
                }
                return [
                  "*.",
                  ...namePrefix.Parts,
                  "*:*"
                ];
              })()
            ])
          },
          {
            Action: "logs:PutLogEvents",
            Effect: "Allow",
            Resource: asTemplate([
              "arn:",
              asTraversal("data.aws_partition.current.partition"),
              ":logs:*:",
              asTraversal("data.aws_caller_identity.current.account_id"),
              ":log-group:/aws/lambda/",
              ...(() => {
                if (!namePrefix.Parts || namePrefix.Parts.length === 0) {
                  return ["*:*:*"];
                }
                return [
                  "*.",
                  ...namePrefix.Parts,
                  "*:*:*"
                ];
              })()
            ])
          }
        );
      }
      statements.push(
        {
          Action: [
            "logs:CreateLogGroup",
            "logs:CreateLogStream"
          ],
          Effect: "Allow",
          Resource: asTemplate([
            "arn:",
            asTraversal("data.aws_partition.current.partition"),
            ":logs:*:",
            asTraversal("data.aws_caller_identity.current.account_id"),
            ":log-group:/aws/lambda/",
            ...(() => {
              if (!namePrefix.Parts || namePrefix.Parts.length === 0) {
                return ["*:*"];
              }
              return [
                ...namePrefix.Parts,
                "*:*"
              ];
            })()
          ])
        },
        {
          Action: "logs:PutLogEvents",
          Effect: "Allow",
          Resource: asTemplate([
            "arn:",
            asTraversal("data.aws_partition.current.partition"),
            ":logs:*:",
            asTraversal("data.aws_caller_identity.current.account_id"),
            ":log-group:/aws/lambda/",
            ...(() => {
              if (!namePrefix.Parts || namePrefix.Parts.length === 0) {
                return ["*:*:*"];
              }
              return [
                ...namePrefix.Parts,
                "*:*:*"
              ];
            })()
          ])
        }
      );
    }
    if (AWS_DYNAMODB in container) {
      statements.push({
        Action: "dynamodb:*",
        Effect: "Allow",
        Resource: Object.keys(container[AWS_DYNAMODB]).map((dynamodbName) => asTemplate([
          "arn:",
          asTraversal("data.aws_partition.current.partition"),
          ":dynamodb:*:",
          asTraversal("data.aws_caller_identity.current.account_id"),
          ":table/",
          asTraversal(`aws_dynamodb_table.${dynamodbName}_aws_dynamodb.name`),
          "*"
        ]))
      });
    }
    if (AWS_KINESIS_STREAM in container) {
      statements.push({
        Action: "kinesis:*",
        Effect: "Allow",
        Resource: Object.keys(container[AWS_KINESIS_STREAM]).map((kinesisName) => asTraversal(`aws_kinesis_stream.${kinesisName}_aws_kinesis_stream.arn`))
      });
    }
    if (AWS_S3 in container) {
      statements.push({
        Action: "s3:*",
        Effect: "Allow",
        Resource: Object.keys(container[AWS_S3]).flatMap((s3Name) => [
          asTraversal(`aws_s3_bucket.${s3Name}_s3.arn`),
          asTemplate([
            asTraversal(`aws_s3_bucket.${s3Name}_s3.arn`),
            "*"
          ])
        ])
      });
    }
    if (AWS_FARGATE_SERVICE in container) {
      statements.push(
        {
          Action: "ecr:*",
          Effect: "Allow",
          Resource: asTemplate([
            // arn:aws:ecr:us-east-1:304449630673:repository/universe-ams-ingest-image-repo
            "arn:",
            asTraversal("data.aws_partition.current.partition"),
            ":ecr:*:",
            asTraversal("data.aws_caller_identity.current.account_id"),
            ":repository/",
            namePrefix,
            "*"
          ])
        },
        {
          Action: "ecr:GetAuthorizationToken",
          Effect: "Allow",
          Resource: "*"
        },
        {
          Action: "logs:PutLogEvents",
          Effect: "Allow",
          Resource: asTemplate([
            "arn:",
            asTraversal("data.aws_partition.current.partition"),
            ":logs:*:",
            asTraversal("data.aws_caller_identity.current.account_id"),
            ":log-group:/ecs/",
            ...(() => {
              if (!namePrefix.Parts || namePrefix.Parts.length === 0) {
                return ["*:*:*"];
              }
              return [
                ...namePrefix.Parts,
                "*:*:*"
              ];
            })()
          ])
        }
      );
    }
    if (AWS_FARGATE_TASK in container) {
      statements.push(
        {
          Action: "ecs:RunTask",
          Effect: "Allow",
          Resource: Object.keys(container[AWS_FARGATE_TASK]).map((fargateName) => asTemplate([
            "arn:",
            asTraversal("data.aws_partition.current.partition"),
            ":ecs:*:",
            asTraversal("data.aws_caller_identity.current.account_id"),
            ":task-definition/",
            appendToTemplate(namePrefix, [fargateName]),
            "*"
          ]))
        },
        {
          Action: "iam:PassRole",
          Effect: "Allow",
          //TODO this will cause duplicate entries if 2 tasks are defined and they both have the same
          //execution role (which is the case most of the time since we use the account's default by default)
          //this doesnt prevent the template from working but it will cause duplicate entries in the policy
          Resource: [
            ...Object.keys(container[AWS_FARGATE_TASK]).map((fargateName) => asTraversal(`local.__aws_fargate_task_${fargateName}_task_execution_role_arn`)),
            asTemplate([
              "arn:",
              asTraversal("data.aws_partition.current.partition"),
              ":iam::",
              asTraversal("data.aws_caller_identity.current.account_id"),
              ":role/",
              namePrefix,
              "*"
            ])
          ]
        }
      );
    }
    if (AWS_IAM_LAMBDA_ROLE in container && label in container[AWS_IAM_LAMBDA_ROLE]) {
      const val = asVal(container[AWS_IAM_LAMBDA_ROLE][label][0].Value);
      if (val.statements) {
        statements.push(...asVal(val.statements));
      }
    }
    return statements;
  }
  function defineRole(params) {
    const { cloudResourceFactory, label, namePrefix, assumableBy } = params;
    const cloudResource = cloudResourceFactory("resource");
    const cloudData = cloudResourceFactory("data");
    let principalService = [];
    if (assumableBy) {
      principalService.push(...asValArrayConst(assumableBy).map(asStr));
    }
    if (AWS_FUNCTION in container) {
      principalService.push("lambda.amazonaws.com");
    }
    if (AWS_FARGATE_TASK in container) {
      principalService.push("ecs-tasks.amazonaws.com");
    }
    if (AWS_FARGATE_SERVICE in container) {
      principalService.push("ecs-tasks.amazonaws.com");
    }
    if (principalService.length === 0) {
      principalService.push("lambda.amazonaws.com");
    }
    return [
      {
        Type: "traversal_transform",
        Name: `${label}_iam_traversal_transform`,
        Value: {
          [`aws_iam_lambda_role.${label}`]: `aws_iam_role.${label}_lambda_role`
        }
      },
      //these are duplicated if aws_base is included, but useful if the component is imported standalone
      cloudData("aws_caller_identity", "current", {}),
      cloudData("aws_partition", "current", {}),
      cloudResource("aws_iam_role", `${label}_lambda_role`, {
        name: appendToTemplate(namePrefix, [`${label}-role`]),
        assume_role_policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Action: "sts:AssumeRole",
              Effect: "Allow",
              Sid: "",
              Principal: {
                Service: principalService
              }
            }
          ]
        })
      }),
      cloudResource("aws_iam_policy", `${label}_lambda_role_policy`, {
        name: appendToTemplate(namePrefix, [`${label}-role-policy`]),
        description: "",
        policy: asFuncCall("jsonencode", [{
          Version: "2012-10-17",
          Statement: lambdaRoleStatement(label, namePrefix, principalService)
        }])
      }),
      cloudResource("aws_iam_role_policy_attachment", `${label}_lambda_role_policy_attachment`, {
        role: asTraversal(`aws_iam_role.${label}_lambda_role.name`),
        policy_arn: asTraversal(`aws_iam_policy.${label}_lambda_role_policy.arn`)
      })
    ];
  }
  function awsIamLambdaRoleIterator(bag) {
    if (!bag.Value) {
      return [];
    }
    if (!bag.Name || bag.Name.length === 0) {
      return [];
    }
    const [block, namePrefix] = applyDefaults(container, bag.Value);
    const cloudResourceFactory = (kind) => preConfCloudResourceFactory(block, kind);
    return defineRole({
      cloudResourceFactory,
      label: bag.Name,
      namePrefix,
      assumableBy: block.assumable_by
    });
  }
  var globalNamePrefix = compileNamePrefix(container, null);
  var allDirectories = [
    ...iterateBlocks(container, AWS_FUNCTION, (bag) => {
      const [block, _] = applyDefaults(container, bag.Value);
      return block.cloudresource_dir || ".";
    }),
    ...iterateBlocks(container, AWS_FARGATE_TASK, (bag) => {
      const [block, _] = applyDefaults(container, bag.Value);
      return block.cloudresource_dir || ".";
    }),
    ...iterateBlocks(container, AWS_FARGATE_SERVICE, (bag) => {
      const [block, _] = applyDefaults(container, bag.Value);
      return block.cloudresource_dir || ".";
    })
  ].filter((dir) => dir);
  allDirectories = uniq(allDirectories, asStr);
  var defaultRoles = allDirectories.map((dir) => {
    const dirStr = asStr(dir);
    const cloudResourceFactory = (kind) => (type, name, value) => cloudResourceRaw({
      kind,
      dir: dirStr === "." ? void 0 : dirStr,
      type,
      name,
      value
    });
    return defineRole({
      cloudResourceFactory,
      label: "default",
      namePrefix: dirStr === "." ? globalNamePrefix : appendToTemplate(globalNamePrefix, [`${dirStr}-`])
    });
  }).flat();
  exportDatabags([
    ...defaultRoles,
    ...iterateBlocks(container, AWS_IAM_LAMBDA_ROLE, awsIamLambdaRoleIterator).flat()
  ]);
})();
