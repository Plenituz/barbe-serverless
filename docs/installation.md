# Installation

Barbe-serverless is distributed as a [Barbe](https://github.com/Plenituz/barbe) manifest, 
but it also uses a few CLI tools you will need to install locally if your project uses them

Also note that Barbe-serverless currently only generates the Terraform templates for your project, 
you will need to build (bundle/compile) your code yourself. 

To generate the templates you will need:
- [Barbe CLI](https://github.com/Plenituz/barbe/blob/main/docs/installation.md)
- [Docker CLI](https://docs.docker.com/get-docker/)

If you use `aws_fargate_task`, you will need to install the following dependencies as well (this will no longer be necessary in the future):
- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
