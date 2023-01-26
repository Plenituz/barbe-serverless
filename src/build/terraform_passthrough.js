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

  // terraform_passthrough.ts
  var container = readDatabagContainer();
  onlyRunForLifecycleSteps(["pre_generate", "generate", "post_generate"]);
  var databags = [
    ...iterateBlocks(container, "resource", (bag) => {
      if (!bag.Value) {
        return [];
      }
      return {
        Type: `cr_${bag.Name}`,
        Name: bag.Labels?.[0] || "",
        Value: bag.Value
      };
    }).flat(),
    ...iterateBlocks(container, "data", (bag) => {
      if (!bag.Value) {
        return [];
      }
      return {
        Type: `cr_[data]_${bag.Name}`,
        Name: bag.Labels?.[0] || "",
        Value: bag.Value
      };
    }).flat(),
    ...iterateBlocks(container, "module", (bag) => {
      if (!bag.Value) {
        return [];
      }
      return {
        Type: "cr_[module]",
        Name: bag.Labels?.[0] || "",
        Value: bag.Value
      };
    }).flat(),
    ...iterateBlocks(container, "terraform", (bag) => {
      if (!bag.Value) {
        return [];
      }
      return {
        Type: "cr_[terraform]",
        Name: "",
        Value: bag.Value
      };
    }).flat(),
    ...iterateBlocks(container, "variable", (bag) => {
      if (!bag.Value) {
        return [];
      }
      return {
        Type: "cr_[variable]",
        Name: bag.Labels?.[0] || "",
        Value: bag.Value
      };
    }).flat(),
    ...iterateBlocks(container, "locals", (bag) => {
      if (!bag.Value) {
        return [];
      }
      return {
        Type: "cr_[locals]",
        Name: bag.Labels?.[0] || "",
        Value: bag.Value
      };
    }).flat(),
    ...iterateAllBlocks(container, (bag) => {
      if (!bag.Value) {
        return [];
      }
      if (!bag.Type.includes("provider")) {
        return [];
      }
      if (bag.Type.includes("cr_[provider")) {
        return [];
      }
      return {
        Type: `cr_[${bag.Type}]`,
        Name: bag.Labels?.[0] || "",
        Value: bag.Value
      };
    }).flat()
  ];
  exportDatabags(databags);
})();
