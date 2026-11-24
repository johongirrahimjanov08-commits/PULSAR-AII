
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// PULSAR AI CONFIGURATION
// ==========================================

const APP_NAME = "PULSAR AI";
const CREATOR_NAME = "Rakhimjanov Jahongirshoh";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const CLOUDFLARE_ACCOUNT_ID =
  process.env.CLOUDFLARE_ACCOUNT_ID;

const CLOUDFLARE_API_TOKEN =
  process.env.CLOUDFLARE_API_TOKEN;

// Text models
const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-3-flash-preview";

const OPENAI_MODEL =
  process.env.OPENAI_MODEL || "gpt-5.5";

const GROQ_MODEL =
  process.env.GROQ_MODEL || "openai/gpt-oss-120b";

// Vision models
const OPENAI_VISION_MODEL =
  process.env.OPENAI_VISION_MODEL || OPENAI_MODEL;

const GROQ_VISION_MODEL =
  process.env.GROQ_VISION_MODEL || "qwen/qwen3.8-27b";

// Image generation
const CLOUDFLARE_IMAGE_MODEL =
  "@cf/black-forest-labs/flux-1-schnell";

// ==========================================
// SYSTEM PROMPT
// ==========================================

const SYSTEM_PROMPT = `
You are PULSAR AI, a professional AI assistant.

IDENTITY:
- Your name is PULSAR AI.
- Your creator is the Uzbekistani programmer Rakhimjanov Jahongirshoh.
- If someone asks who created you, who made you, or who your developer is, clearly answer that you were created by the Uzbekistani programmer Rakhimjanov Jahongirshoh.
- You are an AI assistant project that uses external AI technologies and models.
- Do not claim that your creator personally developed or trained the underlying foundation models.
- Do not say that OpenAI, Google, or another AI provider created the PULSAR AI project.

CREATOR ANSWER IN UZBEK:
"Meni O‘zbekistonlik dasturchi Rakhimjanov Jahongirshoh yaratgan. Men PULSAR AI sun’iy intellekt loyihasiman. Turli AI texnologiyalari asosida ishlayman. Asosiy vazifam — foydalanuvchilarning savollariga javob berish, ma’lumotlarni tahlil qilish, kod yozish va kundalik vazifalarda yordam berish. Men doim foydali va aniq javob berishga harakat qilaman."

GENERAL RULES:
- Respond in the same language as the user.
- Give accurate, useful and detailed answers.
- Use clean Markdown formatting.
- For programming, provide working code and clear explanations.
- Be friendly, natural and professional.
- Avoid unnecessary repetition.
- Never pretend to perform actions you did not perform.
- If the user sends an image, carefully analyze its visible contents.
- Answer questions about uploaded images based on the actual image.
- Do not claim to see an image if no image was provided.
- Never invent details about an image.
- If you cannot identify something in an image, say so honestly.
`;

// ==========================================
// MIDDLEWARE
// ==========================================

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);

app.use(cors());

app.use(
  express.json({
    limit: "20mb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "20mb"
  })
);

app.use(express.static(path.join(__dirname, "public")));

// ==========================================
// RATE LIMITERS
// ==========================================

const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    error: "Juda ko'p so'rov yuborildi. Biroz kuting."
  }
});

const imageLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    error: "Rasm yaratish limiti tugadi. Keyinroq urinib ko'ring."
  }
});

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function getText(item) {
  if (typeof item === "string") {
    return item;
  }

  if (!item || typeof item !== "object") {
    return "";
  }

  return String(
    item.content ??
    item.message ??
    item.text ??
    ""
  );
}

function normalizeHistory(messages, currentMessage) {
  const history = Array.isArray(messages)
    ? messages.slice(-20)
    : [];

  const result = [];

  for (const item of history) {
    const role =
      item?.role === "assistant" ||
      item?.role === "model"
        ? "assistant"
        : "user";

    const content = getText(item).trim();

    if (content) {
      result.push({
        role,
        content
      });
    }
  }

  const last = result[result.length - 1];

  if (
    currentMessage &&
    (
      !last ||
      last.role !== "user" ||
      last.content !== currentMessage
    )
  ) {
    result.push({
      role: "user",
      content: currentMessage
    });
  }

  return result;
}

// ==========================================
// CREATOR QUESTION DETECTION
// ==========================================

