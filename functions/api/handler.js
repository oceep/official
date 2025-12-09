// functions/api/handler.js

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Title',
};

// --- CONFIGURATION ---
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const SERPAPI_URL = 'https://serpapi.com/search';
const DECISION_MODEL = 'arcee-ai/trinity-mini:free';

// ----------------------------
// Helpers
// ----------------------------
async function safeFetch(url, opts = {}, ms = 20000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

function cleanResponse(text) {
  if (!text) return "";
  let cleaned = text.replace(/<\|.*?\|>/g, "");
  cleaned = cleaned.replace(/\{"query":.*?\}/g, "");
  return cleaned.trim();
}

// ----------------------------
// 1. SMART ROUTER - Quyết định tìm kiếm bằng AI
// ----------------------------
async function analyzeRequest(userPrompt, apiKey, debugSteps) {
  if (!apiKey) {
    debugSteps.push({ router: 'no_api_key', msg: 'No API key, defaulting to no search' });
    return { needed: false, query: '' };
  }

  try {
    const payload = {
      model: DECISION_MODEL,
      response_format: { type: "json_object" },
      messages: [
        {
          role: 'system',
          content: `You are a search decision assistant. Analyze the user's query and determine if web search is needed.

Return JSON format: { "needed": boolean, "query": "optimized search query or empty string" }

Rules:
- Return "needed": true ONLY for queries requiring:
  * Real-time data (weather, stock prices, exchange rates)
  * Recent news or events
  * Current facts that change frequently
  * Specific product prices, reviews, or availability
  * Location-based information (addresses, hours, phone numbers)
  * Sports scores or schedules
  * Celebrity/public figure current status

- Return "needed": false for:
  * General knowledge questions
  * Math/logic problems
  * Creative writing requests
  * Code/programming help
  * Translations
  * Casual conversation
  * Historical facts (before 2023)
  * Explanations of concepts
  * Greetings (hello, hi, etc.)

If unsure, return "needed": false.`
        },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 100,
      temperature: 0
    };

    const res = await safeFetch(OPENROUTER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload)
    }, 8000);

    if (!res.ok) {
      debugSteps.push({ router: 'ai_decision_failed', status: res.status });
      return { needed: false, query: '' };
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || '{}';

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      debugSteps.push({ router: 'json_parse_error', content });
      return { needed: false, query: '' };
    }

    if (typeof parsed.needed !== 'boolean') {
      debugSteps.push({ router: 'invalid_response', parsed });
      return { needed: false, query: '' };
    }

    debugSteps.push({ router: 'ai_decision', output: parsed });
    return {
      needed: parsed.needed,
      query: parsed.query || userPrompt
    };

  } catch (e) {
    debugSteps.push({ router: 'ai_exception', error: String(e) });
    return { needed: false, query: '' };
  }
}

