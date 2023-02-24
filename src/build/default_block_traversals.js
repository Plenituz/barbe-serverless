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

  // default_block_traversals.ts
  var container = readDatabagContainer();
  onlyRunForLifecycleSteps(["pre_generate", "generate", "post_generate"]);
  function isDefaultTraversal(token) {
    return token.Type === "scope_traversal" && !!token.Traversal && token.Traversal.length > 0 && token.Traversal[0].Name === "default";
  }
  var allDefaultTraversals = uniq(iterateAllBlocks(container, (bag) => {
    if (!bag.Value) {
      return [];
    }
    return accumulateTokens(bag.Value, isDefaultTraversal);
  }).flat(), asStr);
  if (allDefaultTraversals.length === 0) {
    quit();
  }
  if (container.default === void 0) {
    throw new Error(`found ${allDefaultTraversals.length} references to default (for example '${asStr(allDefaultTraversals[0])}'), but no default block was found`);
  }
  var databag = {
    Type: "traversal_map",
    Name: "defaults_traversal_map",
    Value: allDefaultTraversals.map((traversal) => {
      let baseObj;
      let adjustedTraversal;
      let debugStr;
      if ((traversal.Traversal.length === 1 || traversal.Traversal?.length === 2 && traversal.Traversal[1].Type === "attr") && container.default[""]) {
        baseObj = container.default[""][0].Value;
        adjustedTraversal = traversal.Traversal.slice(1);
        debugStr = "default";
      } else if (traversal.Traversal[1].Type === "attr" && traversal.Traversal[1].Name in container.default) {
        baseObj = container.default[traversal.Traversal[1].Name][0].Value;
        adjustedTraversal = traversal.Traversal.slice(2);
        debugStr = `default.${traversal.Traversal[1].Name}`;
      } else if (container.default[""]) {
        baseObj = container.default[""][0].Value;
        adjustedTraversal = traversal.Traversal.slice(1);
        debugStr = "default";
      }
      if (!baseObj || !adjustedTraversal || !debugStr) {
        throw new Error(`reference to default block '${asStr(traversal)}' could not be resolved`);
      }
      return {
        [asStr(traversal)]: lookupTraversal(baseObj, adjustedTraversal, debugStr)
      };
    }).reduce((acc, cur) => Object.assign(acc, cur), {})
  };
  exportDatabags([databag]);
})();
