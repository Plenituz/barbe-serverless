# Node.js API gateway example

This example shows how to make a simple API using Node.js, AWS API gateway and DynamoDB.
The Typescript transpiling/bundling is handled by `esbuild`, then Barbe-serverless is used to generate the Terraform template.


### What does this do?

This application deploys tiny "user management" API at the url `https://${STAGE}-users.${BASE_DOMAIN}`
- `POST /user` will store the body of the request in the DynamoDB table, the body must have a `userId` field
- `GET /user?userId={}` will return the user with the given `userId` from the DynamoDB table

### Building/Deploying

To fully build and deploy the application, you'll need Terraform, Barbe and NPM installed. 

You will want to change the `BASE_DOMAIN` value in the `generate-prod` script in `package.json`, otherwise the
Terraform deploy will fail because it can't create the proper domain name.

You can then run
```bash
npm install
npm run deploy-prod
```

