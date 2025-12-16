import { GoogleGenAI } from "@google/genai";
import { ChatMessage, Role } from "../types";

// Initialize Gemini Client
// Note: API Key must be in process.env.API_KEY
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Keywords that trigger auto-search
const SEARCH_TRIGGERS = [
  // Accented Vietnamese
  'hôm nay', 'ngày mai', 'thời tiết', 'tin tức', 'giá', 'tỷ giá', 
  'ở đâu', 'địa chỉ', 'kết quả', 'bao nhiêu', 'ngày nào', 
  'sự kiện', 'mới nhất', 'lịch', 'ngày', 'giờ', 'tháng', 'năm',
  
  // Unaccented Vietnamese
  'hom nay', 'ngay mai', 'thoi tiet', 'tin tuc', 'gia', 'ty gia',
  'o dau', 'dia chi', 'ket qua', 'bao nhieu', 'ngay nao',
  'su kien', 'moi nhat', 'lich', 'ngay', 'gio', 'thang', 'nam',

  // English
  'today', 'tomorrow', 'weather', 'news', 'price', 'rate', 
  'where', 'location', 'latest', 'schedule'
];

export const streamGeminiResponse = async (
  history: ChatMessage[],
  newMessage: string,
  userEnabledSearch: boolean,
  imageBase64?: string
): Promise<any> => {
  
  const modelId = 'gemini-2.5-flash';

  const contents = history.map(msg => {
    // If history has images, technically we should pass them, but for simplicity
    // and token saving in this demo, we might just pass text for history
    // or handle the current request's image specifically.
    return {
      role: msg.role,
      parts: [{ text: msg.content }]
    };
  });

  // Prepare current message parts
  const currentParts: any[] = [{ text: newMessage }];
  
  if (imageBase64) {
    // extract base64 data, removing the "data:image/png;base64," prefix if present
    const cleanBase64 = imageBase64.split(',')[1] || imageBase64;
    const mimeType = imageBase64.match(/data:([^;]+);/)?.[1] || 'image/jpeg';
    
    currentParts.unshift({
      inlineData: {
        mimeType: mimeType,
        data: cleanBase64
      }
    });
  }

  contents.push({
    role: Role.USER,
    parts: currentParts
  });

  // Auto-detect if search is needed based on keywords
  const lowerMsg = newMessage.toLowerCase();
  const shouldAutoSearch = SEARCH_TRIGGERS.some(keyword => lowerMsg.includes(keyword));
  const useTools = userEnabledSearch || shouldAutoSearch;

  const tools = useTools ? [{ googleSearch: {} }] : [];

  // Base system instruction
  let systemInstruction = "You are Oceep, a helpful and modern AI assistant. Answer the user's question comprehensively but concisely. Do not ramble. If the user asks for current information (weather, news, time, etc.), use the search tool naturally to provide accurate data. If using search results, cite sources clearly.";

  // Modify instruction for simple date/time queries to avoid clutter
  // Check for both accented and unaccented variations
  const isDateQuery = [
    'ngày', 'giờ', 'tháng', 'năm', 'hôm nay',
    'ngay', 'gio', 'thang', 'nam', 'hom nay'
  ].some(k => lowerMsg.includes(k));

  if (isDateQuery) {
    systemInstruction += " For queries about the current date, time, or calendar, provide the answer directly and hide the source citations in the text.";
  }

  return await ai.models.generateContentStream({
    model: modelId,
    contents: contents,
    config: {
      tools: tools,
      systemInstruction: systemInstruction,
    },
  });
};
