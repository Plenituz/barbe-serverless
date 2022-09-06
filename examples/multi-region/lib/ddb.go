package lib

import (
	"encoding/json"
	"fmt"
	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/dynamodb"
	"github.com/aws/aws-sdk-go/service/dynamodb/dynamodbattribute"
	"github.com/pkg/errors"
	"os"
	"time"
)

type LogItem struct {
	LogId         string `json:"logId"`
	OriginType    string `json:"originType"`
	InsertionTime int64  `json:"insertionTime"`
	EventDetails  string `json:"eventDetails"`
}

var awsSession *session.Session = nil
var region = os.Getenv("AWS_REGION")

func GetSess() (*session.Session, error) {
	if region == "" {
		return nil, errors.New("no AWS_REGION env var")
	}
	if awsSession == nil {
		sess, errSession := session.NewSession(&aws.Config{
			Region: aws.String(region),
		})
		if errSession != nil {
			return nil, errors.Wrap(errSession, "error creating AWS session")
		}
		awsSession = sess
	}
	return awsSession, nil
}

func StoreDDBItem(item interface{}, table string) error {
	b, err := json.Marshal(item)
	if err != nil {
		return errors.Wrap(err, "Failed to marshal item")
	}
	fmt.Println(fmt.Sprintf("[DDB PutItem %v]> %v", table, string(b)))

	sess, err := GetSess()
	if err != nil {
		return err
	}
	dynamoClient := dynamodb.New(sess)

	ddb, err := dynamodbattribute.MarshalMap(item)
	if err != nil {
		return errors.Wrap(err, "error marshalling item to ddb format")
	}

	t := time.Now()
	_, err = dynamoClient.PutItem(&dynamodb.PutItemInput{
		TableName: aws.String(table),
		Item:      ddb,
	})
	fmt.Println("[DDB PutItem "+table+"]< in ", time.Since(t))
	if err != nil {
		return errors.Wrap(err, "error creating ddb item")
	}
	return nil
}