// ----------------------------
// 2. SEARCH LAYER - SerpAPI Google AI Mode
// ----------------------------
async function searchGoogleAIMode(query, apiKey, debugSteps) {
  if (!apiKey) {
    debugSteps.push({ serpapi_error: 'MISSING_API_KEY' });
    return null;
  }

  try {
    const params = new URLSearchParams({
      engine: 'google_ai_mode',
      q: query,
      api_key: apiKey,
      hl: 'vi',
      gl: 'vn',
      device: 'desktop'
    });

    const url = `${SERPAPI_URL}?${params.toString()}`;
    debugSteps.push({ serpapi_request: { query, url: url.replace(apiKey, 'HIDDEN') } });

    const res = await safeFetch(url, { method: 'GET' }, 25000);

    if (!res.ok) {
      const txt = await res.text();
      debugSteps.push({ serpapi_fail: res.status, msg: txt.slice(0, 200) });
      return null;
    }

    const data = await res.json();
    debugSteps.push({ serpapi_success: true, hasTextBlocks: !!data.text_blocks });

    const result = {
      aiResponse: '',
      references: [],
      shoppingResults: [],
      localResults: [],
      inlineVideos: []
    };

    // 1. Extract text_blocks
    if (data.text_blocks && data.text_blocks.length > 0) {
      const textParts = [];
      for (const block of data.text_blocks) {
        if (block.type === 'paragraph' && block.snippet) {
          textParts.push(block.snippet);
        } else if (block.type === 'heading' && block.snippet) {
          textParts.push(`**${block.snippet}**`);
        } else if (block.type === 'list' && block.list) {
          for (const item of block.list) {
            if (item.snippet) {
              textParts.push(`• ${item.title ? item.title + ': ' : ''}${item.snippet}`);
            }
          }
        } else if (block.type === 'code_block' && block.code) {
          textParts.push(`\`\`\`${block.language || ''}\n${block.code}\n\`\`\``);
        }
      }
      result.aiResponse = textParts.join('\n\n');
    }

    // 2. Extract references
    if (data.references && data.references.length > 0) {
      result.references = data.references.slice(0, 5).map(ref => ({
        title: ref.title || '',
        link: ref.link || '',
        snippet: ref.snippet || '',
        source: ref.source || ''
      }));
    }

    // 3. Extract quick_results
    if (data.quick_results && data.quick_results.length > 0) {
      for (const qr of data.quick_results.slice(0, 3)) {
        result.references.push({
          title: qr.title || '',
          link: qr.link || '',
          snippet: qr.snippet || '',
          source: qr.source || ''
        });
      }
    }

    // 4. Extract shopping_results
    if (data.shopping_results && data.shopping_results.length > 0) {
      result.shoppingResults = data.shopping_results.slice(0, 3).map(item => ({
        title: item.title || '',
        link: item.product_link || '',
        price: item.price || '',
        rating: item.rating || '',
        thumbnail: item.thumbnail || ''
      }));
    }

    // 5. Extract local_results
    if (data.local_results && data.local_results.length > 0) {
      result.localResults = data.local_results.slice(0, 3).map(place => ({
        title: place.title || '',
        address: place.address || '',
        rating: place.rating || '',
        hours: place.hours || '',
        type: place.type || ''
      }));
    }

    // 6. Extract inline_videos
    if (data.inline_videos && data.inline_videos.length > 0) {
      result.inlineVideos = data.inline_videos.slice(0, 2).map(video => ({
        title: video.title || '',
        link: video.link || '',
        channel: video.channel || '',
        duration: video.duration || ''
      }));
    }

    if (!result.aiResponse && result.references.length === 0) {
      debugSteps.push({ serpapi_note: 'No useful content extracted' });
      return null;
    }

    return result;

  } catch (e) {
    debugSteps.push({ serpapi_exception: String(e) });
    return null;
  }
}

// ----------------------------
// 3. Format Search Context
// ----------------------------
function formatSearchContext(searchResult) {
  let context = '';

  if (searchResult.aiResponse) {
    context += `[GOOGLE AI MODE RESPONSE]\n${searchResult.aiResponse}\n\n`;
  }

  if (searchResult.references.length > 0) {
    context += `[SOURCES]\n`;
    searchResult.references.forEach((ref, i) => {
      context += `[${i + 1}] ${ref.title}\n`;
      if (ref.snippet) context += `    ${ref.snippet.slice(0, 300)}...\n`;
      if (ref.link) context += `    URL: ${ref.link}\n`;
      context += '\n';
    });
  }

  if (searchResult.localResults.length > 0) {
    context += `[LOCAL PLACES]\n`;
    searchResult.localResults.forEach((place, i) => {
      context += `${i + 1}. ${place.title}`;
      if (place.rating) context += ` (${place.rating}⭐)`;
      if (place.address) context += `\n   📍 ${place.address}`;
      if (place.hours) context += `\n   🕐 ${place.hours}`;
      context += '\n';
    });
    context += '\n';
  }

  if (searchResult.shoppingResults.length > 0) {
    context += `[PRODUCTS]\n`;
    searchResult.shoppingResults.forEach((item, i) => {
      context += `${i + 1}. ${item.title}`;
      if (item.price) context += ` - ${item.price}`;
      if (item.rating) context += ` (${item.rating}⭐)`;
      context += '\n';
    });
    context += '\n';
  }

  if (searchResult.inlineVideos.length > 0) {
    context += `[VIDEOS]\n`;
    searchResult.inlineVideos.forEach((video, i) => {
      context += `${i + 1}. ${video.title}`;
      if (video.channel) context += ` - ${video.channel}`;
      if (video.duration) context += ` (${video.duration})`;
      if (video.link) context += `\n   ${video.link}`;
      context += '\n';
    });
  }

  return context.trim();
}

