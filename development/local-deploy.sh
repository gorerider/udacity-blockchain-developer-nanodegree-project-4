#!/bin/bash

set -e
DIR=$(dirname "$0")
SCRIPT_DIR="$(cd $DIR && pwd)"
PROJECT_DIR=$(dirname "$SCRIPT_DIR")
PROJECT_NAME=$(basename "$PROJECT_DIR")
NODE_PORT_APP=${1:-8000}
NODE_PORT_SERVER=${2:-3000}
NODE_PORT_GANACHE=${3:-8545}
cd $PROJECT_DIR

docker rmi -f $PROJECT_NAME || true
docker build -t $PROJECT_NAME .

docker run \
    --rm \
    -it \
    -v $PROJECT_DIR:/app \
    -p $NODE_PORT_APP:$NODE_PORT_APP \
    -p $NODE_PORT_SERVER:$NODE_PORT_SERVER \
    -p $NODE_PORT_GANACHE:$NODE_PORT_GANACHE \
    --name $PROJECT_NAME $PROJECT_NAME sh