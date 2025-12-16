/**
 * handler.js - Node.js Server
 * Chạy bằng lệnh: node handler.js
 */
import { createServer } from 'http';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

// Cấu hình
dotenv.config({ path: '.env.local' }); // Đọc file .env.local chứa GEMINI_API_KEY
const PORT = 3000;
const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY || API_KEY === 'PLACEHOLDER_API_KEY') {
    console.error("❌ LỖI: Chưa có GEMINI_API_KEY trong file .env.local");
    process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

const server = createServer(async (req, res) => {
    // 1. CORS Headers (Cho phép script.js gọi vào)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.url === '/api/chat' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { history, newMessage, useSearch, image } = JSON.parse(body);

                // Chuẩn bị dữ liệu gửi cho Gemini
                const contents = history.map(msg => ({
                    role: msg.role === 'user' ? 'user' : 'model',
                    parts: [{ text: msg.content }]
                }));

                const currentParts = [{ text: newMessage }];
                if (image) {
                    currentParts.unshift({
                        inlineData: {
                            mimeType: image.match(/data:([^;]+);/)?.[1] || 'image/jpeg',
                            data: image.split(',')[1]
                        }
                    });
                }
                contents.push({ role: 'user', parts: currentParts });

                const tools = useSearch ? [{ googleSearch: {} }] : [];

                // Gọi Gemini Streaming
                const result = await ai.models.generateContentStream({
                    model: 'gemini-2.0-flash-exp', // Hoặc 'gemini-1.5-flash'
                    contents: contents,
                    config: { tools, systemInstruction: "Bạn là Oceep AI. Trả lời ngắn gọn, hữu ích." }
                });

                // Trả về stream cho script.js (dạng NDJSON)
                res.writeHead(200, { 'Content-Type': 'application/json' });

                for await (const chunk of result.stream) {
                    const chunkText = chunk.text();
                    const groundingMeta = chunk.candidates?.[0]?.groundingMetadata;
                    
                    // Gửi text
                    if (chunkText) {
                        res.write(JSON.stringify({ text: chunkText }) + '\n');
                    }
                    
                    // Gửi nguồn (nếu có)
                    if (groundingMeta?.groundingChunks) {
                         const sources = groundingMeta.groundingChunks
                            .filter(c => c.web?.uri && c.web?.title)
                            .map(c => ({ uri: c.web.uri, title: c.web.title }));
                         if (sources.length > 0) {
                             res.write(JSON.stringify({ sources: sources }) + '\n');
                         }
                    }
                }
                res.end();

            } catch (error) {
                console.error("Lỗi xử lý:", error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ text: "\n[Lỗi Server: " + error.message + "]" }));
            }
        });
    } else {
        res.writeHead(404);
        res.end("Not Found");
    }
});

server.listen(PORT, () => {
    console.log(`✅ Server đang chạy tại http://localhost:${PORT}`);
    console.log(`➡️  Mở file index.html để bắt đầu chat.`);
});
