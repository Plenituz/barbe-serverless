

export function barbeRpcCall(req) {
    const msg = JSON.stringify(req)
    console.log(msg)
    const rawResp = readline()
    return JSON.parse(rawResp)
}


