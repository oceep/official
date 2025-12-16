import { GroundingMetadata } from "@google/genai";

export enum Role {
  USER = 'user',
  MODEL = 'model'
}

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  image?: string; // Base64 string for image display
  isStreaming?: boolean;
  groundingMetadata?: GroundingMetadata;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
}