import * as esbuild from 'esbuild'

async function main() {
    // TODO read the manifest.json and populate the entrypoints based on it
    await esbuild.build({
        entryPoints: [
            'aws_base.ts',
            'aws_provider.ts',
            'aws_s3.ts',
            'aws_function.ts',
            'aws_dynamodb.ts',
            'aws_kinesis.ts',
            'aws_iam.ts',
            'state_store.ts',
        ],
        bundle: true,
        // minify: true,
        // sourcemap: true,
        outdir: 'build',
    })
}

main()
.then(() => console.log('done'))