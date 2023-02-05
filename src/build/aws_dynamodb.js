(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // node_modules/crypt/crypt.js
  var require_crypt = __commonJS({
    "node_modules/crypt/crypt.js"(exports, module) {
      (function() {
        var base64map = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", crypt = {
          // Bit-wise rotation left
          rotl: function(n, b) {
            return n << b | n >>> 32 - b;
          },
          // Bit-wise rotation right
          rotr: function(n, b) {
            return n << 32 - b | n >>> b;
          },
          // Swap big-endian to little-endian and vice versa
          endian: function(n) {
            if (n.constructor == Number) {
              return crypt.rotl(n, 8) & 16711935 | crypt.rotl(n, 24) & 4278255360;
            }
            for (var i = 0; i < n.length; i++)
              n[i] = crypt.endian(n[i]);
            return n;
          },
          // Generate an array of any length of random bytes
          randomBytes: function(n) {
            for (var bytes = []; n > 0; n--)
              bytes.push(Math.floor(Math.random() * 256));
            return bytes;
          },
          // Convert a byte array to big-endian 32-bit words
          bytesToWords: function(bytes) {
            for (var words = [], i = 0, b = 0; i < bytes.length; i++, b += 8)
              words[b >>> 5] |= bytes[i] << 24 - b % 32;
            return words;
          },
          // Convert big-endian 32-bit words to a byte array
          wordsToBytes: function(words) {
            for (var bytes = [], b = 0; b < words.length * 32; b += 8)
              bytes.push(words[b >>> 5] >>> 24 - b % 32 & 255);
            return bytes;
          },
          // Convert a byte array to a hex string
          bytesToHex: function(bytes) {
            for (var hex = [], i = 0; i < bytes.length; i++) {
              hex.push((bytes[i] >>> 4).toString(16));
              hex.push((bytes[i] & 15).toString(16));
            }
            return hex.join("");
          },
          // Convert a hex string to a byte array
          hexToBytes: function(hex) {
            for (var bytes = [], c = 0; c < hex.length; c += 2)
              bytes.push(parseInt(hex.substr(c, 2), 16));
            return bytes;
          },
          // Convert a byte array to a base-64 string
          bytesToBase64: function(bytes) {
            for (var base64 = [], i = 0; i < bytes.length; i += 3) {
              var triplet = bytes[i] << 16 | bytes[i + 1] << 8 | bytes[i + 2];
              for (var j = 0; j < 4; j++)
                if (i * 8 + j * 6 <= bytes.length * 8)
                  base64.push(base64map.charAt(triplet >>> 6 * (3 - j) & 63));
                else
                  base64.push("=");
            }
            return base64.join("");
          },
          // Convert a base-64 string to a byte array
          base64ToBytes: function(base64) {
            base64 = base64.replace(/[^A-Z0-9+\/]/ig, "");
            for (var bytes = [], i = 0, imod4 = 0; i < base64.length; imod4 = ++i % 4) {
              if (imod4 == 0)
                continue;
              bytes.push((base64map.indexOf(base64.charAt(i - 1)) & Math.pow(2, -2 * imod4 + 8) - 1) << imod4 * 2 | base64map.indexOf(base64.charAt(i)) >>> 6 - imod4 * 2);
            }
            return bytes;
          }
        };
        module.exports = crypt;
      })();
    }
  });

  // node_modules/charenc/charenc.js
  var require_charenc = __commonJS({
    "node_modules/charenc/charenc.js"(exports, module) {
      var charenc = {
        // UTF-8 encoding
        utf8: {
          // Convert a string to a byte array
          stringToBytes: function(str) {
            return charenc.bin.stringToBytes(unescape(encodeURIComponent(str)));
          },
          // Convert a byte array to a string
          bytesToString: function(bytes) {
            return decodeURIComponent(escape(charenc.bin.bytesToString(bytes)));
          }
        },
        // Binary encoding
        bin: {
          // Convert a string to a byte array
          stringToBytes: function(str) {
            for (var bytes = [], i = 0; i < str.length; i++)
              bytes.push(str.charCodeAt(i) & 255);
            return bytes;
          },
          // Convert a byte array to a string
          bytesToString: function(bytes) {
            for (var str = [], i = 0; i < bytes.length; i++)
              str.push(String.fromCharCode(bytes[i]));
            return str.join("");
          }
        }
      };
      module.exports = charenc;
    }
  });

  // node_modules/is-buffer/index.js
  var require_is_buffer = __commonJS({
    "node_modules/is-buffer/index.js"(exports, module) {
      module.exports = function(obj) {
        return obj != null && (isBuffer(obj) || isSlowBuffer(obj) || !!obj._isBuffer);
      };
      function isBuffer(obj) {
        return !!obj.constructor && typeof obj.constructor.isBuffer === "function" && obj.constructor.isBuffer(obj);
      }
      function isSlowBuffer(obj) {
        return typeof obj.readFloatLE === "function" && typeof obj.slice === "function" && isBuffer(obj.slice(0, 0));
      }
    }
  });

  // node_modules/md5/md5.js
  var require_md5 = __commonJS({
    "node_modules/md5/md5.js"(exports, module) {
      (function() {
        var crypt = require_crypt(), utf8 = require_charenc().utf8, isBuffer = require_is_buffer(), bin = require_charenc().bin, md52 = function(message, options) {
          if (message.constructor == String)
            if (options && options.encoding === "binary")
              message = bin.stringToBytes(message);
            else
              message = utf8.stringToBytes(message);
          else if (isBuffer(message))
            message = Array.prototype.slice.call(message, 0);
          else if (!Array.isArray(message) && message.constructor !== Uint8Array)
            message = message.toString();
          var m = crypt.bytesToWords(message), l = message.length * 8, a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
          for (var i = 0; i < m.length; i++) {
            m[i] = (m[i] << 8 | m[i] >>> 24) & 16711935 | (m[i] << 24 | m[i] >>> 8) & 4278255360;
          }
          m[l >>> 5] |= 128 << l % 32;
          m[(l + 64 >>> 9 << 4) + 14] = l;
          var FF = md52._ff, GG = md52._gg, HH = md52._hh, II = md52._ii;
          for (var i = 0; i < m.length; i += 16) {
            var aa = a, bb = b, cc = c, dd = d;
            a = FF(a, b, c, d, m[i + 0], 7, -680876936);
            d = FF(d, a, b, c, m[i + 1], 12, -389564586);
            c = FF(c, d, a, b, m[i + 2], 17, 606105819);
            b = FF(b, c, d, a, m[i + 3], 22, -1044525330);
            a = FF(a, b, c, d, m[i + 4], 7, -176418897);
            d = FF(d, a, b, c, m[i + 5], 12, 1200080426);
            c = FF(c, d, a, b, m[i + 6], 17, -1473231341);
            b = FF(b, c, d, a, m[i + 7], 22, -45705983);
            a = FF(a, b, c, d, m[i + 8], 7, 1770035416);
            d = FF(d, a, b, c, m[i + 9], 12, -1958414417);
            c = FF(c, d, a, b, m[i + 10], 17, -42063);
            b = FF(b, c, d, a, m[i + 11], 22, -1990404162);
            a = FF(a, b, c, d, m[i + 12], 7, 1804603682);
            d = FF(d, a, b, c, m[i + 13], 12, -40341101);
            c = FF(c, d, a, b, m[i + 14], 17, -1502002290);
            b = FF(b, c, d, a, m[i + 15], 22, 1236535329);
            a = GG(a, b, c, d, m[i + 1], 5, -165796510);
            d = GG(d, a, b, c, m[i + 6], 9, -1069501632);
            c = GG(c, d, a, b, m[i + 11], 14, 643717713);
            b = GG(b, c, d, a, m[i + 0], 20, -373897302);
            a = GG(a, b, c, d, m[i + 5], 5, -701558691);
            d = GG(d, a, b, c, m[i + 10], 9, 38016083);
            c = GG(c, d, a, b, m[i + 15], 14, -660478335);
            b = GG(b, c, d, a, m[i + 4], 20, -405537848);
            a = GG(a, b, c, d, m[i + 9], 5, 568446438);
            d = GG(d, a, b, c, m[i + 14], 9, -1019803690);
            c = GG(c, d, a, b, m[i + 3], 14, -187363961);
            b = GG(b, c, d, a, m[i + 8], 20, 1163531501);
            a = GG(a, b, c, d, m[i + 13], 5, -1444681467);
            d = GG(d, a, b, c, m[i + 2], 9, -51403784);
            c = GG(c, d, a, b, m[i + 7], 14, 1735328473);
            b = GG(b, c, d, a, m[i + 12], 20, -1926607734);
            a = HH(a, b, c, d, m[i + 5], 4, -378558);
            d = HH(d, a, b, c, m[i + 8], 11, -2022574463);
            c = HH(c, d, a, b, m[i + 11], 16, 1839030562);
            b = HH(b, c, d, a, m[i + 14], 23, -35309556);
            a = HH(a, b, c, d, m[i + 1], 4, -1530992060);
            d = HH(d, a, b, c, m[i + 4], 11, 1272893353);
            c = HH(c, d, a, b, m[i + 7], 16, -155497632);
            b = HH(b, c, d, a, m[i + 10], 23, -1094730640);
            a = HH(a, b, c, d, m[i + 13], 4, 681279174);
            d = HH(d, a, b, c, m[i + 0], 11, -358537222);
            c = HH(c, d, a, b, m[i + 3], 16, -722521979);
            b = HH(b, c, d, a, m[i + 6], 23, 76029189);
            a = HH(a, b, c, d, m[i + 9], 4, -640364487);
            d = HH(d, a, b, c, m[i + 12], 11, -421815835);
            c = HH(c, d, a, b, m[i + 15], 16, 530742520);
            b = HH(b, c, d, a, m[i + 2], 23, -995338651);
            a = II(a, b, c, d, m[i + 0], 6, -198630844);
            d = II(d, a, b, c, m[i + 7], 10, 1126891415);
            c = II(c, d, a, b, m[i + 14], 15, -1416354905);
            b = II(b, c, d, a, m[i + 5], 21, -57434055);
            a = II(a, b, c, d, m[i + 12], 6, 1700485571);
            d = II(d, a, b, c, m[i + 3], 10, -1894986606);
            c = II(c, d, a, b, m[i + 10], 15, -1051523);
            b = II(b, c, d, a, m[i + 1], 21, -2054922799);
            a = II(a, b, c, d, m[i + 8], 6, 1873313359);
            d = II(d, a, b, c, m[i + 15], 10, -30611744);
            c = II(c, d, a, b, m[i + 6], 15, -1560198380);
            b = II(b, c, d, a, m[i + 13], 21, 1309151649);
            a = II(a, b, c, d, m[i + 4], 6, -145523070);
            d = II(d, a, b, c, m[i + 11], 10, -1120210379);
            c = II(c, d, a, b, m[i + 2], 15, 718787259);
            b = II(b, c, d, a, m[i + 9], 21, -343485551);
            a = a + aa >>> 0;
            b = b + bb >>> 0;
            c = c + cc >>> 0;
            d = d + dd >>> 0;
          }
          return crypt.endian([a, b, c, d]);
        };
        md52._ff = function(a, b, c, d, x, s, t) {
          var n = a + (b & c | ~b & d) + (x >>> 0) + t;
          return (n << s | n >>> 32 - s) + b;
        };
        md52._gg = function(a, b, c, d, x, s, t) {
          var n = a + (b & d | c & ~d) + (x >>> 0) + t;
          return (n << s | n >>> 32 - s) + b;
        };
        md52._hh = function(a, b, c, d, x, s, t) {
          var n = a + (b ^ c ^ d) + (x >>> 0) + t;
          return (n << s | n >>> 32 - s) + b;
        };
        md52._ii = function(a, b, c, d, x, s, t) {
          var n = a + (c ^ (b | ~d)) + (x >>> 0) + t;
          return (n << s | n >>> 32 - s) + b;
        };
        md52._blocksize = 16;
        md52._digestsize = 16;
        module.exports = function(message, options) {
          if (message === void 0 || message === null)
            throw new Error("Illegal argument " + message);
          var digestbytes = crypt.wordsToBytes(md52(message, options));
          return options && options.asBytes ? digestbytes : options && options.asString ? bin.bytesToString(digestbytes) : crypt.bytesToHex(digestbytes);
        };
      })();
    }
  });

  // aws_dynamodb.ts
  var import_md5 = __toESM(require_md5());

  // barbe-sls-lib/consts.ts
  var AWS_FUNCTION = "aws_function";
  var EVENT_DYNAMODB_STREAM = "event_dynamodb_stream";
  var AWS_DYNAMODB = "aws_dynamodb";
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
  function asTemplate(arr) {
    return {
      Type: "template",
      Parts: arr.map(asSyntax)
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
    return {
      Type: "template",
      Parts: asTemplateStr(token.ArrayConst || []).Parts?.flat() || []
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
      compileNamePrefix(blockVal)
    ];
  }
  function compileNamePrefix(blockVal) {
    return concatStrArr(blockVal.name_prefix || asSyntax([]));
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

  // aws_dynamodb.ts
  var container = readDatabagContainer();
  onlyRunForLifecycleSteps(["pre_generate", "generate", "post_generate"]);
  var ddbStreamEventsKinesisOrphans = iterateBlocks(container, AWS_FUNCTION, (awsFuncBag) => {
    if (!awsFuncBag.Value) {
      return [];
    }
    if (awsFuncBag.Value.Type !== "object_const" || !awsFuncBag.Value.ObjectConst) {
      return [];
    }
    return awsFuncBag.Value.ObjectConst.map((pair) => {
      if (pair.Key !== EVENT_DYNAMODB_STREAM || !pair.Value || pair.Value.Type !== "array_const" || !pair.Value.ArrayConst) {
        return [];
      }
      const events = asValArrayConst(pair.Value);
      const orphanEvents = events.filter(
        (event) => event.type && asStr(event.type) === "kinesis" && event.kinesis_stream && event.kinesis_stream.Traversal[0].Name === "aws_kinesis_stream"
      );
      return orphanEvents.map((event) => ({
        event,
        bag: awsFuncBag
      }));
    }).flat();
  }).flat();
  var orphanKinesisSourceMappings = ddbStreamEventsKinesisOrphans.map(({ event, bag }, i) => {
    const [block, _] = applyDefaults(container, bag.Value);
    const cloudResource = preConfCloudResourceFactory(block, "resource");
    return cloudResource("aws_lambda_event_source_mapping", `ddb_stream_sub_orphan_${i}`, {
      batch_size: event.batch_size,
      starting_position: event.starting_position || "TRIM_HORIZON",
      enabled: event.enabled,
      function_response_types: event.function_response_types,
      parallelization_factor: event.parallelization_factor,
      maximum_batching_window_in_seconds: event.maximum_batching_window_in_seconds,
      maximum_record_age_in_seconds: event.maximum_record_age_in_seconds,
      bisect_batch_on_function_error: event.bisect_batch_on_function_error,
      tumbling_window_in_seconds: event.tumbling_window_in_seconds,
      function_name: asTraversal(`aws_lambda_function.${bag.Name}_lambda.function_name`),
      event_source_arn: appendToTraversal(event.kinesis_stream, "arn"),
      destination_config: event.on_failure_destination_arn ? asBlock([{
        on_failure: asBlock([{
          destination_arn: event.on_failure_destination_arn
        }])
      }]) : void 0,
      filter_criteria: event.filter ? asBlock([{
        filter: asBlock(asValArrayConst(event.filter).map((f) => ({ pattern: f.pattern })))
      }]) : void 0
    });
  });
  function awsDynamodbIterator(bag) {
    if (!bag.Value) {
      return [];
    }
    const [block, namePrefix] = applyDefaults(container, bag.Value);
    if (!block.hash_key) {
      throw new Error(`DynamoDB table '${bag.Name}' has no hash_key`);
    }
    let regions = [];
    let regionVal = block.regions || block.region;
    if (!regionVal) {
      regions = [];
    } else if (regionVal.Type === "array_const") {
      regions = asVal(regionVal);
    } else {
      regions = [regionVal];
    }
    const regionMap = {};
    regions.forEach((region) => regionMap[asStr(region)] = true);
    const provider = regions.length === 0 ? void 0 : asTraversal(`aws.${asStr(regions[0])}`);
    const dotAutoScaling = asVal(mergeTokens(block.auto_scaling?.ArrayConst || []));
    const cloudResource = preConfCloudResourceFactory(block, "resource", { provider });
    const traversalTransform = preConfTraversalTransform(bag);
    const indexResourceName = (gsi, suffix) => {
      let toHash = asStr(gsi.hash_key);
      if (gsi.range_key) {
        toHash += asStr(gsi.range_key);
      }
      return `${bag.Name}_${(0, import_md5.default)(toHash)}_${suffix}`;
    };
    const ddbIndexName = (gsi) => {
      if (gsi.range_key) {
        return appendToTemplate(gsi.hash_key, ["-", gsi.range_key, "-index"]);
      }
      return appendToTemplate(gsi.hash_key, ["-index"]);
    };
    const indexDotAutoScaling = (gsi) => {
      return asVal(mergeTokens([
        ...block.auto_scaling?.ArrayConst || [],
        ...gsi.auto_scaling?.ArrayConst || []
      ]));
    };
    const makeAutoScalingResourceGroup = (params) => {
      return [
        cloudResource("aws_appautoscaling_target", `${params.prefix}_rt`, {
          depends_on: params.dependsOn,
          max_capacity: params.dotAutoScaling.max_read || params.dotAutoScaling.max || 1,
          min_capacity: params.dotAutoScaling.min_read || params.dotAutoScaling.min || 1,
          resource_id: asTemplate([
            "table/",
            asTraversal(`aws_dynamodb_table.${bag.Name}_aws_dynamodb.name`),
            ...params.gsi ? [
              "/index/",
              ddbIndexName(params.gsi)
            ] : []
          ]),
          service_namespace: "dynamodb",
          scalable_dimension: `dynamodb:${params.gsi ? "index" : "table"}:ReadCapacityUnits`
        }),
        cloudResource("aws_appautoscaling_policy", `${params.prefix}_rp`, {
          depends_on: params.dependsOn,
          name: asTemplate([
            "DynamoDBReadCapacityUtilization:",
            asTraversal(`aws_appautoscaling_target.${params.prefix}_rt.resource_id`)
          ]),
          policy_type: "TargetTrackingScaling",
          resource_id: asTraversal(`aws_appautoscaling_target.${params.prefix}_rt.resource_id`),
          scalable_dimension: asTraversal(`aws_appautoscaling_target.${params.prefix}_rt.scalable_dimension`),
          service_namespace: asTraversal(`aws_appautoscaling_target.${params.prefix}_rt.service_namespace`),
          target_tracking_scaling_policy_configuration: asBlock([{
            target_value: params.dotAutoScaling.target_value_read || params.dotAutoScaling.target_value || 80,
            predefined_metric_specification: asBlock([{
              predefined_metric_type: "DynamoDBReadCapacityUtilization"
            }])
          }])
        }),
        cloudResource("aws_appautoscaling_target", `${params.prefix}_wt`, {
          depends_on: params.dependsOn,
          max_capacity: params.dotAutoScaling.max_write || params.dotAutoScaling.max || 1,
          min_capacity: params.dotAutoScaling.min_write || params.dotAutoScaling.min || 1,
          resource_id: asTemplate([
            "table/",
            asTraversal(`aws_dynamodb_table.${bag.Name}_aws_dynamodb.name`),
            ...params.gsi ? [
              "/index/",
              ddbIndexName(params.gsi)
            ] : []
          ]),
          service_namespace: "dynamodb",
          scalable_dimension: `dynamodb:${params.gsi ? "index" : "table"}:WriteCapacityUnits`
        }),
        cloudResource("aws_appautoscaling_policy", `${params.prefix}_wp`, {
          depends_on: params.dependsOn,
          name: asTemplate([
            "DynamoDBWriteCapacityUtilization:",
            asTraversal(`aws_appautoscaling_target.${params.prefix}_wt.resource_id`)
          ]),
          policy_type: "TargetTrackingScaling",
          resource_id: asTraversal(`aws_appautoscaling_target.${params.prefix}_wt.resource_id`),
          scalable_dimension: asTraversal(`aws_appautoscaling_target.${params.prefix}_wt.scalable_dimension`),
          service_namespace: asTraversal(`aws_appautoscaling_target.${params.prefix}_wt.service_namespace`),
          target_tracking_scaling_policy_configuration: asBlock([{
            target_value: params.dotAutoScaling.target_value_write || params.dotAutoScaling.target_value || 80,
            predefined_metric_specification: asBlock([{
              predefined_metric_type: "DynamoDBWriteCapacityUtilization"
            }])
          }])
        })
      ];
    };
    const makeRegionalReplica = (region) => {
      const regionStr = asStr(region);
      const provider2 = asTraversal(`aws.${regionStr}`);
      const cloudResource2 = preConfCloudResourceFactory(block, "resource", { provider: provider2 });
      const cloudData = preConfCloudResourceFactory(block, "data", { provider: provider2 });
      let localDatabags = [
        cloudResource2("aws_dynamodb_table_replica", `${bag.Name}_${regionStr}_aws_dynamodb_replica`, (() => {
          let dependsOn = [];
          if (block.auto_scaling) {
            dependsOn.push(
              asTraversal(`aws_appautoscaling_policy.${bag.Name}_aws_ddb_table_as_rp`),
              asTraversal(`aws_appautoscaling_policy.${bag.Name}_aws_ddb_table_as_wp`)
            );
            if (dotGlobalSecondaryIndex) {
              dependsOn.push(
                ...dotGlobalSecondaryIndex.map((gsi) => [
                  asTraversal(`aws_appautoscaling_policy.${indexResourceName(gsi, "aws_ddb_table_ind_as_rp")}`),
                  asTraversal(`aws_appautoscaling_policy.${indexResourceName(gsi, "aws_ddb_table_ind_as_wp")}`)
                ]).flat()
              );
            }
          }
          return {
            global_table_arn: asTraversal(`aws_dynamodb_table.${bag.Name}_aws_dynamodb.arn`),
            depends_on: dependsOn
          };
        })()),
        cloudData("aws_dynamodb_table", `${bag.Name}_${regionStr}_aws_dynamodb_replica`, {
          name: asTraversal(`aws_dynamodb_table.${bag.Name}_aws_dynamodb.name`),
          depends_on: [
            asTraversal(`aws_dynamodb_table_replica.${bag.Name}_${regionStr}_aws_dynamodb_replica`)
          ]
        })
      ];
      if (block.auto_scaling) {
        localDatabags.push(
          ...makeAutoScalingResourceGroup({
            cloudResource: cloudResource2,
            dotAutoScaling,
            prefix: `${bag.Name}_aws_ddb_replica_${regionStr}_as`,
            dependsOn: [
              asTraversal(`aws_dynamodb_table_replica.${bag.Name}_${regionStr}_aws_dynamodb_replica`)
            ]
          })
        );
        if (dotGlobalSecondaryIndex) {
          localDatabags.push(
            ...dotGlobalSecondaryIndex.map((gsi) => makeAutoScalingResourceGroup({
              cloudResource: cloudResource2,
              dotAutoScaling: indexDotAutoScaling(gsi),
              prefix: indexResourceName(gsi, `aws_ddb_replica_${regionStr}_ind_as`),
              dependsOn: [
                asTraversal(`aws_dynamodb_table_replica.${bag.Name}_${regionStr}_aws_dynamodb_replica`)
              ]
            })).flat()
          );
        }
      }
      return localDatabags;
    };
    const ddbStreamEvents = iterateBlocks(container, AWS_FUNCTION, (awsFuncBag) => {
      if (!awsFuncBag.Value) {
        return [];
      }
      if (awsFuncBag.Value.Type !== "object_const" || !awsFuncBag.Value.ObjectConst) {
        return [];
      }
      return awsFuncBag.Value.ObjectConst.map((pair) => {
        if (pair.Key !== EVENT_DYNAMODB_STREAM || !pair.Value || pair.Value.Type !== "array_const" || !pair.Value.ArrayConst) {
          return [];
        }
        const events = asValArrayConst(pair.Value);
        const myEvents = events.filter(
          (event) => event.table && event.table.Traversal && event.table.Traversal[1] && event.table.Traversal[1].Name === bag.Name
        );
        return myEvents.map((event) => ({
          event,
          bag: awsFuncBag
        }));
      }).flat();
    }).flat();
    const dotGlobalSecondaryIndex = block.global_secondary_index ? asValArrayConst(block.global_secondary_index) : void 0;
    let attributeCandidates = [
      {
        name: block.hash_key,
        type: block.hash_key_type || "S"
      }
    ];
    if (block.range_key) {
      attributeCandidates.push({
        name: block.range_key,
        type: block.range_key_type || "S"
      });
    }
    if (dotGlobalSecondaryIndex) {
      attributeCandidates.push(
        ...dotGlobalSecondaryIndex.map((gsi, i) => {
          if (!gsi.hash_key) {
            throw new Error(`DynamoDB global secondary index '${bag.Name}.global_secondary_index[${i}]' has no hash_key`);
          }
          let gsiAttrs = [
            {
              name: gsi.hash_key,
              type: gsi.hash_key_type || "S"
            }
          ];
          if (gsi.range_key) {
            gsiAttrs.push({
              name: gsi.range_key,
              type: gsi.range_key_type || "S"
            });
          }
          return gsiAttrs;
        }).flat()
      );
    }
    const attributes = uniq(attributeCandidates, (c) => asStr(c.name));
    let databags = [
      traversalTransform("aws_dynamodb_traversal_transform", {
        [`aws_dynamodb.${bag.Name}`]: `aws_dynamodb_table.${bag.Name}_aws_dynamodb`
      }),
      cloudResource("aws_dynamodb_table", `${bag.Name}_aws_dynamodb`, {
        name: appendToTemplate(namePrefix, [bag.Name]),
        billing_mode: block.billing_mode || "PROVISIONED",
        read_capacity: block.read_capacity || 1,
        write_capacity: block.write_capacity || 1,
        hash_key: block.hash_key,
        range_key: block.range_key,
        // streams are required when:
        // - a dynamodb stream event handler exists
        // - using multi region replicas
        stream_enabled: block.stream_enabled || ddbStreamEvents.length > 0 || regions.length > 1,
        stream_view_type: block.stream_view_type || (ddbStreamEvents.length > 0 || regions.length > 1 ? "NEW_AND_OLD_IMAGES" : void 0),
        table_class: block.table_class,
        attribute: asBlock(attributes),
        ttl: block.ttl_key ? asBlock([{
          enabled: true,
          attribute_name: block.ttl_key
        }]) : void 0,
        global_secondary_index: dotGlobalSecondaryIndex ? asBlock(dotGlobalSecondaryIndex.map((gsi) => ({
          name: ddbIndexName(gsi),
          hash_key: gsi.hash_key,
          range_key: gsi.range_key,
          read_capacity: gsi.read_capacity || 1,
          write_capacity: gsi.write_capacity || 1,
          projection_type: gsi.projection_type || "ALL"
        }))) : void 0,
        lifecycle: block.auto_scaling ? asBlock([{
          ignore_changes: [
            asTraversal("read_capacity"),
            asTraversal("write_capacity")
          ].concat(regions.length > 1 ? [asTraversal("replica")] : [])
        }]) : void 0,
        point_in_time_recovery: block.enable_point_in_time_recovery ? asBlock([{
          enabled: block.enable_point_in_time_recovery
        }]) : void 0
      }),
      ...ddbStreamEvents.map(({ event, bag: otherBag }, i) => {
        if (!otherBag.Value) {
          return [];
        }
        const [otherBlock, _] = applyDefaults(container, otherBag.Value);
        let localCloudResource = cloudResource;
        if (regions.length > 0) {
          if (!otherBlock.region) {
            throw new Error(`DynamoDB stream event handler on 'aws_function.${otherBag.Name}' must have a region specified because the table 'aws_dynamodb.${bag.Name}' has one or more regions specified`);
          }
          const otherRegion = asStr(otherBlock.region);
          if (!(otherRegion in regions)) {
            throw new Error(`the function 'aws_function.${otherBag.Name}' is in region '${otherRegion}' but is trying to subscribe to dynamodb streams on table 'aws_dynamodb.${bag.Name}' only available in regions: ${Object.keys(regionMap).map((r) => `'${r}'`).join(", ")}`);
          }
          const provider2 = asTraversal(`aws.${otherRegion}`);
          localCloudResource = preConfCloudResourceFactory(block, "resource", { provider: provider2 });
        }
        const regionStr = asStr(otherBlock.region || "noreg");
        let localDatabags = [
          localCloudResource("aws_lambda_event_source_mapping", `${bag.Name}_${i}_ddb_stream`, {
            batch_size: event.batch_size,
            starting_position: event.starting_position || "TRIM_HORIZON",
            enabled: event.enabled,
            function_response_types: event.function_response_types,
            parallelization_factor: event.parallelization_factor,
            maximum_batching_window_in_seconds: event.maximum_batching_window_in_seconds,
            maximum_record_age_in_seconds: event.maximum_record_age_in_seconds,
            bisect_batch_on_function_error: event.bisect_batch_on_function_error,
            maximum_retry_attempts: event.maximum_retry_attempts,
            tumbling_window_in_seconds: event.tumbling_window_in_seconds,
            function_name: asTraversal(`aws_lambda_function.${otherBag.Name}_lambda.function_name`),
            destination_config: event.on_failure_destination_arn ? asBlock([{
              on_failure: asBlock([{
                destination_arn: event.on_failure_destination_arn
              }])
            }]) : void 0,
            event_source_arn: (() => {
              let sourceArn;
              if (!event.type || asStr(event.type) === "dynamodb") {
                if (!event.table) {
                  throw new Error(`'aws_function.${otherBag.Name}.table' must be specified if 'aws_function.${otherBag.Name}.type' is empty or 'dynamodb'`);
                }
                sourceArn = appendToTraversal(event.table, "stream_arn");
              } else if (asStr(event.type) === "kinesis") {
                if (!event.stream) {
                  throw new Error(`Kinesis stream event handler on 'aws_function.${otherBag.Name}' must have a stream specified`);
                }
                sourceArn = asTraversal(`aws_kinesis_stream.${bag.Name}_${regionStr}_aws_kinesis_stream.arn`);
              } else {
                throw new Error(`'${asStr(event.type)}' is an invalid value for 'aws_function.${otherBag.Name}.type'`);
              }
            })(),
            filter_criteria: event.filter ? asBlock([{
              filter: asBlock(asValArrayConst(event.filter).map((f) => ({
                pattern: f.pattern
              })))
            }]) : void 0
          })
        ];
        if (event.type && asStr(event.type) === "kinesis") {
          localDatabags.push(
            //this is not a cloud resource, it relies on the `aws_kinesis.ts` component
            //this is done because that way the aws_iam component can detect it and populate the iam role accordingly
            {
              Type: "aws_kinesis_stream",
              Name: `${bag.Name}_${regionStr}_aws_kinesis_stream`,
              Value: asSyntax({
                region: otherBlock.region,
                name: asTemplate([
                  asTraversal(`aws_dynamodb_table.${bag.Name}_aws_dynamodb.name`),
                  "-ddb-stream-dest"
                ]),
                shard_count: 1
              })
            },
            localCloudResource("aws_dynamodb_kinesis_streaming_destination", `${bag.Name}_${regionStr}_ddb_kinesis_dest`, {
              stream_arn: asTraversal(`aws_kinesis_stream.${bag.Name}_${regionStr}_aws_kinesis_stream.arn`),
              table_name: asTraversal(`aws_dynamodb_table.${bag.Name}_aws_dynamodb.name`)
            })
          );
        }
        return localDatabags;
      }).flat()
    ];
    if (block.kinesis_stream) {
      databags.push(
        cloudResource("aws_dynamodb_kinesis_streaming_destination", `${bag.Name}_ddb_kinesis_dest`, {
          stream_arn: appendToTraversal(block.kinesis_stream, "arn"),
          table_name: asTraversal(`aws_dynamodb_table.${bag.Name}_aws_dynamodb.name`)
        })
      );
    }
    if (regions.length > 1) {
      databags.push(
        ...regions.map((region, i) => {
          if (i === 0) {
            return [];
          }
          return makeRegionalReplica(region);
        }).flat()
      );
    }
    if (block.auto_scaling) {
      databags.push(
        ...makeAutoScalingResourceGroup({
          cloudResource,
          prefix: `${bag.Name}_aws_ddb_table_as`,
          dotAutoScaling
        })
      );
      if (dotGlobalSecondaryIndex) {
        databags.push(
          ...dotGlobalSecondaryIndex.map((gsi, i) => makeAutoScalingResourceGroup({
            cloudResource,
            prefix: indexResourceName(gsi, "aws_ddb_table_ind_as"),
            dotAutoScaling: indexDotAutoScaling(gsi),
            gsi
          })).flat()
        );
      }
    }
    return databags;
  }
  exportDatabags([
    ...iterateBlocks(container, AWS_DYNAMODB, awsDynamodbIterator).flat(),
    ...orphanKinesisSourceMappings
  ]);
})();
/*! Bundled license information:

is-buffer/index.js:
  (*!
   * Determine if an object is a Buffer
   *
   * @author   Feross Aboukhadijeh <https://feross.org>
   * @license  MIT
   *)
*/
