(() => {
  // barbe-sls-lib/consts.ts
  var AWS_S3 = "aws_s3";
  var AWS_DYNAMODB = "aws_dynamodb";
  var AWS_FARGATE_SERVICE = "aws_fargate_service";
  var AWS_NETWORK = "aws_network";
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
  function asBinaryOp(left, op, right) {
    return {
      Type: "binary_op",
      LeftHandSide: asSyntax(left),
      Operator: op,
      RightHandSide: asSyntax(right)
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

  // aws_network.ts
  var container = readDatabagContainer();
  onlyRunForLifecycleSteps(["pre_generate", "generate", "post_generate"]);
  function awsNetworkIterator(bag) {
    if (!bag.Value) {
      return [];
    }
    const [block, namePrefix] = applyDefaults(container, bag.Value);
    const cloudResource = preConfCloudResourceFactory(block, "resource");
    const cloudData = preConfCloudResourceFactory(block, "data");
    const traversalTransform = preConfTraversalTransform(bag);
    const avZoneDataName = asStr(block.region || "current");
    const regionDataName = asStr(block.region || "current");
    const makeNatGateway = asVal(block.make_nat_gateway || asSyntax(false));
    const oneNatPerAZ = asVal(block.one_nat_per_az || asSyntax(false));
    const useDefaultVpc = asVal(block.use_default_vpc || asSyntax(false));
    const publicSubnetCidrOffset = asVal(block.public_subnets_cidr_offset || asSyntax(0));
    const privateSubnetCidrOffset = asVal(block.private_subnets_cidr_offset || asSyntax(100));
    let databags = [];
    let vpcRef;
    if (useDefaultVpc) {
      vpcRef = asTraversal("data.aws_vpc.default.id");
      databags.push(
        cloudData("aws_vpc", "default", {
          default: true
        })
      );
    } else if (block.vpc_id) {
      vpcRef = asTraversal(`data.aws_vpc.aws_network_${bag.Name}_imported_vpc`);
      databags.push(
        cloudData("aws_vpc", `aws_network_${bag.Name}_imported_vpc`, {
          id: block.vpc_id
        })
      );
    } else {
      vpcRef = asTraversal(`aws_vpc.aws_network_${bag.Name}_vpc`);
      databags.push(
        cloudResource("aws_vpc", `aws_network_${bag.Name}_vpc`, {
          tags: {
            Name: appendToTemplate(namePrefix, [`${bag.Name}-vpc`])
          },
          cidr_block: block.cidr_block || "10.0.0.0/16",
          enable_dns_hostnames: block.enable_dns_hostnames || true,
          enable_dns_support: block.enable_dns_support
        })
      );
    }
    if (!block.subnet_ids && block.enable_vpc_endpoints && asVal(block.enable_vpc_endpoints)) {
      let vpcEndpoints = asVal(block.vpc_endpoints || asSyntax([]));
      if (container[AWS_DYNAMODB]) {
        vpcEndpoints.push("dynamodb");
      }
      if (container[AWS_S3]) {
        vpcEndpoints.push("s3");
      }
      if (container[AWS_FARGATE_SERVICE] || container[AWS_FARGATE_SERVICE]) {
        vpcEndpoints.push("ecr.api", "ecr.dkr", "ecs", "s3", "logs", "secretsmanager");
      }
      vpcEndpoints = uniq(vpcEndpoints, asStr);
      databags.push(
        //this is needed for the members of the subnet to access the AWS services (thru https)
        cloudResource("aws_security_group", `${bag.Name}_vpc_endpoint_secgr`, {
          name: appendToTemplate(namePrefix, [`${bag.Name}-vpc-endpoint`]),
          vpc_id: appendToTraversal(vpcRef, "id"),
          ingress: asBlock([{
            from_port: 443,
            to_port: 443,
            protocol: "tcp",
            cidr_blocks: ["0.0.0.0/0"]
          }])
        })
      );
      for (const endpoint of vpcEndpoints) {
        const endpointStr = asStr(endpoint);
        let endpointType = "Interface";
        if (endpointStr === "dynamodb" || endpointStr === "s3") {
          endpointType = "Gateway";
        }
        let serviceName = asTemplate([
          "com.amazonaws.",
          asTraversal(`data.aws_region.${regionDataName}.name`),
          ".",
          endpoint
        ]);
        if (endpointStr === "notebook" || endpointStr === "studio") {
          serviceName = asTemplate([
            "aws.sagemaker.",
            asTraversal(`data.aws_region.${regionDataName}.name`),
            ".",
            endpoint
          ]);
        }
        databags.push(
          cloudResource("aws_vpc_endpoint", `${bag.Name}_${endpointStr.replace(/\./, "-")}_vpc_endpoint`, {
            vpc_id: appendToTraversal(vpcRef, "id"),
            service_name: serviceName,
            vpc_endpoint_type: endpointType,
            private_dns_enabled: endpointType === "Interface",
            route_table_ids: endpointType === "Gateway" ? [
              asTraversal(`aws_route_table.aws_network_${bag.Name}_private_subnets_route_table.id`)
            ] : null,
            security_group_ids: endpointType === "Interface" ? [
              asTraversal(`aws_security_group.${bag.Name}_vpc_endpoint_secgr.id`)
            ] : null,
            subnet_ids: endpointType === "Interface" ? asFuncCall("concat", [
              asTraversal(`aws_subnet.aws_network_${bag.Name}_private_subnets.*.id`)
            ]) : null
          })
        );
      }
    }
    if (makeNatGateway) {
      if (oneNatPerAZ) {
        databags.push(
          cloudResource("aws_eip", `aws_network_${bag.Name}_nat_gateway_eips`, {
            count: asFuncCall("length", [asTraversal(`data.aws_availability_zones.${avZoneDataName}.names`)]),
            vpc: true,
            tags: {
              Name: appendToTemplate(namePrefix, [`${bag.Name}-nat-gateway-eip-`, asTraversal("count.index")])
            }
          }),
          cloudResource("aws_nat_gateway", `aws_network_${bag.Name}_nat_gateways`, {
            count: asFuncCall("length", [asTraversal(`data.aws_availability_zones.${avZoneDataName}.names`)]),
            allocation_id: asTraversal(`aws_eip.aws_network_${bag.Name}_nat_gateway_eips[count.index].id`),
            subnet_id: asTraversal(`aws_subnet.aws_network_${bag.Name}_public_subnets[count.index].id`),
            tags: {
              Name: appendToTemplate(namePrefix, [`${bag.Name}-nat-gateway-`, asTraversal("count.index")])
            }
          }),
          cloudResource("aws_route", `aws_network_${bag.Name}_nat_gateway_routes`, {
            count: asFuncCall("length", [asTraversal(`data.aws_availability_zones.${avZoneDataName}.names`)]),
            route_table_id: asTraversal(`aws_route_table.aws_network_${bag.Name}_private_subnets_route_table.id`),
            destination_cidr_block: "0.0.0.0/0",
            nat_gateway_id: asTraversal(`aws_nat_gateway.aws_network_${bag.Name}_nat_gateways[count.index].id`)
          })
        );
      } else {
        databags.push(
          cloudResource("aws_eip", `aws_network_${bag.Name}_nat_gateway_eip`, {
            vpc: true,
            tags: {
              Name: appendToTemplate(namePrefix, [`${bag.Name}-nat-gateway-eip`])
            }
          }),
          cloudResource("aws_nat_gateway", `aws_network_${bag.Name}_nat_gateway`, {
            allocation_id: asTraversal(`aws_eip.aws_network_${bag.Name}_nat_gateway_eip.id`),
            subnet_id: asTraversal(`aws_subnet.aws_network_${bag.Name}_public_subnets[0].id`),
            tags: {
              Name: appendToTemplate(namePrefix, [`${bag.Name}-nat-gateway`])
            }
          }),
          cloudResource("aws_route", `aws_network_${bag.Name}_nat_gateway_route`, {
            route_table_id: asTraversal(`aws_route_table.aws_network_${bag.Name}_private_subnets_route_table.id`),
            destination_cidr_block: "0.0.0.0/0",
            nat_gateway_id: asTraversal(`aws_nat_gateway.aws_network_${bag.Name}_nat_gateway.id`)
          })
        );
      }
    }
    databags.push(
      traversalTransform("aws_network_${bag.Name}_traversal_transforms", {
        [`aws_network.${bag.Name}.vpc`]: asStr(vpcRef),
        [`aws_network.${bag.Name}.public_subnets`]: `aws_subnet.aws_network_${bag.Name}_public_subnets`,
        [`aws_network.${bag.Name}.private_subnets`]: `aws_subnet.aws_network_${bag.Name}_private_subnets`
      }),
      //public subnets
      cloudResource("aws_subnet", `aws_network_${bag.Name}_public_subnets`, {
        count: asFuncCall("length", [asTraversal(`data.aws_availability_zones.${avZoneDataName}.names`)]),
        vpc_id: appendToTraversal(vpcRef, "id"),
        availability_zone: asTraversal(`data.aws_availability_zones.${avZoneDataName}.names[count.index]`),
        cidr_block: asFuncCall("cidrsubnet", [
          appendToTraversal(vpcRef, "cidr_block"),
          8,
          asBinaryOp(asTraversal(`count.index`), "+", 1 + publicSubnetCidrOffset)
        ]),
        map_public_ip_on_launch: true,
        tags: {
          Name: appendToTemplate(namePrefix, [`${bag.Name}-public-subnet-`, asTraversal("count.index")])
        }
      }),
      cloudResource("aws_route_table", `aws_network_${bag.Name}_public_subnets_route_table`, {
        vpc_id: appendToTraversal(vpcRef, "id"),
        route: asBlock([{
          cidr_block: "0.0.0.0/0",
          gateway_id: asTraversal(`aws_internet_gateway.aws_network_${bag.Name}_igw.id`)
        }]),
        tags: {
          Name: appendToTemplate(namePrefix, [`${bag.Name}-public-rtable`])
        }
      }),
      cloudResource("aws_route_table_association", `aws_network_${bag.Name}_public_subnets_route_table_association`, {
        count: asFuncCall("length", [asTraversal(`data.aws_availability_zones.${avZoneDataName}.names`)]),
        subnet_id: asFuncCall("element", [
          asTraversal(`aws_subnet.aws_network_${bag.Name}_public_subnets.*.id`),
          asTraversal("count.index")
        ]),
        route_table_id: asTraversal(`aws_route_table.aws_network_${bag.Name}_public_subnets_route_table.id`)
      }),
      cloudResource("aws_internet_gateway", `aws_network_${bag.Name}_igw`, {
        vpc_id: appendToTraversal(vpcRef, "id"),
        tags: {
          Name: appendToTemplate(namePrefix, [`${bag.Name}-igw`])
        }
      }),
      //private subnets (nat goes into the public subnet, but is a the root of the private subnet)
      cloudResource("aws_subnet", `aws_network_${bag.Name}_private_subnets`, {
        count: asFuncCall("length", [asTraversal(`data.aws_availability_zones.${avZoneDataName}.names`)]),
        vpc_id: appendToTraversal(vpcRef, "id"),
        availability_zone: asTraversal(`data.aws_availability_zones.${avZoneDataName}.names[count.index]`),
        cidr_block: asFuncCall("cidrsubnet", [
          appendToTraversal(vpcRef, "cidr_block"),
          8,
          asBinaryOp(asTraversal(`count.index`), "+", 101 + privateSubnetCidrOffset)
        ]),
        map_public_ip_on_launch: true,
        tags: {
          Name: appendToTemplate(namePrefix, [`${bag.Name}-private-subnet-`, asTraversal("count.index")])
        }
      }),
      cloudResource("aws_route_table", `aws_network_${bag.Name}_private_subnets_route_table`, {
        //routes for this table are created in the nat gateway section
        vpc_id: appendToTraversal(vpcRef, "id"),
        tags: {
          Name: appendToTemplate(namePrefix, [`${bag.Name}-private-rtable`])
        }
      }),
      cloudResource("aws_route_table_association", `aws_network_${bag.Name}_private_subnets_route_table_association`, {
        count: asFuncCall("length", [asTraversal(`data.aws_availability_zones.${avZoneDataName}.names`)]),
        subnet_id: asFuncCall("element", [
          asTraversal(`aws_subnet.aws_network_${bag.Name}_private_subnets.*.id`),
          asTraversal("count.index")
        ]),
        route_table_id: asTraversal(`aws_route_table.aws_network_${bag.Name}_private_subnets_route_table.id`)
      })
    );
    return databags;
  }
  exportDatabags(iterateBlocks(container, AWS_NETWORK, awsNetworkIterator).flat());
})();
