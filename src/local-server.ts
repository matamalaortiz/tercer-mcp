#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// RunwayML API interfaces
interface RunwayMLTask {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  failure?: string;
  failureCode?: string;
  progress?: number;
  image?: string;
  video?: string;
  createdAt: string;
  updatedAt: string;
}

interface RunwayMLResponse {
  id: string;
}

interface RunwayMLOrganization {
  id: string;
  name: string;
  credits: number;
}

// Validation schemas
const TextToVideoSchema = z.object({
  api_key: z.string().min(1, "API key is required"),
  prompt: z.string().min(1, "Prompt is required"),
  model: z.enum(["gen3a_turbo", "gen3a"]).default("gen3a_turbo"),
  duration: z.enum(["5", "10"]).default("10"),
  ratio: z.enum(["16:9", "9:16", "1:1"]).default("16:9"),
  watermark: z.boolean().default(false),
});

const ImageToVideoSchema = z.object({
  api_key: z.string().min(1, "API key is required"),
  prompt: z.string().min(1, "Prompt is required"),
  image_url: z.string().url("Must be a valid image URL"),
  model: z.enum(["gen3a_turbo", "gen3a"]).default("gen3a_turbo"),
  duration: z.enum(["5", "10"]).default("10"),
  ratio: z.enum(["16:9", "9:16", "1:1"]).default("16:9"),
  watermark: z.boolean().default(false),
});

const TextToImageSchema = z.object({
  api_key: z.string().min(1, "API key is required"),
  prompt: z.string().min(1, "Prompt is required"),
  model: z.enum(["runway-ml"]).default("runway-ml"),
  width: z.number().min(512).max(1536).default(1024),
  height: z.number().min(512).max(1536).default(1024),
  reference_image_url: z.string().url().optional(),
});

const GetTaskSchema = z.object({
  api_key: z.string().min(1, "API key is required"),
  task_id: z.string().min(1, "Task ID is required"),
});

const CancelTaskSchema = z.object({
  api_key: z.string().min(1, "API key is required"),
  task_id: z.string().min(1, "Task ID is required"),
});

const GetOrganizationSchema = z.object({
  api_key: z.string().min(1, "API key is required"),
});

// Calculator schemas (keeping existing functionality)
const AddSchema = z.object({
  a: z.number(),
  b: z.number(),
});

const SubtractSchema = z.object({
  a: z.number(),
  b: z.number(),
});

const MultiplySchema = z.object({
  a: z.number(),
  b: z.number(),
});

const DivideSchema = z.object({
  a: z.number(),
  b: z.number(),
});

