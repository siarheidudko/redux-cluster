#!/bin/bash

# Create package.json files for dual package support
echo '{"type":"module"}' > dist/esm/package.json
echo '{"type":"commonjs"}' > dist/cjs/package.json

echo "Package.json files created for dual package support"
