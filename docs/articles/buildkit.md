# The power of buildkit, how barbe can run anything on any computer

Under the hood, Barbe-serverless uses [Buildkit](https://github.com/moby/buildkit) to run any commands on any machine.

For example pulling data from a serverless framework project is done by running `serverless print --format json` on the project directory.
But it works even if you don't have the serverless framework installed on your machine, how is that possible?

Buildkit is the technology that powers Docker, it's a engine that allows you to run containers on the fly. 

So to run `serverless print --format json`, Barbe-serverless will create a container with the serverless framework installed, 
copy the project directory in the container and run the command.

This has a lot of advantages:
- You don't need to install anything on your machine
- You can run any command on any machine, CI/CD, local, remote, etc.
- You can pin the versions of all the commands we run for you
