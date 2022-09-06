package main

import (
	"encoding/json"
	"fmt"
	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/service/ecs"
	"github.com/google/uuid"
	"multi-region-1/lib"
	"os"
	"time"
)

func Handler(request events.APIGatewayV2HTTPRequest) (events.APIGatewayV2HTTPResponse, error) {

	var parsed ecs.RunTaskInput
	err := json.Unmarshal([]byte(os.Getenv("RUN_TASK_PAYLOAD")), &parsed)
	if err != nil {
		fmt.Println(err)
	}

	sess, err := lib.GetSess()
	if err != nil {
		panic(err)
	}
	parsed.Overrides.ContainerOverrides[0].Environment = []*ecs.KeyValuePair{
		{
			Name:  aws.String("TASK_INPUT"),
			Value: aws.String("started from lambda in region " + os.Getenv("GENERATED_REGION")),
		},
	}
	fmt.Println(parsed)

	ecsClient := ecs.New(sess)
	_, err = ecsClient.RunTask(&parsed)
	if err != nil {
		panic(err)
	}
	fmt.Println("started task")

	logItem := lib.LogItem{
		LogId:         uuid.New().String(),
		OriginType:    "http-request",
		InsertionTime: time.Now().Unix(),
		EventDetails:  request.RequestContext.HTTP.Path,
	}
	err = lib.StoreDDBItem(logItem, os.Getenv("LOG_TABLE_NAME"))
	if err != nil {
		panic(err)
	}

	return events.APIGatewayV2HTTPResponse{
		StatusCode: 200,
		Body:       "Hello from " + os.Getenv("GENERATED_REGION") + ", and " + os.Getenv("AWS_REGION"),
	}, nil
}

func main() {
	lambda.Start(Handler)
}
