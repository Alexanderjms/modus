export const providers = [
  { id: "chatgpt", name: "ChatGPT · OAuth", logo: "chatgpt.svg", invertInDark: true },
  { id: "bedrock", name: "AWS Amazon Bedrock", logo: "aws-amazon-bedrock.svg" },
  { id: "deepinfra", name: "DeepInfra", logo: "deepinfra.svg" },
  { id: "groq", name: "Groq", logo: "groq.svg" },
  { id: "opencode", name: "OpenCode Go", logo: "opencode.svg", invertInDark: true },
  { id: "openrouter", name: "OpenRouter", logo: "openrouter-mono.svg", invertInDark: true },
];

export const regions = [
  "us-east-2", "us-east-1", "us-west-2", "ap-southeast-3", "ap-south-1",
  "ap-southeast-2", "ap-northeast-1", "eu-central-1", "eu-west-1", "eu-west-2",
  "eu-south-1", "eu-north-1", "sa-east-1", "us-gov-west-1",
];

export const protocols = [
  { id: "chat-completions", name: "Chat Completions" },
  { id: "responses", name: "Responses" },
  { id: "messages", name: "Messages" },
];

export const maxMessages = 40;
export const maxTotalCharacters = 80_000;
