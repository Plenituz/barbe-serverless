
export {}

// https://github.com/mozilla/gecko-dev/blob/master/js/src/shell/js.cpp
declare global {
    var quit: () => never
    var os: SpiderMonkeyOs
}

// https://github.com/mozilla/gecko-dev/blob/master/js/src/shell/OSObject.cpp
export type SpiderMonkeyOs = {
    file: SpiderMonkeyOsFile
    path: SpiderMonkeyOsPath
    getenv: (key: string) => string | undefined
}

export type SpiderMonkeyOsFile = { 
    //Returns a string, unless \"binary\" is passed as the second argument, in which case it returns a Uint8Array.
    readFile: (filename: string, binary?: 'binary') => string | Uint8Array
    listDir: (dirname: string) => string[]
}

export type SpiderMonkeyOsPath = {
    join: (...paths: string[]) => string
}