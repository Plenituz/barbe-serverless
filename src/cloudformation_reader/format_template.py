import json

with open('cloudformation_resources.json', 'r') as f:
    data = json.load(f)

formattedObj = {
    'cloudformation_resources_getter_result': {
        '{{stackName}}': data['TemplateBody']['Resources']
    }
}
with open('cloudformation_resources.json', 'w') as f:
    json.dump(formattedObj, f)