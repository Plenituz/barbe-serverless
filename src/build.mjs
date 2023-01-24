import * as esbuild from 'esbuild'
import * as fs from 'fs'

async function main() {
    await esbuild.build({
        entryPoints: [
            ...fs.readdirSync('.').filter(f => f.endsWith('.ts')),
            'cloudformation_reader/cloudformation_reader.ts'
        ],
        bundle: true,
        // minify: true,
        // sourcemap: true,
        outdir: 'build',
        loader: {
            '.py': 'text'
        }
    })
}

main()
.then(() => console.log('done'))