import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Define the Cloudflare Workers environment interface
interface Env {
	RUNWAYML_API_KEY?: string;
	MCP_OBJECT: DurableObjectNamespace;
}

// Type definitions for RunwayML API responses
interface RunwayMLTaskResponse {
	id: string;
	status: string;
	progress?: number;
	output?: string[] | string;
	failure?: string;
}

interface RunwayMLOrganizationResponse {
	id: string;
	name: string;
	credits?: number;
	subscription?: string;
}

// Define our MCP agent with tools
export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "Authless Calculator with RunwayML",
		version: "1.0.0",
	});

	// Store the API key directly in the class
	private runwayApiKey: string | undefined;

	// Override _init to access environment variables
	async _init(props: any) {
		await super._init(props);
		
		// Access the environment from the Durable Object
		const env = this.env as Env;
		this.runwayApiKey = env.RUNWAYML_API_KEY;
		console.log("=== MCP AGENT INIT ===");
		console.log("Environment available:", env ? "YES" : "NO");
		console.log("RUNWAYML_API_KEY found:", this.runwayApiKey ? "YES" : "NO");
		if (this.runwayApiKey) {
			console.log("API key length:", this.runwayApiKey.length);
		}
	}

	private getApiKey(providedKey?: string): string {
		// First try the provided key (if it's not empty), then fall back to stored key
		if (providedKey && providedKey.trim() !== "") {
			console.log("Using provided API key");
			return providedKey;
		}
		
		console.log("Checking stored API key:", this.runwayApiKey ? "FOUND" : "NOT FOUND");
		
		if (this.runwayApiKey) {
			console.log("✅ Using stored API key, length:", this.runwayApiKey.length);
			return this.runwayApiKey;
		}
		
		console.log("❌ No API key available - throwing error");
		throw new Error("RunwayML API key not found. Please ensure RUNWAYML_API_KEY is set as a Cloudflare Workers secret.");
	}

	async init() {
		// Simple addition tool
		this.server.tool(
			"add",
			{ a: z.number(), b: z.number() },
			async ({ a, b }) => ({
				content: [{ type: "text", text: String(a + b) }],
			})
		);

		// Calculator tool with multiple operations
		this.server.tool(
			"calculate",
			{
				operation: z.enum(["add", "subtract", "multiply", "divide"]),
				a: z.number(),
				b: z.number(),
			},
			async ({ operation, a, b }) => {
				let result: number;
				switch (operation) {
					case "add":
						result = a + b;
						break;
					case "subtract":
						result = a - b;
						break;
					case "multiply":
						result = a * b;
						break;
					case "divide":
						if (b === 0)
							return {
								content: [
									{
										type: "text",
										text: "Error: Cannot divide by zero",
									},
								],
							};
						result = a / b;
						break;
				}
				return { content: [{ type: "text", text: String(result) }] };
			}
		);

		// RunwayML Text-to-Video Generation
		this.server.tool(
			"runway_text_to_video",
			{
				prompt: z.string().describe("Text prompt for video generation"),
				model: z.enum(["gen4_turbo", "gen3a_turbo"]).default("gen4_turbo").describe("Model to use for generation"),
				duration: z.number().min(5).max(10).default(5).describe("Video duration in seconds (5-10)"),
				ratio: z.enum(["1280:720", "1920:1080", "720:1280", "1080:1920"]).default("1280:720").describe("Video aspect ratio"),
				auto_poll: z.boolean().default(true).describe("Automatically poll until completion (default: true)"),
				max_wait_seconds: z.number().default(300).describe("Maximum time to wait for completion in seconds (default: 300)"),
			},
			async ({ prompt, model, duration, ratio, auto_poll, max_wait_seconds }) => {
				const actualApiKey = this.getApiKey();
				if (!actualApiKey) {
					return {
						content: [
							{
								type: "text",
								text: "Error: RunwayML API key not found. Please ensure RUNWAYML_API_KEY is set as a Cloudflare Workers secret.\n\nGet your API key from: https://dev.runwayml.com",
							},
						],
					};
				}

				try {
					// Create the task
					const response = await fetch("https://api.dev.runwayml.com/v1/text_to_video", {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							"Authorization": `Bearer ${actualApiKey}`,
							"X-Runway-Version": "2024-11-06",
						},
						body: JSON.stringify({
							promptText: prompt,
							model: model,
							duration: duration,
							ratio: ratio,
						}),
					});

					if (!response.ok) {
						const errorData = await response.text();
						return {
							content: [
								{
									type: "text",
									text: `Error: ${response.status} - ${errorData}`,
								},
							],
						};
					}

					const data = await response.json() as RunwayMLTaskResponse;
					
					if (!auto_poll) {
						return {
							content: [
								{
									type: "text",
									text: `Text-to-video task created successfully!\nTask ID: ${data.id}\nStatus: ${data.status}\nModel: ${model}\nPrompt: "${prompt}"\n\nUse runway_get_task to check the status and get the result.`,
								},
							],
						};
					}

					// Auto-poll for completion
					const startTime = Date.now();
					const maxWaitMs = max_wait_seconds * 1000;
					let attempts = 0;

					while (Date.now() - startTime < maxWaitMs) {
						attempts++;
						
						try {
							const statusResponse = await fetch(`https://api.dev.runwayml.com/v1/tasks/${data.id}`, {
								method: "GET",
								headers: {
									"Authorization": `Bearer ${actualApiKey}`,
									"X-Runway-Version": "2024-11-06",
								},
							});

							if (!statusResponse.ok) {
								const errorData = await statusResponse.text();
								return {
									content: [
										{
											type: "text",
											text: `Error checking task status: ${statusResponse.status} - ${errorData}`,
										},
									],
								};
							}

							const taskData = await statusResponse.json() as RunwayMLTaskResponse;
							
							// Check if task is complete
							if (taskData.status === "SUCCEEDED") {
								let resultText = `✅ Text-to-video completed successfully after ${attempts} attempts!\n\nTask ID: ${taskData.id}\nModel: ${model}\nPrompt: "${prompt}"`;
								
								if (taskData.output) {
									if (Array.isArray(taskData.output)) {
										resultText += "\n\n🎬 Generated Videos:";
										taskData.output.forEach((url: string, index: number) => {
											resultText += `\n${index + 1}. ${url}`;
										});
									} else {
										resultText += `\n\n🎬 Generated Video: ${taskData.output}`;
									}
								}
								
								return {
									content: [
										{
											type: "text",
											text: resultText,
										},
									],
								};
							} else if (taskData.status === "FAILED") {
								return {
									content: [
										{
											type: "text",
											text: `❌ Text-to-video task failed after ${attempts} attempts.\nTask ID: ${taskData.id}\nFailure reason: ${taskData.failure || 'Unknown error'}`,
										},
									],
								};
							} else if (taskData.status === "CANCELLED") {
								return {
									content: [
										{
											type: "text",
											text: `🚫 Text-to-video task was cancelled.\nTask ID: ${taskData.id}`,
										},
									],
								};
							}
							
							// Task is still running, wait before next check
							const progressText = taskData.progress ? ` (${Math.round(taskData.progress * 100)}% complete)` : '';
							console.log(`Attempt ${attempts}: Task ${taskData.status}${progressText}, waiting 3 seconds...`);
							
							// Wait 3 seconds before next check
							await new Promise(resolve => setTimeout(resolve, 3000));
							
						} catch (pollError) {
							return {
								content: [
									{
										type: "text",
										text: `Error polling task: ${pollError instanceof Error ? pollError.message : String(pollError)}`,
									},
								],
							};
						}
					}

					// Timeout reached
					return {
						content: [
							{
								type: "text",
								text: `⏰ Text-to-video timeout reached after ${max_wait_seconds} seconds and ${attempts} attempts. Task may still be processing.\nTask ID: ${data.id}\nUse runway_get_task to check manually.`,
							},
						],
					};

				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Error creating text-to-video task: ${error instanceof Error ? error.message : String(error)}`,
							},
						],
					};
				}
			}
		);

		// RunwayML Image-to-Video Generation
		this.server.tool(
			"runway_image_to_video",
			{
				prompt_image: z.string().describe("URL or base64 data URI of the input image"),
				prompt_text: z.string().describe("Text prompt for video generation"),
				model: z.enum(["gen4_turbo", "gen3a_turbo"]).default("gen4_turbo").describe("Model to use for generation"),
				duration: z.number().min(5).max(10).default(5).describe("Video duration in seconds (5-10)"),
				ratio: z.enum(["1280:720", "1920:1080", "720:1280", "1080:1920"]).default("1280:720").describe("Video aspect ratio"),
				auto_poll: z.boolean().default(true).describe("Automatically poll until completion (default: true)"),
				max_wait_seconds: z.number().default(300).describe("Maximum time to wait for completion in seconds (default: 300)"),
			},
			async ({ prompt_image, prompt_text, model, duration, ratio, auto_poll, max_wait_seconds }) => {
				const actualApiKey = this.getApiKey();
				if (!actualApiKey) {
					return {
						content: [
							{
								type: "text",
								text: "Error: RunwayML API key not found. Please ensure RUNWAYML_API_KEY is set as a Cloudflare Workers secret.\n\nGet your API key from: https://dev.runwayml.com",
							},
						],
					};
				}

				try {
					// Create the task
					const response = await fetch("https://api.dev.runwayml.com/v1/image_to_video", {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							"Authorization": `Bearer ${actualApiKey}`,
							"X-Runway-Version": "2024-11-06",
						},
						body: JSON.stringify({
							promptImage: prompt_image,
							promptText: prompt_text,
							model: model,
							duration: duration,
							ratio: ratio,
						}),
					});

					if (!response.ok) {
						const errorData = await response.text();
						return {
							content: [
								{
									type: "text",
									text: `Error: ${response.status} - ${errorData}`,
								},
							],
						};
					}

					const data = await response.json() as RunwayMLTaskResponse;
					
					if (!auto_poll) {
						return {
							content: [
								{
									type: "text",
									text: `Image-to-video task created successfully!\nTask ID: ${data.id}\nStatus: ${data.status}\nModel: ${model}\nPrompt: "${prompt_text}"\n\nUse runway_get_task to check the status and get the result.`,
								},
							],
						};
					}

					// Auto-poll for completion
					const startTime = Date.now();
					const maxWaitMs = max_wait_seconds * 1000;
					let attempts = 0;

					while (Date.now() - startTime < maxWaitMs) {
						attempts++;
						
						try {
							const statusResponse = await fetch(`https://api.dev.runwayml.com/v1/tasks/${data.id}`, {
								method: "GET",
								headers: {
									"Authorization": `Bearer ${actualApiKey}`,
									"X-Runway-Version": "2024-11-06",
								},
							});

							if (!statusResponse.ok) {
								const errorData = await statusResponse.text();
								return {
									content: [
										{
											type: "text",
											text: `Error checking task status: ${statusResponse.status} - ${errorData}`,
										},
									],
								};
							}

							const taskData = await statusResponse.json() as RunwayMLTaskResponse;
							
							// Check if task is complete
							if (taskData.status === "SUCCEEDED") {
								let resultText = `✅ Image-to-video completed successfully after ${attempts} attempts!\n\nTask ID: ${taskData.id}\nModel: ${model}\nPrompt: "${prompt_text}"`;
								
								if (taskData.output) {
									if (Array.isArray(taskData.output)) {
										resultText += "\n\n🎬 Generated Videos:";
										taskData.output.forEach((url: string, index: number) => {
											resultText += `\n${index + 1}. ${url}`;
										});
									} else {
										resultText += `\n\n🎬 Generated Video: ${taskData.output}`;
									}
								}
								
								return {
									content: [
										{
											type: "text",
											text: resultText,
										},
									],
								};
							} else if (taskData.status === "FAILED") {
								return {
									content: [
										{
											type: "text",
											text: `❌ Image-to-video task failed after ${attempts} attempts.\nTask ID: ${taskData.id}\nFailure reason: ${taskData.failure || 'Unknown error'}`,
										},
									],
								};
							} else if (taskData.status === "CANCELLED") {
								return {
									content: [
										{
											type: "text",
											text: `🚫 Image-to-video task was cancelled.\nTask ID: ${taskData.id}`,
										},
									],
								};
							}
							
							// Task is still running, wait before next check
							const progressText = taskData.progress ? ` (${Math.round(taskData.progress * 100)}% complete)` : '';
							console.log(`Attempt ${attempts}: Task ${taskData.status}${progressText}, waiting 3 seconds...`);
							
							// Wait 3 seconds before next check
							await new Promise(resolve => setTimeout(resolve, 3000));
							
						} catch (pollError) {
							return {
								content: [
									{
										type: "text",
										text: `Error polling task: ${pollError instanceof Error ? pollError.message : String(pollError)}`,
									},
								],
							};
						}
					}

					// Timeout reached
					return {
						content: [
							{
								type: "text",
								text: `⏰ Image-to-video timeout reached after ${max_wait_seconds} seconds and ${attempts} attempts. Task may still be processing.\nTask ID: ${data.id}\nUse runway_get_task to check manually.`,
							},
						],
					};

				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Error creating image-to-video task: ${error instanceof Error ? error.message : String(error)}`,
							},
						],
					};
				}
			}
		);

		// RunwayML Text-to-Image Generation
		this.server.tool(
			"runway_text_to_image",
			{
				prompt_text: z.string().describe("Text prompt for image generation"),
				model: z.enum(["gen4_image"]).default("gen4_image").describe("Model to use for generation"),
				ratio: z.enum(["720:720","1920:1080", "1080:1920", "1280:720", "720:1280", "1024:1024"]).default("1024:1024").describe("Image aspect ratio"),
				reference_images: z.array(z.object({
					uri: z.string().describe("URL or base64 data URI of reference image"),
					tag: z.string().optional().describe("Tag to reference this image in the prompt using @tag syntax"),
				})).optional().describe("Reference images for style or content guidance"),
				auto_poll: z.boolean().default(true).describe("Automatically poll until completion (default: true)"),
				max_wait_seconds: z.number().default(300).describe("Maximum time to wait for completion in seconds (default: 300)"),
			},
			async ({ prompt_text, model, ratio, reference_images, auto_poll, max_wait_seconds }) => {
				try {
					const actualApiKey = this.getApiKey();
					const requestBody: any = {
						promptText: prompt_text,
						model: model,
						ratio: ratio,
					};

					if (reference_images && reference_images.length > 0) {
						requestBody.referenceImages = reference_images;
					}

					// Create the task
					const response = await fetch("https://api.dev.runwayml.com/v1/text_to_image", {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							"Authorization": `Bearer ${actualApiKey}`,
							"X-Runway-Version": "2024-11-06",
						},
						body: JSON.stringify(requestBody),
					});

					if (!response.ok) {
						const errorData = await response.text();
						return {
							content: [
								{
									type: "text",
									text: `Error: ${response.status} - ${errorData}`,
								},
							],
						};
					}

					const data = await response.json() as RunwayMLTaskResponse;
					
					if (!auto_poll) {
						return {
							content: [
								{
									type: "text",
									text: `Text-to-image task created successfully!\nTask ID: ${data.id}\nStatus: ${data.status}\nModel: ${model}\nPrompt: "${prompt_text}"\n\nUse runway_get_task to check the status and get the result.`,
								},
							],
						};
					}

					// Auto-poll for completion
					const startTime = Date.now();
					const maxWaitMs = max_wait_seconds * 1000;
					let attempts = 0;

					while (Date.now() - startTime < maxWaitMs) {
						attempts++;
						
						try {
							const statusResponse = await fetch(`https://api.dev.runwayml.com/v1/tasks/${data.id}`, {
								method: "GET",
								headers: {
									"Authorization": `Bearer ${actualApiKey}`,
									"X-Runway-Version": "2024-11-06",
								},
							});

							if (!statusResponse.ok) {
								const errorData = await statusResponse.text();
								return {
									content: [
										{
											type: "text",
											text: `Error checking task status: ${statusResponse.status} - ${errorData}`,
										},
									],
								};
							}

							const taskData = await statusResponse.json() as RunwayMLTaskResponse;
							
							// Check if task is complete
							if (taskData.status === "SUCCEEDED") {
								let resultText = `✅ Text-to-image completed successfully after ${attempts} attempts!\n\nTask ID: ${taskData.id}\nModel: ${model}\nPrompt: "${prompt_text}"`;
								
								if (taskData.output) {
									if (Array.isArray(taskData.output)) {
										resultText += "\n\n🖼️ Generated Images:";
										taskData.output.forEach((url: string, index: number) => {
											resultText += `\n${index + 1}. ${url}`;
										});
									} else {
										resultText += `\n\n🖼️ Generated Image: ${taskData.output}`;
									}
								}
								
								return {
									content: [
										{
											type: "text",
											text: resultText,
										},
									],
								};
							} else if (taskData.status === "FAILED") {
								return {
									content: [
										{
											type: "text",
											text: `❌ Text-to-image task failed after ${attempts} attempts.\nTask ID: ${taskData.id}\nFailure reason: ${taskData.failure || 'Unknown error'}`,
										},
									],
								};
							} else if (taskData.status === "CANCELLED") {
								return {
									content: [
										{
											type: "text",
											text: `🚫 Text-to-image task was cancelled.\nTask ID: ${taskData.id}`,
										},
									],
								};
							}
							
							// Task is still running, wait before next check
							const progressText = taskData.progress ? ` (${Math.round(taskData.progress * 100)}% complete)` : '';
							console.log(`Attempt ${attempts}: Task ${taskData.status}${progressText}, waiting 3 seconds...`);
							
							// Wait 3 seconds before next check
							await new Promise(resolve => setTimeout(resolve, 3000));
							
						} catch (pollError) {
							return {
								content: [
									{
										type: "text",
										text: `Error polling task: ${pollError instanceof Error ? pollError.message : String(pollError)}`,
									},
								],
							};
						}
					}

					// Timeout reached
					return {
						content: [
							{
								type: "text",
								text: `⏰ Text-to-image timeout reached after ${max_wait_seconds} seconds and ${attempts} attempts. Task may still be processing.\nTask ID: ${data.id}\nUse runway_get_task to check manually.`,
							},
						],
					};

				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Error creating text-to-image task: ${error instanceof Error ? error.message : String(error)}`,
							},
						],
					};
				}
			}
		);

		// RunwayML Get Task Status and Result
		this.server.tool(
			"runway_get_task",
			{
				task_id: z.string().describe("Task ID returned from a generation request"),
			},
			async ({ task_id }) => {
				const actualApiKey = this.getApiKey();
				if (!actualApiKey) {
					return {
						content: [
							{
								type: "text",
								text: "Error: RunwayML API key not found. Please ensure RUNWAYML_API_KEY is set as a Cloudflare Workers secret.\n\nGet your API key from: https://dev.runwayml.com",
							},
						],
					};
				}

				try {
					const response = await fetch(`https://api.dev.runwayml.com/v1/tasks/${task_id}`, {
						method: "GET",
						headers: {
							"Authorization": `Bearer ${actualApiKey}`,
							"X-Runway-Version": "2024-11-06",
						},
					});

					if (!response.ok) {
						const errorData = await response.text();
						return {
							content: [
								{
									type: "text",
									text: `Error: ${response.status} - ${errorData}`,
								},
							],
						};
					}

					const data = await response.json() as RunwayMLTaskResponse;
					let statusText = `Task ID: ${data.id}\nStatus: ${data.status}\nProgress: ${data.progress || 0}%`;
					
					if (data.status === "SUCCEEDED" && data.output) {
						statusText += "\n\nTask completed successfully!";
						if (Array.isArray(data.output)) {
							statusText += "\nOutput URLs:";
							data.output.forEach((url: string, index: number) => {
								statusText += `\n${index + 1}. ${url}`;
							});
						} else {
							statusText += `\nOutput: ${data.output}`;
						}
					} else if (data.status === "FAILED") {
						statusText += "\n\nTask failed.";
						if (data.failure) {
							statusText += `\nFailure reason: ${data.failure}`;
						}
					} else if (data.status === "RUNNING") {
						statusText += "\n\nTask is still running. Please check again in a few moments.";
					}

					return {
						content: [
							{
								type: "text",
								text: statusText,
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Error retrieving task: ${error instanceof Error ? error.message : String(error)}`,
							},
						],
					};
				}
			}
		);

		// RunwayML Poll Task Until Complete
		this.server.tool(
			"runway_poll_task",
			{
				task_id: z.string().describe("Task ID returned from a generation request"),
				max_wait_seconds: z.number().default(300).describe("Maximum time to wait in seconds (default: 300)"),
			},
			async ({ task_id, max_wait_seconds }) => {
				const actualApiKey = this.getApiKey();
				if (!actualApiKey) {
					return {
						content: [
							{
								type: "text",
								text: "Error: RunwayML API key not found. Please ensure RUNWAYML_API_KEY is set as a Cloudflare Workers secret.\n\nGet your API key from: https://dev.runwayml.com",
							},
						],
					};
				}

				const startTime = Date.now();
				const maxWaitMs = max_wait_seconds * 1000;
				let attempts = 0;

				while (Date.now() - startTime < maxWaitMs) {
					attempts++;
					
					try {
						const response = await fetch(`https://api.dev.runwayml.com/v1/tasks/${task_id}`, {
							method: "GET",
							headers: {
								"Authorization": `Bearer ${actualApiKey}`,
								"X-Runway-Version": "2024-11-06",
							},
						});

						if (!response.ok) {
							const errorData = await response.text();
							return {
								content: [
									{
										type: "text",
										text: `Error: ${response.status} - ${errorData}`,
									},
								],
							};
						}

						const data = await response.json() as RunwayMLTaskResponse;
						
						// Check if task is complete
						if (data.status === "SUCCEEDED") {
							let resultText = `✅ Task completed successfully after ${attempts} attempts!\n\nTask ID: ${data.id}\nStatus: ${data.status}`;
							
							if (data.output) {
								if (Array.isArray(data.output)) {
									resultText += "\n\n🖼️ Generated Images:";
									data.output.forEach((url: string, index: number) => {
										resultText += `\n${index + 1}. ${url}`;
									});
								} else {
									resultText += `\n\n🖼️ Generated Content: ${data.output}`;
								}
							}
							
							return {
								content: [
									{
										type: "text",
										text: resultText,
									},
								],
							};
						} else if (data.status === "FAILED") {
							return {
								content: [
									{
										type: "text",
										text: `❌ Task failed after ${attempts} attempts.\nTask ID: ${data.id}\nFailure reason: ${data.failure || 'Unknown error'}`,
									},
								],
							};
						} else if (data.status === "CANCELLED") {
							return {
								content: [
									{
										type: "text",
										text: `🚫 Task was cancelled.\nTask ID: ${data.id}`,
									},
								],
							};
						}
						
						// Task is still running, wait before next check
						const progressText = data.progress ? ` (${Math.round(data.progress * 100)}% complete)` : '';
						console.log(`Attempt ${attempts}: Task ${data.status}${progressText}, waiting 3 seconds...`);
						
						// Wait 3 seconds before next check
						await new Promise(resolve => setTimeout(resolve, 3000));
						
					} catch (error) {
						return {
							content: [
								{
									type: "text",
									text: `Error polling task: ${error instanceof Error ? error.message : String(error)}`,
								},
							],
						};
					}
				}

				// Timeout reached
				return {
					content: [
						{
							type: "text",
							text: `⏰ Timeout reached after ${max_wait_seconds} seconds and ${attempts} attempts. Task may still be processing. Use runway_get_task to check manually.`,
						},
					],
				};
			}
		);

		// RunwayML Cancel Task
		this.server.tool(
			"runway_cancel_task",
			{
				task_id: z.string().describe("Task ID to cancel"),
			},
			async ({ task_id }) => {
				const actualApiKey = this.getApiKey();
				if (!actualApiKey) {
					return {
						content: [
							{
								type: "text",
								text: "Error: RunwayML API key not found. Please ensure RUNWAYML_API_KEY is set as a Cloudflare Workers secret.\n\nGet your API key from: https://dev.runwayml.com",
							},
						],
					};
				}

				try {
					const response = await fetch(`https://api.dev.runwayml.com/v1/tasks/${task_id}/cancel`, {
						method: "POST",
						headers: {
							"Authorization": `Bearer ${actualApiKey}`,
							"X-Runway-Version": "2024-11-06",
						},
					});

					if (!response.ok) {
						const errorData = await response.text();
						return {
							content: [
								{
									type: "text",
									text: `Error: ${response.status} - ${errorData}`,
								},
							],
						};
					}

					return {
						content: [
							{
								type: "text",
								text: `Task ${task_id} has been cancelled successfully.`,
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Error cancelling task: ${error instanceof Error ? error.message : String(error)}`,
							},
						],
					};
				}
			}
		);

		// RunwayML Get Organization Info
		this.server.tool(
			"runway_get_organization",
			{},
			async () => {
				const actualApiKey = this.getApiKey();
				if (!actualApiKey) {
					return {
						content: [
							{
								type: "text",
								text: "Error: RunwayML API key not found. Please ensure RUNWAYML_API_KEY is set as a Cloudflare Workers secret.\n\nGet your API key from: https://dev.runwayml.com",
							},
						],
					};
				}

				try {
					const response = await fetch("https://api.dev.runwayml.com/v1/organization", {
						method: "GET",
						headers: {
							"Authorization": `Bearer ${actualApiKey}`,
							"X-Runway-Version": "2024-11-06",
						},
					});

					if (!response.ok) {
						const errorData = await response.text();
						return {
							content: [
								{
									type: "text",
									text: `Error: ${response.status} - ${errorData}`,
								},
							],
						};
					}

					const data = await response.json() as RunwayMLOrganizationResponse;
					let orgInfo = "Organization Information:\n";
					orgInfo += `ID: ${data.id}\n`;
					orgInfo += `Name: ${data.name}\n`;
					if (data.credits !== undefined) {
						orgInfo += `Credits: ${data.credits}\n`;
					}
					if (data.subscription) {
						orgInfo += `Subscription: ${data.subscription}\n`;
					}

					return {
						content: [
							{
								type: "text",
								text: orgInfo,
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Error retrieving organization info: ${error instanceof Error ? error.message : String(error)}`,
							},
						],
					};
				}
			}
		);
	}
}

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		console.log("=== FETCH HANDLER ===");
		console.log("RUNWAYML_API_KEY available:", env.RUNWAYML_API_KEY ? "YES" : "NO");
		
		const url = new URL(request.url);

		if (url.pathname === "/sse" || url.pathname === "/sse/message") {
			return MyMCP.serveSSE("/sse").fetch(request, env, ctx);
		}

		if (url.pathname === "/mcp") {
			return MyMCP.serve("/mcp").fetch(request, env, ctx);
		}

		return new Response("Not found", { status: 404 });
	},
};
