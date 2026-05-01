require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const rateLimit = require('express-rate-limit');
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();

app.use(helmet({
    contentSecurityPolicy: false,
}));
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { error: 'تم تجاوز الحد المسموح من الطلبات' }
});
app.use('/api', limiter);

app.use(express.static('public'));

let userApiKeys = {
    openai: process.env.OPENAI_API_KEY || '',
    gemini: process.env.GEMINI_API_KEY || ''
};

async function chatWithOpenAI(messages, apiKey) {
    try {
        const openai = new OpenAI({ apiKey: apiKey });
        const completion = await openai.chat.completions.create({
            model: 'gpt-4-turbo-preview',
            messages: messages,
            temperature: 0.7,
        });
        return { success: true, response: completion.choices[0].message.content };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function chatWithGemini(message, apiKey) {
    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
        const result = await model.generateContent(message);
        const response = await result.response;
        return { success: true, response: response.text() };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function generateImage(prompt, apiKey) {
    try {
        const openai = new OpenAI({ apiKey: apiKey });
        const response = await openai.images.generate({
            model: 'dall-e-3',
            prompt: prompt,
            n: 1,
            size: '1024x1024',
            quality: 'hd',
        });
        return { success: true, imageUrl: response.data[0].url };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function summarizeText(text, apiKey) {
    try {
        const openai = new OpenAI({ apiKey: apiKey });
        const completion = await openai.chat.completions.create({
            model: 'gpt-4-turbo-preview',
            messages: [
                { role: 'system', content: 'أنت خبير في تلخيص النصوص. قم بتلخيص النص التالي بشكل احترافي وموجز.' },
                { role: 'user', content: text }
            ],
            temperature: 0.5,
        });
        return { success: true, summary: completion.choices[0].message.content };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function translateText(text, targetLang, apiKey) {
    try {
        const openai = new OpenAI({ apiKey: apiKey });
        const completion = await openai.chat.completions.create({
            model: 'gpt-4-turbo-preview',
            messages: [
                { role: 'system', content: `أنت مترجم محترف. ترجم النص التالي إلى اللغة ${targetLang} بدقة واحترافية.` },
                { role: 'user', content: text }
            ],
            temperature: 0.3,
        });
        return { success: true, translation: completion.choices[0].message.content };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function generateCode(description, language, apiKey) {
    try {
        const openai = new OpenAI({ apiKey: apiKey });
        const completion = await openai.chat.completions.create({
            model: 'gpt-4-turbo-preview',
            messages: [
                { role: 'system', content: `أنت مطور محترف. اكتب كود ${language} احترافي يحقق المتطلبات. قدم الكود مع شرح موجز.` },
                { role: 'user', content: description }
            ],
            temperature: 0.5,
        });
        return { success: true, code: completion.choices[0].message.content };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function generateIdeas(field, apiKey) {
    try {
        const openai = new OpenAI({ apiKey: apiKey });
        const completion = await openai.chat.completions.create({
            model: 'gpt-4-turbo-preview',
            messages: [
                { role: 'system', content: `أنت خبير ابتكار. قدم 5 أفكار مشاريع مبتكرة ومربحة في مجال ${field} مع شرح مفصل لكل فكرة.` },
                { role: 'user', content: field }
            ],
            temperature: 0.8,
        });
        return { success: true, ideas: completion.choices[0].message.content };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

app.post('/api/save-keys', (req, res) => {
    const { openai, gemini } = req.body;
    if (openai) userApiKeys.openai = openai;
    if (gemini) userApiKeys.gemini = gemini;
    res.json({ success: true, message: 'تم حفظ المفاتيح بنجاح' });
});

app.get('/api/get-keys', (req, res) => {
    res.json({
        success: true,
        keys: {
            hasOpenAI: !!userApiKeys.openai,
            hasGemini: !!userApiKeys.gemini
        }
    });
});

app.post('/api/chat', async (req, res) => {
    const { message, provider } = req.body;
    const apiKey = userApiKeys[provider];
    
    if (!apiKey) {
        return res.status(400).json({ error: `يرجى إدخال مفتاح API لخدمة ${provider}` });
    }
    
    let result;
    if (provider === 'openai') {
        result = await chatWithOpenAI([{ role: 'user', content: message }], apiKey);
    } else if (provider === 'gemini') {
        result = await chatWithGemini(message, apiKey);
    } else {
        return res.status(400).json({ error: 'مزود خدمة غير معروف' });
    }
    
    if (result.success) {
        res.json({ response: result.response });
    } else {
        res.status(500).json({ error: result.error });
    }
});

app.post('/api/generate-image', async (req, res) => {
    const { prompt } = req.body;
    const apiKey = userApiKeys.openai;
    
    if (!apiKey) {
        return res.status(400).json({ error: 'يرجى إدخال مفتاح OpenAI API' });
    }
    
    const result = await generateImage(prompt, apiKey);
    if (result.success) {
        res.json({ imageUrl: result.imageUrl });
    } else {
        res.status(500).json({ error: result.error });
    }
});

app.post('/api/summarize', async (req, res) => {
    const { text } = req.body;
    const apiKey = userApiKeys.openai;
    
    if (!apiKey) {
        return res.status(400).json({ error: 'يرجى إدخال مفتاح OpenAI API' });
    }
    
    const result = await summarizeText(text, apiKey);
    if (result.success) {
        res.json({ summary: result.summary });
    } else {
        res.status(500).json({ error: result.error });
    }
});

app.post('/api/translate', async (req, res) => {
    const { text, targetLang } = req.body;
    const apiKey = userApiKeys.openai;
    
    if (!apiKey) {
        return res.status(400).json({ error: 'يرجى إدخال مفتاح OpenAI API' });
    }
    
    const result = await translateText(text, targetLang, apiKey);
    if (result.success) {
        res.json({ translation: result.translation });
    } else {
        res.status(500).json({ error: result.error });
    }
});

app.post('/api/generate-code', async (req, res) => {
    const { description, language } = req.body;
    const apiKey = userApiKeys.openai;
    
    if (!apiKey) {
        return res.status(400).json({ error: 'يرجى إدخال مفتاح OpenAI API' });
    }
    
    const result = await generateCode(description, language, apiKey);
    if (result.success) {
        res.json({ code: result.code });
    } else {
        res.status(500).json({ error: result.error });
    }
});

app.post('/api/generate-ideas', async (req, res) => {
    const { field } = req.body;
    const apiKey = userApiKeys.openai;
    
    if (!apiKey) {
        return res.status(400).json({ error: 'يرجى إدخال مفتاح OpenAI API' });
    }
    
    const result = await generateIdeas(field, apiKey);
    if (result.success) {
        res.json({ ideas: result.ideas });
    } else {
        res.status(500).json({ error: result.error });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`
    ╔══════════════════════════════════════════════════════╗
    ║                                                      ║
    ║     ✨ منصة يعقوب الفاخرة للذكاء الاصطناعي ✨      ║
    ║                                                      ║
    ║     🚀 http://localhost:${PORT}                        ║
    ║     💎 جاهزة للاستخدام بمظهرها الفاخر                ║
    ║                                                      ║
    ╚══════════════════════════════════════════════════════╝
    `);
});