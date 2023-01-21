
export type RpcRequest = {
    method: string
    params: any[]
}

type Success<T> = {
    result: T
}

type Failure = {
    error: string
}

export type RpcResponse<T> = Success<T> | Failure

export function isSuccess<T>(resp: RpcResponse<T>): resp is Success<T> {
    return (resp as Success<T>).result !== undefined
}

export function isFailure<T>(resp: RpcResponse<T>): resp is Failure {
    return (resp as Failure).error !== undefined
}

export function barbeRpcCall<T>(req: RpcRequest): RpcResponse<T> {
    const msg = JSON.stringify(req)
    console.log(msg)
    const rawResp = readline()
    return JSON.parse(rawResp)
}


