#!/bin/bash

set -e

echo "🚀 Starting Redux Cluster Integration Tests"

# Build the project first
echo "📦 Building project..."
npm run build

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not available. Skipping containerized tests."
    echo "📝 Running local tests only..."
    
    # Run local IPC test
    echo "🔄 Running IPC test..."
    cd integration
    node test-runner.js
    exit $?
fi

# Check if Docker Compose is available
if ! command -v docker-compose &> /dev/null && ! command -v docker compose &> /dev/null; then
    echo "❌ Docker Compose is not available. Skipping containerized tests."
    echo "📝 Running local tests only..."
    
    # Run local IPC test
    echo "🔄 Running IPC test..."
    cd integration
    TEST_MODE=ipc node test-runner.js
    exit $?
fi

# Use docker compose or docker-compose depending on what's available
DOCKER_COMPOSE="docker compose"
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
fi

echo "🐳 Using Docker for integration tests..."

# Cleanup any existing containers
echo "🧹 Cleaning up existing containers..."
cd integration
$DOCKER_COMPOSE -f docker-compose.test.yml down --remove-orphans 2>/dev/null || true

# Build test images
echo "🏗️  Building test images..."
$DOCKER_COMPOSE -f docker-compose.test.yml build

# Run TCP server/client tests
echo "🌐 Running TCP Server/Client tests..."
$DOCKER_COMPOSE -f docker-compose.test.yml up --abort-on-container-exit --exit-code-from redis-cluster-server

# Check results
SERVER_EXIT_CODE=$?
if [ $SERVER_EXIT_CODE -ne 0 ]; then
    echo "❌ TCP Server/Client test failed"
    $DOCKER_COMPOSE -f docker-compose.test.yml logs
    $DOCKER_COMPOSE -f docker-compose.test.yml down
    exit $SERVER_EXIT_CODE
fi

echo "✅ TCP Server/Client test passed"

# Run File Socket test
echo "📁 Running File Socket test..."
$DOCKER_COMPOSE -f docker-compose.test.yml up file-socket-test --abort-on-container-exit

FILE_SOCKET_EXIT_CODE=$?
if [ $FILE_SOCKET_EXIT_CODE -ne 0 ]; then
    echo "❌ File Socket test failed"
    $DOCKER_COMPOSE -f docker-compose.test.yml logs file-socket-test
    $DOCKER_COMPOSE -f docker-compose.test.yml down
    exit $FILE_SOCKET_EXIT_CODE
fi

echo "✅ File Socket test passed"

# Run IPC test
echo "🔄 Running IPC test..."
$DOCKER_COMPOSE -f docker-compose.test.yml up ipc-test --abort-on-container-exit

IPC_EXIT_CODE=$?
if [ $IPC_EXIT_CODE -ne 0 ]; then
    echo "❌ IPC test failed"
    $DOCKER_COMPOSE -f docker-compose.test.yml logs ipc-test
    $DOCKER_COMPOSE -f docker-compose.test.yml down
    exit $IPC_EXIT_CODE
fi

echo "✅ IPC test passed"

# Cleanup
echo "🧹 Cleaning up..."
$DOCKER_COMPOSE -f docker-compose.test.yml down

echo ""
echo "🎉 All integration tests passed!"
echo "📊 Test Summary:"
echo "  ✅ TCP Server/Client synchronization test"
echo "  ✅ File Socket synchronization test" 
echo "  ✅ IPC synchronization test"
echo ""
echo "🎯 All tests achieved >90% synchronization success rate"