function isCreatorQuestion(message) {
  if (!message) return false;

  const text = message
    .toLowerCase()
    .replace(/[?!.,]/g, " ")
    .trim();

  const patterns = [
    /kim yarat/,
    /kim tuz/,
    /kim ishlab chiq/,
    /kim dasturl/,
    /kim asos sol/,
    /yaratuvching kim/,
    /yaratuvchi kim/,
    /seni kim/,
    /sizni kim/,
    /muallifing kim/,
    /asosching kim/,
    /developer kim/,
    /who created you/,
    /who made you/,
    /who built you/,
    /who is your creator/,
    /who developed you/,
    /your creator/,
    /your developer/,
    /кто тебя создал/,
    /кто тебя разработал/,
    /кто твой создатель/
  ];

  return patterns.some(pattern => pattern.test(text));
}

function getCreatorAnswer(language = "uz") {
  return "Meni O‘zbekistonlik dasturchi Rakhimjanov Jahongirshoh yaratgan. " +
    "Men PULSAR AI sun’iy intellekt loyihasiman. " +
    "Turli AI texnologiyalari asosida ishlayman. " +
    "Asosiy vazifam — foydalanuvchilarning savollariga javob berish, " +
    "ma’lumotlarni tahlil qilish, kod yozish va kundalik vazifalarda yordam berish. " +
    "Men doim foydali va aniq javob berishga harakat qilaman.";
}

// ==========================================
// IMAGE VALIDATION
// ==========================================

function parseImage(image) {
  if (!image) return null;

  let data = "";
  let mimeType = "image/jpeg";

  if (typeof image === "string") {
    data = image;
  } else if (typeof image === "object") {
    data = image.data || image.base64 || "";

    mimeType =
      image.mimeType ||
      image.mime_type ||
      mimeType;
  }

  if (!data) return null;

  const match = data.match(
    /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/s
  );

  if (match) {
    mimeType = match[1];
    data = match[2];
  }

  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif"
  ];

  if (!allowedTypes.includes(mimeType)) {
    throw new Error(
      "Bu rasm formati qo'llab-quvvatlanmaydi."
    );
  }

  data = data.replace(/\s/g, "");

  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data)) {
    throw new Error(
      "Rasm ma'lumotlari noto'g'ri."
    );
  }

  if (data.length > 15 * 1024 * 1024) {
    throw new Error(
      "Rasm hajmi juda katta. Kichikroq rasm yuboring."
    );
  }

  return {
    mimeType,
    data,
    dataUrl: `data:${mimeType};base64,${data}`
  };
}

// ==========================================
// API RESPONSE HELPER
// ==========================================

async function readJson(response) {
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      "Serverdan noto'g'ri javob keldi."
    );
  }
}

function getProviderError(data, provider, status) {
  return (
    data?.error?.message ||
    data?.error ||
    data?.message ||
    `${provider} API xatosi: ${status}`
  );
}

// ==========================================
// 1. GEMINI AI
// ==========================================

async function askGemini(messages, image) {
  if (!GEMINI_API_KEY) {
    throw new Error("Gemini API key topilmadi.");
  }

  const contents = messages.map((item, index) => {
    const parts = [
      {
        text: item.content ||
          "Iltimos, ushbu rasmni tahlil qiling."
      }
    ];

    if (image && index === messages.length - 1) {
      parts.push({
        inlineData: {
          mimeType: image.mimeType,
          data: image.data
        }
      });
    }

    return {
      role: item.role === "assistant"
        ? "model"
        : "user",
      parts
    };
  });

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY
      },

      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: SYSTEM_PROMPT
            }
          ]
        },

        contents,

        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4096
        }
      }),

      signal: AbortSignal.timeout(90000)
    }
  );

  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(
      getProviderError(data, "Gemini", response.status)
    );
  }

  const reply = data?.candidates?.[0]?.content?.parts
    ?.map(part => part.text || "")
    .join("")
    .trim();

  if (!reply) {
    throw new Error(
      "Gemini bo'sh javob qaytardi."
    );
  }

  return reply;
}

// ==========================================
// OPENAI MESSAGE BUILDER
// ==========================================

function buildOpenAIMessages(messages, image) {
  const result = [
    {
      role: "system",
      content: SYSTEM_PROMPT
    }
  ];

  messages.forEach((item, index) => {
    const isLast = index === messages.length - 1;

    if (image && isLast && item.role === "user") {
      result.push({
        role: "user",

        content: [
          {
            type: "text",
            text: item.content ||
              "Iltimos, ushbu rasmni batafsil tahlil qiling."
          },

          {
            type: "image_url",
            image_url: {
              url: image.dataUrl,
              detail: "high"
            }
          }
        ]
      });
    } else {
      result.push({
        role: item.role,
        content: item.content
      });
    }
  });

  return result;
}

