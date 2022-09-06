package main

import (
	"fmt"
	"os"
)

func main() {
	fmt.Println("running in fargate with input '" + os.Getenv("TASK_INPUT") + "'")
	//
	//logItem := lib.LogItem{
	//	LogId:         uuid.New().String(),
	//	OriginType:    "fargate-task",
	//	InsertionTime: time.Now().Unix(),
	//	EventDetails:  os.Getenv("TASK_INPUT"),
	//}
	//err := lib.StoreDDBItem(logItem, os.Getenv("LOG_TABLE_NAME"))
	//if err != nil {
	//	panic(err)
	//}
}