// Helper function to make RunwayML API calls
async function callRunwayAPI(
  endpoint: string,
  method: string,
  apiKey: string,
  body?: any
): Promise<any> {
  const url = `https://api.runwayml.com/v1${endpoint}`;
  
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`RunwayML API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

// Create server instance
const server = new Server(
  {
    name: "tercer-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // RunwayML tools
      {
        name: "runway_text_to_video",
        description: "Generate a video from a text prompt using RunwayML",
        inputSchema: {
          type: "object",
          properties: {
            api_key: {
              type: "string",
              description: "Your RunwayML API key",
            },
            prompt: {
              type: "string",
              description: "Text description of the video to generate",
            },
            model: {
              type: "string",
              enum: ["gen3a_turbo", "gen3a"],
              default: "gen3a_turbo",
              description: "Model to use for generation",
            },
            duration: {
              type: "string",
              enum: ["5", "10"],
              default: "10",
              description: "Duration of the video in seconds",
            },
            ratio: {
              type: "string",
              enum: ["16:9", "9:16", "1:1"],
              default: "16:9",
              description: "Aspect ratio of the video",
            },
            watermark: {
              type: "boolean",
              default: false,
              description: "Whether to include RunwayML watermark",
            },
          },
          required: ["api_key", "prompt"],
        },
      },
      {
        name: "runway_image_to_video",
        description: "Generate a video from an image and text prompt using RunwayML",
        inputSchema: {
          type: "object",
          properties: {
            api_key: {
              type: "string",
              description: "Your RunwayML API key",
            },
            prompt: {
              type: "string",
              description: "Text description of how to animate the image",
            },
            image_url: {
              type: "string",
              description: "URL of the image to animate",
            },
            model: {
              type: "string",
              enum: ["gen3a_turbo", "gen3a"],
              default: "gen3a_turbo",
              description: "Model to use for generation",
            },
            duration: {
              type: "string",
              enum: ["5", "10"],
              default: "10",
              description: "Duration of the video in seconds",
            },
            ratio: {
              type: "string",
              enum: ["16:9", "9:16", "1:1"],
              default: "16:9",
              description: "Aspect ratio of the video",
            },
            watermark: {
              type: "boolean",
              default: false,
              description: "Whether to include RunwayML watermark",
            },
          },
          required: ["api_key", "prompt", "image_url"],
        },
      },
      {
        name: "runway_text_to_image",
        description: "Generate an image from a text prompt using RunwayML",
        inputSchema: {
          type: "object",
          properties: {
            api_key: {
              type: "string",
              description: "Your RunwayML API key",
            },
            prompt: {
              type: "string",
              description: "Text description of the image to generate",
            },
            model: {
              type: "string",
              enum: ["runway-ml"],
              default: "runway-ml",
              description: "Model to use for generation",
            },
            width: {
              type: "number",
              minimum: 512,
              maximum: 1536,
              default: 1024,
              description: "Width of the generated image",
            },
            height: {
              type: "number",
              minimum: 512,
              maximum: 1536,
              default: 1024,
              description: "Height of the generated image",
            },
            reference_image_url: {
              type: "string",
              description: "Optional reference image URL",
            },
          },
          required: ["api_key", "prompt"],
        },
      },
      {
        name: "runway_get_task",
        description: "Get the status and results of a RunwayML generation task",
        inputSchema: {
          type: "object",
          properties: {
            api_key: {
              type: "string",
              description: "Your RunwayML API key",
            },
            task_id: {
              type: "string",
              description: "The ID of the task to check",
            },
          },
          required: ["api_key", "task_id"],
        },
      },
      {
        name: "runway_cancel_task",
        description: "Cancel a running RunwayML generation task",
        inputSchema: {
          type: "object",
          properties: {
            api_key: {
              type: "string",
              description: "Your RunwayML API key",
            },
            task_id: {
              type: "string",
              description: "The ID of the task to cancel",
            },
          },
          required: ["api_key", "task_id"],
        },
      },
      {
        name: "runway_get_organization",
        description: "Get organization information and credit balance from RunwayML",
        inputSchema: {
          type: "object",
          properties: {
            api_key: {
              type: "string",
              description: "Your RunwayML API key",
            },
          },
          required: ["api_key"],
        },
      },
      // Calculator tools
      {
        name: "add",
        description: "Add two numbers",
        inputSchema: {
          type: "object",
          properties: {
            a: {
              type: "number",
              description: "First number",
            },
            b: {
              type: "number",
              description: "Second number",
            },
          },
          required: ["a", "b"],
        },
      },
      {
        name: "subtract",
        description: "Subtract two numbers",
        inputSchema: {
          type: "object",
          properties: {
            a: {
              type: "number",
              description: "First number",
            },
            b: {
              type: "number",
              description: "Second number",
            },
          },
          required: ["a", "b"],
        },
      },
      {
        name: "multiply",
        description: "Multiply two numbers",
        inputSchema: {
          type: "object",
          properties: {
            a: {
              type: "number",
              description: "First number",
            },
            b: {
              type: "number",
              description: "Second number",
            },
          },
          required: ["a", "b"],
        },
      },
      {
        name: "divide",
        description: "Divide two numbers",
        inputSchema: {
          type: "object",
          properties: {
            a: {
              type: "number",
              description: "First number",
            },
            b: {
              type: "number",
              description: "Second number",
            },
          },
          required: ["a", "b"],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // RunwayML tools
      case "runway_text_to_video": {
        const parsed = TextToVideoSchema.parse(args);
        const response = await callRunwayAPI('/tasks', 'POST', parsed.api_key, {
          taskType: 'gen3a_turbo',
          internal: false,
          options: {
            name: 'Text to Video',
            seconds: parseInt(parsed.duration),
            gen3a_turbo: {
              mode: 'text_to_video',
              prompt: parsed.prompt,
              duration: parseInt(parsed.duration),
              ratio: parsed.ratio,
              watermark: parsed.watermark,
            },
          },
        });
        return {
          content: [
            {
              type: "text",
              text: `Video generation started! Task ID: ${response.id}\n\nUse runway_get_task with this ID to check progress and get the result.`,
            },
          ],
        };
      }

      case "runway_image_to_video": {
        const parsed = ImageToVideoSchema.parse(args);
        const response = await callRunwayAPI('/tasks', 'POST', parsed.api_key, {
          taskType: 'gen3a_turbo',
          internal: false,
          options: {
            name: 'Image to Video',
            seconds: parseInt(parsed.duration),
            gen3a_turbo: {
              mode: 'image_to_video',
              prompt: parsed.prompt,
              init_image: parsed.image_url,
              duration: parseInt(parsed.duration),
              ratio: parsed.ratio,
              watermark: parsed.watermark,
            },
          },
        });
        return {
          content: [
            {
              type: "text",
              text: `Image-to-video generation started! Task ID: ${response.id}\n\nUse runway_get_task with this ID to check progress and get the result.`,
            },
          ],
        };
      }

      case "runway_text_to_image": {
        const parsed = TextToImageSchema.parse(args);
        const requestBody: any = {
          taskType: 'runway-ml',
          internal: false,
          options: {
            name: 'Text to Image',
            'runway-ml': {
              mode: 'text_to_image',
              prompt: parsed.prompt,
              width: parsed.width,
              height: parsed.height,
            },
          },
        };

        if (parsed.reference_image_url) {
          requestBody.options['runway-ml'].reference_image = parsed.reference_image_url;
        }

        const response = await callRunwayAPI('/tasks', 'POST', parsed.api_key, requestBody);
        return {
          content: [
            {
              type: "text",
              text: `Image generation started! Task ID: ${response.id}\n\nUse runway_get_task with this ID to check progress and get the result.`,
            },
          ],
        };
      }

      case "runway_get_task": {
        const parsed = GetTaskSchema.parse(args);
        const task: RunwayMLTask = await callRunwayAPI(`/tasks/${parsed.task_id}`, 'GET', parsed.api_key);
        
        let statusMessage = `Task ${task.id} Status: ${task.status}`;
        
        if (task.progress !== undefined) {
          statusMessage += `\nProgress: ${Math.round(task.progress * 100)}%`;
        }
        
        if (task.status === 'SUCCEEDED') {
          if (task.video) {
            statusMessage += `\n\n✅ Video ready! Download URL: ${task.video}`;
          } else if (task.image) {
            statusMessage += `\n\n✅ Image ready! Download URL: ${task.image}`;
          }
        } else if (task.status === 'FAILED') {
          statusMessage += `\n\n❌ Generation failed: ${task.failure || 'Unknown error'}`;
          if (task.failureCode) {
            statusMessage += ` (Code: ${task.failureCode})`;
          }
        } else if (task.status === 'PENDING' || task.status === 'RUNNING') {
          statusMessage += '\n\n⏳ Still processing... Check again in a few moments.';
        }
        
        return {
          content: [
            {
              type: "text",
              text: statusMessage,
            },
          ],
        };
      }

      case "runway_cancel_task": {
        const parsed = CancelTaskSchema.parse(args);
        await callRunwayAPI(`/tasks/${parsed.task_id}/cancel`, 'POST', parsed.api_key);
        return {
          content: [
            {
              type: "text",
              text: `Task ${parsed.task_id} has been cancelled.`,
            },
          ],
        };
      }

      case "runway_get_organization": {
        const parsed = GetOrganizationSchema.parse(args);
        const org: RunwayMLOrganization = await callRunwayAPI('/organizations', 'GET', parsed.api_key);
        return {
          content: [
            {
              type: "text",
              text: `Organization: ${org.name}\nCredits remaining: ${org.credits}`,
            },
          ],
        };
      }

      // Calculator tools
      case "add": {
        const parsed = AddSchema.parse(args);
        return {
          content: [
            {
              type: "text",
              text: `${parsed.a} + ${parsed.b} = ${parsed.a + parsed.b}`,
            },
          ],
        };
      }

      case "subtract": {
        const parsed = SubtractSchema.parse(args);
        return {
          content: [
            {
              type: "text",
              text: `${parsed.a} - ${parsed.b} = ${parsed.a - parsed.b}`,
            },
          ],
        };
      }

      case "multiply": {
        const parsed = MultiplySchema.parse(args);
        return {
          content: [
            {
              type: "text",
              text: `${parsed.a} × ${parsed.b} = ${parsed.a * parsed.b}`,
            },
          ],
        };
      }

      case "divide": {
        const parsed = DivideSchema.parse(args);
        if (parsed.b === 0) {
          throw new Error("Cannot divide by zero");
        }
        return {
          content: [
            {
              type: "text",
              text: `${parsed.a} ÷ ${parsed.b} = ${parsed.a / parsed.b}`,
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
}); 