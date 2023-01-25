
export {}

// https://github.com/mozilla/gecko-dev/blob/master/js/src/shell/js.cpp
declare global {
    var quit: () => never
    var os: SpiderMonkeyOs
}

// https://github.com/mozilla/gecko-dev/blob/master/js/src/shell/OSObject.cpp
export type SpiderMonkeyOs = {
    file: SpiderMonkeyOsFile
    getenv: (key: string) => string | undefined
}

export type SpiderMonkeyOsFile = { 
    readFile: (path: string) => string
}