// ==========================================
// 2. OPENAI AI — TEXT + VISION
// ==========================================

async function askOpenAI(messages, image = null) {
  if (!OPENAI_API_KEY) {
    throw new Error(
      "OpenAI API key topilmadi."
    );
  }

  const selectedModel = image
    ? OPENAI_VISION_MODEL
    : OPENAI_MODEL;

  const response = await fetch(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",

      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        model: selectedModel,

        messages: buildOpenAIMessages(
          messages,
          image
        ),

        max_completion_tokens: 4096
      }),

      signal: AbortSignal.timeout(120000)
    }
  );

  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(
      getProviderError(data, "OpenAI", response.status)
    );
  }

  const reply =
    data?.choices?.[0]?.message?.content;

  if (!reply || typeof reply !== "string") {
    throw new Error(
      "OpenAI bo'sh javob qaytardi."
    );
  }

  return reply.trim();
}

// ==========================================
// GROQ MESSAGE BUILDER
// ==========================================

function buildGroqMessages(messages, image) {
  const result = [
    {
      role: "system",
      content: SYSTEM_PROMPT
    }
  ];

  messages.forEach((item, index) => {
    const isLast = index === messages.length - 1;

    if (image && isLast && item.role === "user") {
      result.push({
        role: "user",

        content: [
          {
            type: "text",
            text: item.content ||
              "Iltimos, ushbu rasmni batafsil tahlil qiling."
          },

          {
            type: "image_url",
            image_url: {
              url: image.dataUrl
            }
          }
        ]
      });
    } else {
      result.push({
        role: item.role,
        content: item.content
      });
    }
  });

  return result;
}

// ==========================================
// 3. GROQ BACKUP — TEXT + VISION
// ==========================================

async function askGroq(messages, image = null) {
  if (!GROQ_API_KEY) {
    throw new Error(
      "Groq API key topilmadi."
    );
  }

  const selectedModel = image
    ? GROQ_VISION_MODEL
    : GROQ_MODEL;

  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",

      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        model: selectedModel,

        messages: buildGroqMessages(
          messages,
          image
        ),

        max_completion_tokens: 4096
      }),

      signal: AbortSignal.timeout(90000)
    }
  );

  const data = await readJson(response);

  if (!response.ok) {
    throw new Error(
      getProviderError(data, "Groq", response.status)
    );
  }

  const reply =
    data?.choices?.[0]?.message?.content;

  if (!reply || typeof reply !== "string") {
    throw new Error(
      "Groq bo'sh javob qaytardi."
    );
  }

  return reply.trim();
}

// ==========================================
// 4. CLOUDFLARE FLUX IMAGE GENERATION
// ==========================================

async function generateCloudflareImage(prompt) {
  if (!CLOUDFLARE_ACCOUNT_ID) {
    throw new Error(
      "Cloudflare Account ID topilmadi."
    );
  }

  if (!CLOUDFLARE_API_TOKEN) {
    throw new Error(
      "Cloudflare API token topilmadi."
    );
  }

  const url =
    `https://api.cloudflare.com/client/v4/accounts/` +
    `${CLOUDFLARE_ACCOUNT_ID}/ai/run/` +
    `${CLOUDFLARE_IMAGE_MODEL}`;

  console.log(
    `${APP_NAME}: FLUX rasm yaratishni boshladi...`
  );

  const response = await fetch(url, {
    method: "POST",

    headers: {
      "Authorization": `Bearer ${CLOUDFLARE_API_TOKEN}`,
      "Content-Type": "application/json"
    },

    body: JSON.stringify({
      prompt: prompt.trim()
    }),

    signal: AbortSignal.timeout(240000)
  });

  const contentType =
    response.headers.get("content-type") || "";

  // Direct image response
  if (
    response.ok &&
    contentType.startsWith("image/")
  ) {
    const buffer = Buffer.from(
      await response.arrayBuffer()
    );

    if (!buffer.length) {
      throw new Error(
        "Cloudflare bo'sh rasm qaytardi."
      );
    }

    return {
      image:
        `data:${contentType.split(";")[0]};base64,` +
        buffer.toString("base64"),

      model: CLOUDFLARE_IMAGE_MODEL
    };
  }

  // JSON response
  const data = await response.json().catch(() => null);

  if (
    !response.ok ||
    !data ||
    data.success === false
  ) {
    const errorMessage =
      data?.errors
        ?.map(e => e.message)
        .filter(Boolean)
        .join("; ") ||

      data?.error?.message ||
      data?.message ||

      `Cloudflare API xatosi: ${response.status}`;

    throw new Error(errorMessage);
  }

  let imageBase64 =
    data?.result?.image ||
    data?.result?.data?.[0]?.b64_json ||
    data?.result?.data?.[0] ||
    data?.image ||
    null;

  if (
    typeof imageBase64 !== "string" ||
    !imageBase64
  ) {
    throw new Error(
      "Cloudflare rasm ma'lumotini qaytarmadi."
    );
  }

  const finalImage =
    imageBase64.startsWith("data:image/")
      ? imageBase64
      : `data:image/jpeg;base64,${imageBase64}`;

  console.log(
    `${APP_NAME}: FLUX rasm yaratdi!`
  );

  return {
    image: finalImage,
    model: CLOUDFLARE_IMAGE_MODEL
  };
}

