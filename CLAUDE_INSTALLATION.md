# Installing Tercer-MCP in Claude Desktop App

This guide will help you install your RunwayML MCP server in the Claude desktop application.

## Prerequisites

1. **Claude Desktop App**: Download and install from [Claude.ai](https://claude.ai/download)
2. **Node.js**: Make sure you have Node.js installed (version 18 or higher)
3. **RunwayML API Key**: Get your API key from [RunwayML](https://runwayml.com)

## Installation Steps

### Step 1: Prepare Your MCP Server

Make sure you're in your project directory and dependencies are installed:

```bash
cd /Users/alejandromatamala/Desktop/tercer-mcp
npm install
```

### Step 2: Test the Local Server

Test that your MCP server runs correctly:

```bash
npm run mcp
```

You should see: `MCP Server running on stdio`

Press `Ctrl+C` to stop the test.

### Step 3: Configure Claude Desktop App

1. **Find Claude's configuration directory:**
   - **macOS**: `~/Library/Application Support/Claude/`
   - **Windows**: `%APPDATA%\Claude\`
   - **Linux**: `~/.config/Claude/`

2. **Create or edit the configuration file:**
   
   Navigate to Claude's config directory and create/edit `claude_desktop_config.json`:

   ```bash
   # On macOS:
   mkdir -p ~/Library/Application\ Support/Claude/
   nano ~/Library/Application\ Support/Claude/claude_desktop_config.json
   ```

3. **Add your MCP server configuration:**

   Copy the contents from `claude_desktop_config.json` in this project, or manually add:

   ```json
   {
     "mcpServers": {
       "tercer-mcp": {
         "command": "npm",
         "args": ["run", "mcp"],
         "cwd": "/Users/alejandromatamala/Desktop/tercer-mcp"
       }
     }
   }
   ```

   **Important**: Update the `cwd` path to match your actual project location.

### Step 4: Restart Claude Desktop App

1. Completely quit Claude desktop app
2. Restart the application
3. Look for a small "plug" or "tools" icon in the interface - this indicates MCP servers are connected

### Step 5: Test the Integration

In Claude, try asking:

> "Can you check my RunwayML organization info?"

Claude should prompt you for your RunwayML API key and then use the `runway_get_organization` tool.

## Available Tools

Once installed, you'll have access to these tools in Claude:

### RunwayML Tools
- **runway_text_to_video** - Generate videos from text prompts
- **runway_image_to_video** - Animate images with text prompts  
- **runway_text_to_image** - Create images from text descriptions
- **runway_get_task** - Check status of generation tasks
- **runway_cancel_task** - Cancel running tasks
- **runway_get_organization** - Check account info and credits

### Calculator Tools
- **add** - Add two numbers
- **subtract** - Subtract two numbers
- **multiply** - Multiply two numbers
- **divide** - Divide two numbers

## Usage Examples

### Generate a Video
> "Create a 10-second video of a cat playing in a garden using RunwayML"

### Animate an Image
> "Take this image URL [paste URL] and animate it with the prompt 'gentle wind blowing through the trees'"

### Check Task Status
> "Check the status of RunwayML task [task-id]"

## Troubleshooting

### Server Not Connecting
1. Check that the `cwd` path in your config is correct
2. Ensure Node.js and npm are in your system PATH
3. Try running `npm run mcp` manually to test

### API Key Issues
- Make sure you have a valid RunwayML API key
- The tools will prompt you for the API key each time (for security)
- You can get your API key from the RunwayML dashboard

### Permission Issues
- Ensure Claude has permission to execute npm commands
- On macOS, you might need to grant Terminal permissions to Claude

## Security Note

Your RunwayML API key is requested each time you use a tool for security. Never hardcode API keys in configuration files.

## Support

If you encounter issues:
1. Check the Claude desktop app logs
2. Test the MCP server independently with `npm run mcp`
3. Verify your configuration file syntax with a JSON validator 