import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { APIGatewayEvent, APIGatewayProxyResult, Context, Handler } from 'aws-lambda';
import { UserStore } from './userStore/UserStore';

const client = new DynamoDB({ region: process.env.AWS_REGION });

export const getUser = async (event: APIGatewayEvent, context: Context): Promise<APIGatewayProxyResult> => {
    let userStore = new UserStore(client)
    let user = await userStore.getUser(event.queryStringParameters.userId)
    return {
        statusCode: 200,
        body: JSON.stringify(user)
    }
}

export const storeUser = async (event: APIGatewayEvent, context: Context): Promise<APIGatewayProxyResult> => {
    let userStore = new UserStore(client)
    let user = JSON.parse(event.body || '{}')
    await userStore.storeUser(user)
    return {
        statusCode: 200,
        body: '{}'
    }
}