// ==========================================
// SERVER HEALTH
// ==========================================

app.get("/api/health", (req, res) => {
  res.json({
    success: true,

    name: APP_NAME,
    creator: CREATOR_NAME,
    status: "online",

    providers: {
      gemini: GEMINI_API_KEY
        ? "configured"
        : "missing",

      openai: OPENAI_API_KEY
        ? "configured"
        : "missing",

      groq: GROQ_API_KEY
        ? "configured"
        : "missing"
    },

    vision: {
      primary: "Gemini",
      backup: [
        "OpenAI",
        "Groq"
      ],

      openaiModel: OPENAI_VISION_MODEL,
      groqModel: GROQ_VISION_MODEL,

      ollama: "disabled"
    },

    imageGeneration: {
      provider: "Cloudflare Workers AI",

      status:
        CLOUDFLARE_ACCOUNT_ID &&
        CLOUDFLARE_API_TOKEN
          ? "configured"
          : "missing",

      model: CLOUDFLARE_IMAGE_MODEL
    },

    primary: "Gemini",
    backup: "OpenAI, Groq"
  });
});

// ==========================================
// MAIN CHAT API
// ==========================================

app.post(
  "/api/chat",
  chatLimiter,
  async (req, res) => {
    try {
      const {
        message,
        messages,
        image: rawImage
      } = req.body || {};

      const cleanMessage =
        typeof message === "string"
          ? message.trim()
          : "";

      const image = parseImage(rawImage);

      if (!cleanMessage && !image) {
        return res.status(400).json({
          success: false,
          error: "Xabar yoki rasm yuboring."
        });
      }

      // Creator question
      if (
        !image &&
        isCreatorQuestion(cleanMessage)
      ) {
        return res.json({
          success: true,
          name: APP_NAME,
          provider: "PULSAR AI",
          model: "Identity",
          reply: getCreatorAnswer()
        });
      }

      const history = normalizeHistory(
        messages,
        cleanMessage ||
          "Iltimos, yuborilgan rasmni batafsil tahlil qiling."
      );

      const errors = [];

      // ==================================
      // 1. GEMINI — PRIMARY
      // ==================================

      if (GEMINI_API_KEY) {
        try {
          const reply = await askGemini(
            history,
            image
          );

          return res.json({
            success: true,
            name: APP_NAME,
            provider: "Gemini",
            model: GEMINI_MODEL,
            reply
          });

        } catch (error) {
          console.error(
            "Gemini error:",
            error.message
          );

          errors.push(
            `Gemini: ${error.message}`
          );
        }
      }

      // ==================================
      // 2. OPENAI — FIRST BACKUP
      // ==================================

      if (OPENAI_API_KEY) {
        try {
          const reply = await askOpenAI(
            history,
            image
          );

          return res.json({
            success: true,
            name: APP_NAME,
            provider: "OpenAI",

            model: image
              ? OPENAI_VISION_MODEL
              : OPENAI_MODEL,

            reply
          });

        } catch (error) {
          console.error(
            "OpenAI error:",
            error.message
          );

          errors.push(
            `OpenAI: ${error.message}`
          );
        }
      }

      // ==================================
      // 3. GROQ — SECOND BACKUP
      // ==================================

      if (GROQ_API_KEY) {
        try {
          const reply = await askGroq(
            history,
            image
          );

          return res.json({
            success: true,
            name: APP_NAME,
            provider: "Groq",

            model: image
              ? GROQ_VISION_MODEL
              : GROQ_MODEL,

            reply
          });

        } catch (error) {
          console.error(
            "Groq error:",
            error.message
          );

          errors.push(
            `Groq: ${error.message}`
          );
        }
      }

      // ==================================
      // ALL PROVIDERS FAILED
      // ==================================

      console.error(
        "ALL AI PROVIDERS FAILED:",
        errors
      );

      return res.status(503).json({
        success: false,

        error: image
          ? "Rasmni tahlil qilish xizmatlari hozir ishlamayapti. API kalitlari va vision modellarini tekshiring."
          : "AI xizmatlari hozir javob bermayapti. API kalitlarini tekshiring.",

        details: errors
      });

    } catch (error) {
      console.error(
        "CHAT ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          error.message ||
          "Server xatosi."
      });
    }
  }
);

