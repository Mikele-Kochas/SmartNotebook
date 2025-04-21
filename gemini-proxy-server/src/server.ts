import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold, Content } from '@google/generative-ai';
import fs from 'fs'; // Import Node.js fs module
import path from 'path'; // Import Node.js path module

// --- Log directory contents ---
try {
  const files = fs.readdirSync(process.cwd());
  console.log("Files in current directory:", files);
} catch (err) {
  console.error("Error reading directory:", err);
}

// --- Check if .env file exists from Node.js perspective ---
const envPath = path.resolve(process.cwd(), '.env');
const envExists = fs.existsSync(envPath);
console.log(`Checking for .env file at: ${envPath}`);
console.log(`.env file exists? ${envExists}`);

// --- Explicitly call dotenv.config() and log the result ---
// Pass the explicit path to dotenv.config()
const dotenvResult = dotenv.config({ path: envPath }); 
console.log("Dotenv config result:", dotenvResult); 

// --- Log the key immediately after trying to load it ---
console.log("GEMINI_API_KEY from process.env:", process.env.GEMINI_API_KEY);

const app = express();
const port = process.env.PORT || 3000; // Użyj portu z .env lub domyślnie 3000

// --- Konfiguracja Gemini ---
const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error("GEMINI_API_KEY is not set in the environment variables.");
  process.exit(1); // Zakończ proces, jeśli brakuje klucza API
}

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash" // Możesz wybrać inny model
});

// --- Konfiguracja bezpieczeństwa (przykład) ---
// Można dostosować w zależności od potrzeb
const generationConfig = {
  temperature: 0.7,
  topP: 0.95,
  topK: 64,
  maxOutputTokens: 8192,
  responseMimeType: 'text/plain',
};

const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

// --- Middleware ---

// Explicit CORS Configuration
const allowedOrigins = [
    'capacitor://localhost', 
    'ionic://localhost', 
    'http://localhost', 
    'http://localhost:8100' // Default Ionic serve port
    // Add any other origins if needed (e.g., custom dev server port)
];

const corsOptions: cors.CorsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl) or from allowed origins
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.warn(`CORS: Blocked origin: ${origin}`); // Log blocked origins
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true
};

app.use(cors(corsOptions)); // Use specific CORS options

// Fallback for preflight requests (OPTIONS method)
app.options('*', cors(corsOptions));

app.use(express.json()); // Parse JSON request bodies (should be after CORS)

// --- Typy ---
interface ReviseRequestBody {
  content: string;
  mode: "light" | "deep" | "custom";
  prompt?: string;
}

interface NoteInput {
    id?: number; // ID might not be needed by Gemini but good for context
    title?: string;
    content: string;
}

interface SynthesizeRequestBody {
  notes: NoteInput[];
  mode: "coherent_text" | "summary" | "custom";
  prompt?: string;
}

// --- Helper Function to Call Gemini (simplified for clarity) ---
async function callGemini(prompt: string): Promise<string> {
  try {
    console.log("Calling Gemini API...");
    const result = await model.generateContent(
        [{ text: prompt }],
        // Pass generationConfig and safetySettings if needed
    );
    const response = result.response;
    if (response && response.candidates && response.candidates[0].content) {
        console.log("Gemini API call successful.");
        return response.candidates[0].content.parts[0].text || '';
    } else {
        console.error("Gemini response was blocked or invalid:", response?.promptFeedback);
        let blockReason = "Response blocked due to safety settings or other reasons.";
        if (response?.promptFeedback?.blockReason) {
            blockReason = `Response blocked due to: ${response.promptFeedback.blockReason}`;
        }
        throw new Error(blockReason);
    }
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    throw new Error("An error occurred while communicating with Gemini.");
  }
}

// --- Endpoint: /revise ---
app.post('/revise', async (req: Request<{}, {}, ReviseRequestBody>, res: Response): Promise<void> => {
  const { content, mode, prompt } = req.body;

  if (!content || !mode) {
    res.status(400).json({ error: "Missing 'content' or 'mode' in request body." });
    return; 
  }
  if (mode === "custom" && !prompt) {
    res.status(400).json({ error: "Missing 'prompt' for custom mode." });
    return;
  }

  console.log(`[${new Date().toISOString()}] /revise request received (mode: ${mode})`);

  try {
    const finalPrompt = constructRevisePrompt(content, mode, prompt);
    const revisedContent = await callGemini(finalPrompt);
    res.status(200).json({ revisedContent });
    console.log(`[${new Date().toISOString()}] /revise request successful`);
  } catch (error: any) {
    console.error(`[${new Date().toISOString()}] /revise error:`, error.message);
    res.status(500).json({ error: 'Błąd podczas redakcji przez Gemini.', details: error.message });
  }
});

