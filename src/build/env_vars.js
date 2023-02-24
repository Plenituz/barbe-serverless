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

  // env_vars.ts
  var container = readDatabagContainer();
  onlyRunForLifecycleSteps(["pre_generate", "post_generate"]);
  function isEnvTraversal(token) {
    return token.Type === "scope_traversal" && !!token.Traversal && token.Traversal.length === 2 && token.Traversal[0].Name === "env";
  }
  var allVarNames = iterateAllBlocks(container, (bag) => {
    if (!bag.Value) {
      return [];
    }
    const allEnvTraversals = accumulateTokens(bag.Value, isEnvTraversal);
    const varNames = allEnvTraversals.map((token) => {
      if (!token.Traversal[1].Name) {
        throw new Error(`malformatted env traversal: '${asStr(token)}'`);
      }
      return token.Traversal[1].Name;
    });
    return varNames;
  }).flat();
  var uniqueVarNames = Array.from(new Set(allVarNames));
  var databag = {
    Type: "traversal_map",
    Name: "env_traversal_transform",
    Value: uniqueVarNames.reduce((acc, varName) => {
      const envVal = os.getenv(varName);
      if (envVal === void 0) {
        throw new Error(`environment variable '${varName}' not found`);
      }
      acc[`env.${varName}`] = envVal;
      return acc;
    }, {})
  };
  exportDatabags([databag]);
})();
