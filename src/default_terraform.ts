import { readDatabagContainer, onlyRunForLifecycleSteps, importComponents, barbeLifecycleStep, SugarCoatedDatabag, barbeOutputDir } from './barbe-std/utils';


const container = readDatabagContainer()
const outputDir = barbeOutputDir()
onlyRunForLifecycleSteps(['apply', 'destroy'])


let databags: SugarCoatedDatabag[] = []
switch(barbeLifecycleStep()) {
    case 'apply':
        databags.push({
            Type: 'terraform_execute',
            Name: 'default_apply',
            Value: {
                display_name: 'Terraform apply - root directory',
                mode: 'apply',
                dir: outputDir
            }
        })
        break
    case 'destroy':
        databags.push({
            Type: 'terraform_execute',
            Name: 'default_destroy',
            Value: {
                display_name: 'Terraform destroy - root directory',
                mode: 'destroy',
                dir: outputDir
            }
        })
        break
}

importComponents(
    container, 
    [{
        url: 'https://hub.barbe.app/barbe-serverless/terraform_execute/v0.1.1/.js',
        name: 'default_terraform',
        input: databags
    }]
)