
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

export interface SpiderMonkeyOsFile { 
    readFile(filename: string): string
    readFile(filename: string, binary: 'binary'): Uint8Array
    listDir(dirname: string): string[]
}

export type SpiderMonkeyOsPath = {
    join: (...paths: string[]) => string
    isAbsolute: (path: string) => boolean
}