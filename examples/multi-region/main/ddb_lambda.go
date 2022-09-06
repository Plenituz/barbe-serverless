package main

import (
	"encoding/json"
	"fmt"
	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
)

func Handler(event events.DynamoDBEvent) error {
	b, _ := json.Marshal(event)
	fmt.Println(fmt.Sprintf("[DynamoDB Event %v] %v", event.Records[0].EventName, string(b)))
	return nil
}

func main() {
	lambda.Start(Handler)
}
