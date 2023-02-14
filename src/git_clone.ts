import { GIT_CLONE } from "./barbe-sls-lib/consts"
import { applyDefaults, preConfTraversalTransform } from "./barbe-sls-lib/lib"
import { readDatabagContainer, barbeOutputDir, onlyRunForLifecycleSteps, applyTransformers, Databag, exportDatabags, iterateBlocks, SugarCoatedDatabag, isSimpleTemplate, asStr } from './barbe-std/utils';

const container = readDatabagContainer()
const outputDir = barbeOutputDir()
onlyRunForLifecycleSteps(['pre_generate', 'generate', 'post_generate'])


function gitCloneIterator(bag: Databag): (Databag | SugarCoatedDatabag)[] {
    if(!bag.Value) {
        return [];
    }
    const [block, _] = applyDefaults(container, bag.Value)
    if(!block.uri) {
        throw new Error(`git_clone '${bag.Name}' block is missing the 'uri' parameter (ie: uri = "https://github.com/user/repo")`)
    }
    if(!isSimpleTemplate(block.uri)) {
        return []
    }

    const dirName = `git_clone_${bag.Name}`
    const uri = asStr(block.uri)

    //TODO make it so if 2 git_clone blocks have the same uri, they don't clone twice but still ahev their own traversal transform
    //(like the frontend_build block)
    return [
        {
            Type: 'traversal_map',
            Name: 'git_clone_traversal_map',
            Value: {
                [`git_clone.${bag.Name}.dir`]: `${outputDir}/${dirName}`,
            }
        },
        {
            Type: 'buildkit_run_in_container',
            Name: `git_clone_${bag.Name}`,
            Value: {
                display_name: `git clone - ${bag.Name}`,
                no_cache: true,
                // TODO request local git credentials
                dockerfile: `
                    FROM alpine/git:latest
                    RUN git clone ${uri} output`,
                exported_files: {
                    'output': dirName
                }
            }
        }
    ]
}

exportDatabags(applyTransformers([
    ...iterateBlocks(container, GIT_CLONE, gitCloneIterator).flat(),
]))