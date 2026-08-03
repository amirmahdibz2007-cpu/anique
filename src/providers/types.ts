export type Role = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatMessage {
  role: Role;
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolParameterProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: { type: string };
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, ToolParameterProperty>;
      required?: string[];
      additionalProperties?: boolean;
    };
  };
}

export interface StreamChunk {
  type: "content" | "tool_call_delta" | "done" | "error";
  content?: string;
  toolCall?: Partial<ToolCall> & { index?: number };
  error?: string;
  finishReason?: string | null;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  tool_choice?: "auto" | "none" | "required";
  temperature?: number;
  stream?: boolean;
}

export interface ChatCompletionResult {
  message: ChatMessage;
  finishReason: string | null;
}
