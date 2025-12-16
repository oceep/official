/**
 * handler.js - Serverless Proxy for Gemini API
 * Designed for Cloudflare Workers or similar ES Module environments.
 */

export default {
  async fetch(request, env, ctx) {
    // 1. Handle CORS Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // 2. Only allow POST
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    // 3. Get Payload
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response("Invalid JSON", { status: 400 });
    }

    const { history, newMessage, useSearch, image } = body;
    const apiKey = env.GEMINI_API_KEY; // Ensure this is set in your environment
    const model = "gemini-2.0-flash-exp"; // Or gemini-1.5-flash

    if (!apiKey) {
      return new Response("Server Misconfiguration: Missing API Key", { status: 500 });
    }

    // 4. Construct Gemini API Payload
    // Convert Frontend 'history' to Gemini 'contents' format
    const contents = history.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
      // Note: Previous images in history are omitted for token efficiency in this simple version
    }));

    // Add current message
    const currentParts = [{ text: newMessage }];
    
    // Add Image if present (Base64)
    if (image) {
      const base64Data = image.split(',')[1] || image;
      const mimeType = image.match(/data:([^;]+);/)?.[1] || 'image/jpeg';
      currentParts.unshift({
        inline_data: {
          mime_type: mimeType,
          data: base64Data
        }
      });
    }

    contents.push({ role: "user", parts: currentParts });

    // Tools (Google Search)
    const tools = useSearch ? [{ google_search: {} }] : [];
    
    // System Instruction
    const systemInstruction = {
        parts: [{ text: "You are Oceep, a helpful AI assistant. Answer concisely. If using search, cite sources clearly." }]
    };

    // 5. Call Google API
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}`;
    
    const googleResponse = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        tools,
        system_instruction: systemInstruction,
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048
        }
      })
    });

    if (!googleResponse.ok) {
        const errText = await googleResponse.text();
        return new Response(`Gemini API Error: ${errText}`, { status: googleResponse.status });
    }

    // 6. Stream Transform
    // We need to parse the incoming JSON stream from Google and forward clean chunks to frontend
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const reader = googleResponse.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    // Background processing to not block the return
    ctx.waitUntil((async () => {
      try {
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          
          if (buffer.includes('"text":'))
          }
        }
      } catch (e) {
        console.error("Stream error", e);
      } finally {
        writer.close();
      }
    })());
  
    return new Response(googleResponse.body, {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*", // Fix CORS
      }
    });
    // Note: script.js will need to handle the Google format (which is effectively JSON array chunks)
  }
};
