package main

import (
	"context"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/s3"
	"os"
	"strings"
)

func Handler(ctx context.Context, event map[string]interface{}) (map[string]interface{}, error) {
	sess, err := session.NewSession(&aws.Config{
		Region: aws.String(os.Getenv("AWS_REGION")),
	})
	if err != nil {
		return nil, err
	}
	s3Client := s3.New(sess)
	_, err = s3Client.PutObject(&s3.PutObjectInput{
		Bucket: aws.String(os.Getenv("S3_BUCKET")),
		Key:    aws.String("hello.txt"),
		Body:   strings.NewReader("world!"),
	})
	if err != nil {
		return nil, err
	}
	return nil, nil
}

func main() {
	lambda.Start(Handler)
}
