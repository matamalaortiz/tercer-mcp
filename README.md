# MCP Server with RunwayML Integration

This MCP (Model Context Protocol) server provides calculator tools and comprehensive RunwayML API integration for AI-powered video and image generation.

## Features

### Calculator Tools
- **add**: Simple addition of two numbers
- **calculate**: Multi-operation calculator (add, subtract, multiply, divide)

### RunwayML API Tools
- **runway_text_to_video**: Generate videos from text prompts
- **runway_image_to_video**: Generate videos from images with text prompts
- **runway_text_to_image**: Generate images from text prompts with optional reference images
- **runway_get_task**: Check the status and retrieve results of generation tasks
- **runway_cancel_task**: Cancel running generation tasks
- **runway_get_organization**: Get organization information and credits

## 🖥️ Claude Desktop App Installation

### Quick Setup (Recommended)
Run the automated setup script:

```bash
./setup-claude.sh
```

This script will:
- Install dependencies
- Create Claude configuration automatically
- Test the server
- Provide next steps

### Manual Setup
For detailed manual installation instructions, see: **[CLAUDE_INSTALLATION.md](CLAUDE_INSTALLATION.md)**

### What You Get
Once installed in Claude Desktop App, you can:
- Generate RunwayML videos and images directly in Claude conversations
- Use calculator tools for quick math
- Check RunwayML account status and credits
- Monitor generation task progress

**Example Claude conversation:**
> **You:** "Create a 10-second video of a cat playing in a garden"
> 
> **Claude:** *Uses runway_text_to_video tool to generate the video*

## ☁️ Cloudflare Workers Deployment

This server can also be deployed as a Cloudflare Worker for web-based access.

## Setup

### Prerequisites
1. Node.js and npm installed
2. A RunwayML account and API key
3. Cloudflare Workers account (for deployment)

### Installation
```bash
npm install
```

### Getting a RunwayML API Key
1. Sign up at [RunwayML Developer Portal](https://dev.runwayml.com)
2. Create an organization
3. Generate an API key in the API Keys tab
4. Add credits to your organization (minimum $10)

## 🔑 API Key Management

You have several options for providing your RunwayML API key:

### Option 1: Pass as Parameter (Recommended for Testing)
Include the API key directly in each tool call:

```json
{
  "prompt": "A serene lake at sunset",
  "api_key": "your_runway_api_key_here"
}
```

### Option 2: Environment Variables (Local Development)
Set the API key as an environment variable:

**For local development:**
```bash
# In your terminal
export RUNWAYML_API_KEY="your_runway_api_key_here"
npm run dev
```

**Or create a `.env` file:**
```bash
# Create .env file in project root
echo "RUNWAYML_API_KEY=your_runway_api_key_here" > .env
```

### Option 3: Cloudflare Workers Environment Variables (Production)
For production deployment, set environment variables in Cloudflare Workers:

**Using Wrangler CLI:**
```bash
# Set the environment variable for your worker
wrangler secret put RUNWAYML_API_KEY
# Enter your API key when prompted
```

**Or via Cloudflare Dashboard:**
1. Go to your Cloudflare Workers dashboard
2. Select your worker
3. Go to Settings → Environment Variables
4. Add `RUNWAYML_API_KEY` with your API key value

### Option 4: wrangler.toml Configuration (Not Recommended for Security)
You can add environment variables to `wrangler.toml`, but this is not recommended for sensitive data:

```toml
[env.production.vars]
RUNWAYML_API_KEY = "your_key_here"  # Don't do this for real keys!
```

## 🚀 Development

### Development
```bash
npm run dev
```

### Deployment
```bash
npm run deploy
```

## RunwayML API Usage

### Text-to-Video Generation
Generate videos from text descriptions using RunwayML's latest models.

**Parameters:**
- `prompt`: Text description of the video you want to generate
- `model`: Choose between "gen4_turbo" (latest) or "gen3a_turbo"
- `duration`: Video length in seconds (5-10)
- `ratio`: Aspect ratio ("1280:720", "1920:1080", "720:1280", "1080:1920")
- `api_key`: Your RunwayML API key

**Example:**
```json
{
  "prompt": "A serene lake at sunset with mountains in the background",
  "model": "gen4_turbo",
  "duration": 5,
  "ratio": "1920:1080",
  "api_key": "your_api_key_here"
}
```

### Image-to-Video Generation
Animate existing images with text prompts.

**Parameters:**
- `prompt_image`: URL or base64 data URI of the input image
- `prompt_text`: Text description of how the image should be animated
- `model`: Choose between "gen4_turbo" or "gen3a_turbo"
- `duration`: Video length in seconds (5-10)
- `ratio`: Aspect ratio
- `api_key`: Your RunwayML API key

**Example:**
```json
{
  "prompt_image": "https://example.com/image.jpg",
  "prompt_text": "The leaves gently swaying in the wind",
  "model": "gen4_turbo",
  "duration": 5,
  "ratio": "1920:1080",
  "api_key": "your_api_key_here"
}
```