import * as esbuild from 'esbuild'
import * as fs from 'fs'
import * as path from 'path'

const BUILD_DIR = 'build'

async function main() {
    await esbuild.build({
        entryPoints: [
            ...fs.readdirSync('.').filter(f => f.endsWith('.ts')),
            'cloudformation_reader/cloudformation_reader.ts',
            'sls_framework_reader/sls_framework_reader.ts',
        ],
        bundle: true,
        // minify: true,
        // sourcemap: true,
        outdir: BUILD_DIR,
        loader: {
            '.py': 'text',
            '.template.js': 'text'
        }
    })
    fs.readdirSync(BUILD_DIR, { withFileTypes: true }).forEach(f => {
        if (!f.isDirectory()) {
            return
        }
        moveFiles(path.join(BUILD_DIR, f.name), BUILD_DIR)
    })
}

function moveFiles(dir, toDir) {
    const files = fs.readdirSync(dir, { withFileTypes: true })
    for (const file of files) {
        const filePath = path.join(dir, file.name)
        if (file.isDirectory()) {
            continue
        }
        fs.renameSync(filePath, path.join(toDir, file.name))
    }
    fs.rmdirSync(dir)
}

main()
    .then(() => console.log('done'))