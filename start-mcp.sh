#!/bin/bash

# Load nvm if it exists
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Change to the project directory
cd "$(dirname "$0")"

# Run the MCP server
npm run mcp 