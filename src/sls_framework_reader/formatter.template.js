const fs = require('fs');
let slsOutput = fs.readFileSync('sls_framework.json').toString()
let formattedOutput = {
    "sls_framework_getter_result": {
        "{{dirHash}}": JSON.parse(slsOutput)
    }
}
fs.writeFileSync('sls_framework.json', JSON.stringify(formattedOutput))