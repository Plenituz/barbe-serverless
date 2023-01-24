import json

with open('cloudformation_output.json', 'r') as f:
    data = json.load(f)

formattedObj = {}
for i in data['Stacks'][0]['Outputs']:
    formattedObj[i['OutputKey']] = i['OutputValue']

formattedObj = {
    'cloudformation_output_getter_result': {
        '{{stackName}}': formattedObj
    }
}
with open('cloudformation_output.json', 'w') as f:
    json.dump(formattedObj, f)