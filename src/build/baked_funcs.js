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
  function visitTokens(root, visitor2) {
    const result = visitor2(root);
    if (result) {
      return result;
    }
    switch (root.Type) {
      default:
        return root;
      case "anon":
      case "literal_value":
      case "scope_traversal":
        return root;
      case "relative_traversal":
        return {
          Type: "relative_traversal",
          Meta: root.Meta || void 0,
          Source: visitTokens(root.Source, visitor2),
          Traversal: root.Traversal
        };
      case "splat":
        return {
          Type: "splat",
          Meta: root.Meta || void 0,
          Source: visitTokens(root.Source, visitor2),
          SplatEach: visitTokens(root.SplatEach, visitor2)
        };
      case "object_const":
        return {
          Type: "object_const",
          Meta: root.Meta || void 0,
          ObjectConst: root.ObjectConst?.map((item) => ({
            Key: item.Key,
            Value: visitTokens(item.Value, visitor2)
          }))
        };
      case "array_const":
        return {
          Type: "array_const",
          Meta: root.Meta || void 0,
          ArrayConst: root.ArrayConst?.map((item) => visitTokens(item, visitor2))
        };
      case "template":
        return {
          Type: "template",
          Meta: root.Meta || void 0,
          Parts: root.Parts?.map((item) => visitTokens(item, visitor2))
        };
      case "function_call":
        return {
          Type: "function_call",
          Meta: root.Meta || void 0,
          FunctionName: root.FunctionName,
          FunctionArgs: root.FunctionArgs?.map((item) => visitTokens(item, visitor2))
        };
      case "index_access":
        return {
          Type: "index_access",
          Meta: root.Meta || void 0,
          IndexCollection: visitTokens(root.IndexCollection, visitor2),
          IndexKey: visitTokens(root.IndexKey, visitor2)
        };
      case "conditional":
        return {
          Type: "conditional",
          Meta: root.Meta || void 0,
          Condition: visitTokens(root.Condition, visitor2),
          TrueResult: visitTokens(root.TrueResult, visitor2),
          FalseResult: visitTokens(root.FalseResult, visitor2)
        };
      case "parens":
        return {
          Type: "parens",
          Meta: root.Meta || void 0,
          Source: visitTokens(root.Source, visitor2)
        };
      case "binary_op":
        return {
          Type: "binary_op",
          Meta: root.Meta || void 0,
          Operator: root.Operator,
          RightHandSide: visitTokens(root.RightHandSide, visitor2),
          LeftHandSide: visitTokens(root.LeftHandSide, visitor2)
        };
      case "unary_op":
        return {
          Type: "unary_op",
          Meta: root.Meta || void 0,
          Operator: root.Operator,
          RightHandSide: visitTokens(root.RightHandSide, visitor2)
        };
      case "for":
        return {
          Type: "for",
          Meta: root.Meta || void 0,
          ForKeyVar: root.ForKeyVar,
          ForValVar: root.ForValVar,
          ForCollExpr: visitTokens(root.ForCollExpr, visitor2),
          ForKeyExpr: root.ForKeyExpr ? visitTokens(root.ForKeyExpr, visitor2) : void 0,
          ForValExpr: visitTokens(root.ForValExpr, visitor2),
          ForCondExpr: root.ForCondExpr ? visitTokens(root.ForCondExpr, visitor2) : void 0
        };
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
  var IS_VERBOSE = os.getenv("BARBE_VERBOSE") === "1";

  // baked_funcs.ts
  var container = readDatabagContainer();
  var tokenMap = [];
  var conditionSimplifier = (notifyChange) => (token) => {
    if (token.Type !== "conditional") {
      return null;
    }
    if (token.Condition?.Type !== "binary_op") {
      return null;
    }
    if (token.Condition.Operator !== "==") {
      return null;
    }
    if (!isSimpleTemplate(token.Condition.LeftHandSide) || !isSimpleTemplate(token.Condition.RightHandSide)) {
      return null;
    }
    notifyChange();
    if (asStr(token.Condition.LeftHandSide) === asStr(token.Condition.RightHandSide)) {
      return token.TrueResult;
    } else {
      return token.FalseResult;
    }
  };
  function visitor(token) {
    if (token.Type !== "function_call") {
      return null;
    }
    switch (token.FunctionName) {
      case "replace":
        if (token.FunctionArgs?.length !== 3) {
          return null;
        }
        if (!isSimpleTemplate(token.FunctionArgs[0]) || !isSimpleTemplate(token.FunctionArgs[1]) || !isSimpleTemplate(token.FunctionArgs[2])) {
          return null;
        }
        const find = asStr(token.FunctionArgs[1]);
        const replaceBy = asStr(token.FunctionArgs[2]);
        const tokenMapReplaceBy = asStr(token.FunctionArgs[0]).split(find).join(replaceBy);
        tokenMap.push({
          match: token,
          replace_by: asSyntax(tokenMapReplaceBy)
        });
        break;
    }
    return null;
  }
  iterateAllBlocks(container, (bag) => {
    if (!bag.Value) {
      return [];
    }
    visitTokens(bag.Value, visitor);
  });
  iterateAllBlocks(container, (bag) => {
    if (!bag.Value) {
      return [];
    }
    let changed = false;
    let newValue = visitTokens(bag.Value, conditionSimplifier(() => changed = true));
    if (changed) {
      bag.Value = newValue;
      exportDatabags([bag]);
    }
  });
  if (tokenMap.length !== 0) {
    exportDatabags([{
      Type: "token_map",
      Name: "baked_funcs_token_map",
      Value: tokenMap
    }]);
  }
})();
