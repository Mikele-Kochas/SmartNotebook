/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import * as functions from "firebase-functions";
import {GoogleGenerativeAI} from "@google/generative-ai";

// Start writing functions
// https://firebase.google.com/docs/functions/typescript

// export const helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

// --- Konfiguracja Klucza API ---
// 1. Bezpieczna metoda (zalecana): Użyj zmiennych środowiskowych Firebase
//    Uruchom w terminalu (w głównym katalogu projektu, nie w /functions):
//    firebase functions:config:set gemini.apikey="TWOJ_KLUCZ_API_TUTAJ"
//    Następnie odkomentuj poniższą linię i zakomentuj/usuń linię z kluczem na sztywno:
// const API_KEY = functions.config().gemini.apikey;

// 2. Metoda na sztywno (TYLKO DO TESTÓW LOKALNYCH - NIEBEZPIECZNA!):
//    Wklej klucz bezpośrednio tutaj. PAMIĘTAJ, aby nie commitować tego do Git!
const API_KEY = "AIzaSyBRAwnWtISqQzhNjgrEEQcPxtjaeUU6xQo"; // <--- Wklej klucz API z .env TUTAJ (tylko do testów)

if (!API_KEY) {
  console.error("Klucz API Gemini nie jest skonfigurowany.");
  throw new Error("Klucz API Gemini nie jest skonfigurowany.");
}

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({model: "gemini-1.5-flash"}); // Możesz wybrać inny model

/**
 * Typ danych oczekiwanych w ciele żądania POST.
 */
interface ReviseNoteRequestBody {
  content: string;
  mode: "light" | "deep" | "custom";
  prompt?: string;
}

/**
 * Funkcja HTTP Cloud Function do redagowania notatek za pomocą Gemini API.
 */
export const reviseNoteHttp = functions.https.onRequest(async (request, response) => {
  // --- Obsługa CORS ---
  // Ustawienie nagłówków, aby zezwolić na żądania z dowolnego źródła (localhost)
  // W produkcji możesz chcieć ograniczyć to do domeny swojej aplikacji.
  response.set("Access-Control-Allow-Origin", "*");
  response.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.set("Access-Control-Allow-Headers", "Content-Type");

  // Obsługa żądań preflight OPTIONS (wymagane przez CORS)
  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return;
  }

  // --- Walidacja metody i typu zawartości ---
  if (request.method !== "POST") {
    response.status(405).send("Method Not Allowed");
    return;
  }
  if (request.headers["content-type"] !== "application/json") {
    response.status(400).send("Bad Request: Content-Type must be application/json");
    return;
  }

  try {
    const {content, mode, prompt} = request.body as ReviseNoteRequestBody;

    // --- Walidacja danych wejściowych ---
    if (!content || !mode) {
      response.status(400).send("Bad Request: Missing 'content' or 'mode' in request body.");
      return;
    }
    if (mode === "custom" && !prompt) {
      response.status(400).send("Bad Request: Missing 'prompt' for custom mode.");
      return;
    }

    // --- Konstrukcja promptu dla Gemini ---
    const finalPrompt = constructPrompt(content, mode, prompt);

    functions.logger.info("Wywołanie Gemini API z promptem:", {prompt: finalPrompt});

    // --- Wywołanie Gemini API ---
    const result = await model.generateContent(finalPrompt);
    const geminiResponse = result.response;
    const revisedText = geminiResponse.text();

    functions.logger.info("Otrzymano odpowiedź od Gemini.");

    // --- Wysłanie odpowiedzi ---
    response.status(200).json({revisedContent: revisedText});
  } catch (error) {
    functions.logger.error("Błąd podczas wywołania Gemini API lub przetwarzania:", error);
    // Sprawdź, czy błąd pochodzi z API Gemini, aby dostarczyć lepszy komunikat
    let errorMessage = "Wystąpił wewnętrzny błąd serwera.";
    if (error instanceof Error) {
      // Można dodać bardziej szczegółowe logowanie lub mapowanie błędów API Gemini
      errorMessage = `Błąd: ${error.message}`;
    }
    response.status(500).json({error: errorMessage});
  }
});

/**
 * Funkcja pomocnicza do konstrukcji promptu dla Gemini API.
 * @param content Oryginalna treść notatki.
 * @param mode Tryb redakcji.
 * @param customPrompt Niestandardowy prompt (jeśli dotyczy).
 * @return Skonstruowany prompt.
 */
function constructPrompt(content: string, mode: string, customPrompt?: string): string {
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
    throw new Error(`Nieznany tryb redakcji: ${mode}`);
  }
  return `${basePrompt}${content}`;
}
