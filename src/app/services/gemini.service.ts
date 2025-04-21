import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

// No longer needed for simulation
// const SIMULATED_API_KEY = 'YOUR_API_KEY_HERE'; 

// Interface for the note structure expected by the service
interface Note {
  id: number;
  title: string;
  content: string;
}

// Export RevisionMode if not already done elsewhere implicitly
export type RevisionMode = 'light' | 'deep' | 'custom';
// Define and export SynthesisMode
export type SynthesisMode = 'coherent_text' | 'summary' | 'custom';

/**
 * Interface for the expected response from the proxy server for REVISION.
 */
interface ReviseProxyResponse {
  revisedContent: string;
}

/**
 * Interface for the expected response from the proxy server for SYNTHESIS.
 */
interface SynthesizeProxyResponse {
  synthesizedContent: string;
}

/**
 * Interface for the error response from the proxy server.
 */
interface ProxyErrorResponse {
  error: string;
  details?: string;
}

@Injectable({
  providedIn: 'root'
})
export class GeminiService {

  // URL of the locally running proxy server
  private reviseProxyUrl = 'http://localhost:3000/revise'; 
  private synthesizeProxyUrl = 'http://localhost:3000/synthesize'; // New endpoint

  constructor(private http: HttpClient) { }

  /**
   * Sends the note content and revision parameters to the backend/Gemini API.
   * 
   * @param content The current content of the note.
   * @param mode The revision mode ('light', 'deep', 'custom').
   * @param prompt Optional custom prompt for the 'custom' mode.
   * @returns Observable<string> emitting the revised content.
   */
  reviseNote(content: string, mode: RevisionMode, prompt?: string): Observable<string> {
    console.log('GeminiService: Calling revise proxy server', { content, mode, prompt });
    const requestBody = { content, mode, prompt };

    return this.http.post<ReviseProxyResponse>(this.reviseProxyUrl, requestBody).pipe(
      map(response => {
        if (response && typeof response.revisedContent === 'string') {
          return response.revisedContent;
        } else {
          console.error('Invalid response structure from revise proxy server:', response);
          throw new Error('Otrzymano nieprawidłową odpowiedź z serwera proxy (redakcja).');
        }
      }),
      catchError(this.handleProxyError) // Use shared error handler
    );
  }

  /**
   * Sends selected notes and synthesis parameters to the backend/Gemini API.
   * 
   * @param notes An array of notes to synthesize.
   * @param mode The synthesis mode ('coherent_text', 'summary', 'custom').
   * @param prompt Optional custom prompt for the 'custom' mode.
   * @returns Observable<string> emitting the synthesized content.
   */
  synthesizeNotes(notes: Note[], mode: SynthesisMode, prompt?: string): Observable<string> {
    console.log('GeminiService: Calling synthesize proxy server', { notes: notes.map(n=>n.id), mode, prompt });
    const requestBody = { notes, mode, prompt };

    return this.http.post<SynthesizeProxyResponse>(this.synthesizeProxyUrl, requestBody).pipe(
      map(response => {
        if (response && typeof response.synthesizedContent === 'string') {
          return response.synthesizedContent;
        } else {
          console.error('Invalid response structure from synthesize proxy server:', response);
          throw new Error('Otrzymano nieprawidłową odpowiedź z serwera proxy (synteza).');
        }
      }),
      catchError(this.handleProxyError) // Use shared error handler
    );
  }

  /**
   * Shared error handler for proxy calls.
   */
  private handleProxyError(error: any): Observable<never> {
    console.error('Error calling proxy server:', error);
    let specificError = 'Nie udało się połączyć z serwerem proxy lub wystąpił nieznany błąd.';
    if (error.error && typeof error.error.error === 'string') {
      specificError = `Błąd serwera proxy: ${error.error.error}`;
      if (error.error.details) {
        specificError += ` (${error.error.details})`;
      }
    } else if (error.message) {
      specificError = error.message;
    }
    return throwError(() => new Error(specificError));
  }

  // This function is now part of the proxy server, not needed here
  /*
  private constructPrompt(content: string, mode: RevisionMode, customPrompt?: string): string {
      // ... implementation was here ...
  }
  */

} 