// --- Endpoint: /synthesize (ADDING THIS BACK) ---
app.post('/synthesize', async (req: Request<{}, {}, SynthesizeRequestBody>, res: Response): Promise<void> => {
  const { notes, mode, prompt: customPrompt } = req.body;

  // --- Validation ---
  if (!notes || !Array.isArray(notes) || notes.length < 2) {
    res.status(400).json({ error: 'Missing or invalid notes array (minimum 2 notes required)' });
    return;
  }
  const validModes = ['coherent_text', 'summary', 'custom'];
  if (!mode || !validModes.includes(mode)) {
    res.status(400).json({ error: `Invalid or missing mode. Valid modes are: ${validModes.join(', ')}` });
    return;
  }
  if (mode === 'custom' && (!customPrompt || customPrompt.trim() === '')) {
    res.status(400).json({ error: 'Missing prompt for custom mode' });
    return;
  }
  // Basic check if notes have content
  if (notes.some(note => typeof note.content !== 'string')) {
     res.status(400).json({ error: 'All notes in the array must have a content property (string).' });
    return;
  }

  console.log(`[${new Date().toISOString()}] /synthesize request received (mode: ${mode}, notes: ${notes.length})`);

  try {
    // --- Construct Prompt ---
    const finalPrompt = constructSynthesisPrompt(notes, mode, customPrompt);
    
    // --- Call Gemini ---
    const synthesizedContent = await callGemini(finalPrompt);

    // --- Send Response ---
    res.status(200).json({ synthesizedContent });
    console.log(`[${new Date().toISOString()}] /synthesize request successful`);

  } catch (error: any) {
    console.error(`[${new Date().toISOString()}] /synthesize error:`, error.message);
    res.status(500).json({ error: 'Błąd podczas syntezy przez Gemini.', details: error.message });
  }
});

// --- Uruchomienie serwera ---
app.listen(port, () => {
  console.log(`Gemini Proxy Server listening on port ${port}`);
});

// --- Funkcje pomocnicze do konstrukcji promptów ---
function constructRevisePrompt(content: string, mode: string, customPrompt?: string): string {
    let basePrompt = "";
    switch (mode) {
      case "light":
        basePrompt = "Popraw poniższy tekst pod kątem błędów gramatycznych, ortograficznych i interpunkcyjnych. Zachowaj oryginalny sens i styl. Odpowiedz tylko zredagowanym tekstem, bez żadnych dodatkowych komentarzy czy wstępów.\n\nTekst:\n";
        break;
      case "deep":
        basePrompt = "Przeredaguj poniższy tekst, poprawiając jego strukturę, styl i płynność. Popraw wszelkie błędy. Celem jest uzyskanie bardziej klarownego i profesjonalnego tekstu. Odpowiedz tylko zredagowanym tekstem, bez żadnych dodatkowych komentarzy czy wstępów.\n\nTekst:\n";
        break;
      case "custom":
        if (!customPrompt) throw new Error("Custom prompt is required for custom mode.");
        basePrompt = `${customPrompt}\nOdpowiedz tylko wynikiem działania polecenia na poniższym tekście, bez żadnych dodatkowych komentarzy czy wstępów.\n\nTekst:\n`;
        break;
      default:
        console.warn(`Unknown revision mode: ${mode}. Using fallback prompt.`);
        basePrompt = 'Oto tekst:\n'; // Fallback or throw error
    }
    return `${basePrompt}${content}`;
}

function constructSynthesisPrompt(notes: NoteInput[], mode: string, customPrompt?: string): string {
  const formattedNotes = notes.map((note, index) => {
    let noteString = `--- Notatka ${index + 1} ---\n`;
    if (note.title && note.title.trim() !== '') {
      noteString += `Tytuł: ${note.title}\n`;
    }
    noteString += `Treść:\n${note.content}\n`;
    return noteString;
  }).join('\n\n'); // Separate notes clearly

  let basePrompt = '';
  const instruction = "\n\nZwróć *wyłącznie* czysty tekst wyniku, bez żadnego formatowania Markdown, znaczników kodu (np. ```), nagłówków, punktorów (chyba, że jest to podsumowanie w punktach) ani dodatkowych wyjaśnień."

  switch (mode) {
    case 'coherent_text':
      basePrompt = `Przeanalizuj poniższe notatki i stwórz jeden spójny tekst, który łączy ich główne myśli i informacje. Zachowaj logiczny przepływ i postaraj się płynnie przejść między tematami z różnych notatek.${instruction}\n\nOto notatki:\n\n`;
      break;
    case 'summary':
      basePrompt = `Przeanalizuj poniższe notatki i stwórz zwięzłe podsumowanie (np. w formie listy punktowanej lub krótkich akapitów), które oddaje najważniejsze informacje i kluczowe punkty ze wszystkich notatek.${instruction}\n\nOto notatki:\n\n`;
      break;
    case 'custom':
      if (!customPrompt) throw new Error("Custom prompt is required for custom mode.");
      basePrompt = `${customPrompt}${instruction}\n\nOto notatki, do których odnosi się polecenie:\n\n`;
      break;
    default:
        console.warn(`Unknown synthesis mode: ${mode}. Using fallback prompt.`);
        basePrompt = `Oto notatki:\n\n`; // Fallback or throw error
  }
  return `${basePrompt}${formattedNotes}`; 
} 