// ----------------------------
// 4. MAIN WORKER
// ----------------------------
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const body = await request.json().catch(() => ({}));
    const { modelName = 'Smart', messages = [] } = body;
    const debug = { steps: [] };

    // --- MODEL CONFIGURATION ---
    const apiConfig = {
      Mini: {
        key: env.MINI_API_KEY,
        model: 'qwen/qwen-2.5-7b-instruct:free'
      },
      Smart: {
        key: env.SMART_API_KEY,
        model: 'google/gemini-2.0-flash-exp:free'
      },
      Nerd: {
        key: env.NERD_API_KEY,
        model: 'thudm/glm-4-9b-chat:free'
      }
    };

    const config = apiConfig[modelName];
    if (!config) {
      return new Response(JSON.stringify({ error: 'Invalid modelName' }), {
        status: 400,
        headers: corsHeaders
      });
    }

    const lastMsg = messages[messages.length - 1]?.content || '';
    if (!lastMsg) {
      return new Response(JSON.stringify({ error: 'Empty message' }), {
        status: 400,
        headers: corsHeaders
      });
    }

    let toolUsed = 'Internal Knowledge';
    let searchContext = '';
    let searchResult = null;

    // --- STEP 1: AI QUYẾT ĐỊNH TÌM KIẾM ---
    const decisionKey = env.DECIDE_API_KEY || env.SMART_API_KEY;
    const analysis = await analyzeRequest(lastMsg, decisionKey, debug.steps);

    // --- STEP 2: GỌI SERPAPI GOOGLE AI MODE (nếu cần) ---
    if (analysis.needed) {
      searchResult = await searchGoogleAIMode(analysis.query, env.SERPAPI_KEY, debug.steps);

      if (searchResult) {
        toolUsed = 'WebSearch (Google AI Mode)';
        searchContext = formatSearchContext(searchResult);
        debug.steps.push({ search_success: true, hasAIResponse: !!searchResult.aiResponse });
      } else {
        toolUsed = 'WebSearch (Failed - Using Knowledge)';
        debug.steps.push({ search_success: false });
      }
    }

    // --- STEP 3: CHUẨN BỊ MESSAGES CHO MODEL ---
    const finalMessages = [];

    let systemPrompt = `You are Oceep, a helpful and direct AI assistant. 
- Answer in the same language as the user's question
- Be concise but thorough
- If you don't know something, say so honestly`;

    if (searchContext) {
      systemPrompt += `

IMPORTANT: You have access to real-time search results below. Use this information to answer the user's question accurately.
- Cite sources using [1], [2], etc. when referencing specific information
- If the search results don't fully answer the question, supplement with your knowledge but indicate this
- Prioritize the search results for factual/current information`;
    }

    finalMessages.push({ role: 'system', content: systemPrompt });

    const conversationHistory = messages.filter(m => m.role !== 'system');

    if (searchContext && conversationHistory.length > 0) {
      for (let i = 0; i < conversationHistory.length - 1; i++) {
        finalMessages.push(conversationHistory[i]);
      }

      finalMessages.push({
        role: 'user',
        content: `${lastMsg}

---
[SEARCH RESULTS - Use this information to answer]
${searchContext}
---

Please answer the question above using the search results provided. Cite sources where applicable.`
      });
    } else {
      finalMessages.push(...conversationHistory);
    }

    // --- STEP 4: GỌI MODEL TRẢ LỜI ---
    debug.steps.push({ calling_model: config.model, message_count: finalMessages.length });

    const modelRes = await safeFetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
                'Content-Type': 'application/json',
        Authorization: `Bearer ${config.key}`,
        'HTTP-Referer': 'https://oceep.app',
        'X-Title': 'Oceep AI'
      },
      body: JSON.stringify({
        model: config.model,
        messages: finalMessages,
        max_tokens: 2048,
        temperature: 0.7
      })
    }, 60000);

    if (!modelRes.ok) {
      const errorText = await modelRes.text();
      let errorMsg = `Model Error (${modelRes.status})`;

      try {
        const errJson = JSON.parse(errorText);
        errorMsg = errJson.error?.message || errJson.message || errorText;
      } catch (e) {
        errorMsg = errorText.slice(0, 500);
      }

      debug.steps.push({ model_error: errorMsg });
      throw new Error(`OpenRouter Error: ${errorMsg}`);
    }

    const data = await modelRes.json();
    let answer = data?.choices?.[0]?.message?.content || '';

    if (!answer) {
      throw new Error('Empty response from model');
    }

    answer = cleanResponse(answer);

    // --- STEP 5: BUILD RESPONSE ---
    const response = {
      content: answer,
      toolUsed,
      debug: env.DEBUG_MODE === 'true' ? debug : undefined
    };

    if (searchResult) {
      response.searchMeta = {
        hasAIResponse: !!searchResult.aiResponse,
        sourceCount: searchResult.references.length,
        hasLocalResults: searchResult.localResults.length > 0,
        hasShoppingResults: searchResult.shoppingResults.length > 0
      };
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('Handler Error:', err);

    return new Response(JSON.stringify({
      error: err.message || 'Internal Server Error',
      stack: env.DEBUG_MODE === 'true' ? err.stack : undefined
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// ----------------------------
// 5. GET Request Handler
// ----------------------------
export async function onRequestGet(context) {
  return new Response(JSON.stringify({
    status: 'ok',
    message: 'Oceep API is running',
    version: '2.0',
    features: ['Google AI Mode Search', 'Smart Router']
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
