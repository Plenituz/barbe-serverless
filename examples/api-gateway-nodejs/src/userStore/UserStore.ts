import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
const USERS_TABLE = process.env.USERS_TABLE;

export type User = {
    userId: string;
    name: string;
}

export class UserStore {
    private dynamoDb: DynamoDB
    constructor(dynamoDb: DynamoDB) {
        this.dynamoDb = dynamoDb
    }

    async getUser(userId: string): Promise<User | null> {
        let result = await this.dynamoDb.getItem({
            TableName: USERS_TABLE,
            Key: {
                userId: {S: userId}
            }
        })
        if(!result.Item) {
            return null
        }
        return unmarshall(result.Item) as User
    }

    async storeUser(item: User) {
        await this.dynamoDb.putItem({
            TableName: USERS_TABLE,
            Item: marshall(item),
        })
    }
}
