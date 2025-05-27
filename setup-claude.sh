#!/bin/bash

# Setup script for installing Tercer-MCP in Claude Desktop App

echo "🚀 Setting up Tercer-MCP for Claude Desktop App..."

# Get the current directory
CURRENT_DIR=$(pwd)
echo "📁 Project directory: $CURRENT_DIR"

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -f "src/local-server.ts" ]; then
    echo "❌ Error: Please run this script from the tercer-mcp project directory"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Check if Claude config directory exists
CLAUDE_CONFIG_DIR="$HOME/Library/Application Support/Claude"

if [ ! -d "$CLAUDE_CONFIG_DIR" ]; then
    echo "📂 Creating Claude configuration directory..."
    mkdir -p "$CLAUDE_CONFIG_DIR"
fi

# Create the configuration file
CONFIG_FILE="$CLAUDE_CONFIG_DIR/claude_desktop_config.json"

echo "⚙️  Creating Claude configuration..."

# Check if config file already exists
if [ -f "$CONFIG_FILE" ]; then
    echo "⚠️  Configuration file already exists. Creating backup..."
    cp "$CONFIG_FILE" "$CONFIG_FILE.backup.$(date +%Y%m%d_%H%M%S)"
fi

# Create the configuration
cat > "$CONFIG_FILE" << EOF
{
  "mcpServers": {
    "tercer-mcp": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "$CURRENT_DIR"
    }
  }
}
EOF

echo "✅ Configuration created at: $CONFIG_FILE"

# Test the server
echo "🧪 Testing MCP server..."
if npm run type-check; then
    echo "✅ TypeScript compilation successful"
else
    echo "❌ TypeScript compilation failed"
    exit 1
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "1. Make sure Claude Desktop App is installed"
echo "2. Restart Claude Desktop App completely"
echo "3. Look for the tools/plug icon in Claude"
echo "4. Test with: 'Can you add 5 and 3?'"
echo ""
echo "📖 For detailed instructions, see: CLAUDE_INSTALLATION.md"
echo ""
echo "🔑 Remember: You'll need your RunwayML API key to use the video/image generation tools" 