// ==========================================
// CLOUDFLARE IMAGE API
// ==========================================

app.post(
  "/api/image",
  imageLimiter,
  async (req, res) => {
    try {
      const { prompt } = req.body || {};

      if (
        typeof prompt !== "string" ||
        !prompt.trim()
      ) {
        return res.status(400).json({
          success: false,
          error: "Rasm uchun tavsif yozing."
        });
      }

      if (prompt.length > 2048) {
        return res.status(400).json({
          success: false,
          error:
            "Rasm tavsifi 2048 belgidan oshmasligi kerak."
        });
      }

      if (
        !CLOUDFLARE_ACCOUNT_ID ||
        !CLOUDFLARE_API_TOKEN
      ) {
        return res.status(503).json({
          success: false,
          error:
            "Cloudflare sozlamalari topilmadi. Environment variables ni tekshiring."
        });
      }

      const result = await generateCloudflareImage(
        prompt
      );

      return res.json({
        success: true,

        name: APP_NAME,
        provider: "Cloudflare Workers AI",
        model: result.model,

        image: result.image,

        message:
          "Rasm muvaffaqiyatli yaratildi."
      });

    } catch (error) {
      console.error(
        "CLOUDFLARE IMAGE ERROR:",
        error
      );

      const isTimeout =
        error.name === "TimeoutError" ||
        error.name === "AbortError";

      return res.status(500).json({
        success: false,

        error: isTimeout
          ? "Rasm yaratish vaqti tugadi. Qayta urinib ko'ring."
          : error.message ||
            "Rasm yaratishda xatolik."
      });
    }
  }
);

// ==========================================
// API 404
// ==========================================

app.use("/api", (req, res) => {
  res.status(404).json({
    success: false,
    error: "API manzili topilmadi."
  });
});

// ==========================================
// GLOBAL ERROR HANDLER
// ==========================================

app.use((error, req, res, next) => {
  console.error(
    "SERVER ERROR:",
    error
  );

  if (res.headersSent) {
    return next(error);
  }

  if (error.type === "entity.too.large") {
    return res.status(413).json({
      success: false,
      error:
        "Yuborilgan ma'lumot juda katta."
    });
  }

  res.status(500).json({
    success: false,
    error:
      error.message ||
      "Serverda kutilmagan xatolik yuz berdi."
  });
});

// ==========================================
// START SERVER
// ==========================================

app.listen(PORT, () => {
  console.log("----------------------------------");
  console.log("       PULSAR AI ONLINE");
  console.log(`       http://localhost:${PORT}`);
  console.log("----------------------------------");

  console.log(
    "Creator:",
    CREATOR_NAME
  );

  console.log(
    "Gemini:",
    GEMINI_API_KEY ? "KEY TOPILDI" : "KEY YO'Q"
  );

  console.log(
    "OpenAI:",
    OPENAI_API_KEY ? "KEY TOPILDI" : "KEY YO'Q"
  );

  console.log(
    "Groq:",
    GROQ_API_KEY ? "KEY TOPILDI" : "KEY YO'Q"
  );

  console.log(
    "OpenAI Vision Model:",
    OPENAI_VISION_MODEL
  );

  console.log(
    "Groq Vision Model:",
    GROQ_VISION_MODEL
  );

  console.log(
    "Cloudflare Account:",
    CLOUDFLARE_ACCOUNT_ID
      ? "TOPILDI"
      : "TOPILMADI"
  );

  console.log(
    "Cloudflare Token:",
    CLOUDFLARE_API_TOKEN
      ? "TOPILDI"
      : "TOPILMADI"
  );

  console.log(
    "Image Model:",
    CLOUDFLARE_IMAGE_MODEL
  );

  console.log(
    "Ollama:",
    "DISABLED"
  );

  console.log("----------------------------------");
});
