import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { environment } from '@/lib/config/environment';
import { getBrowserInfo, getFingerprintId } from '@/lib/utils';
import { getIntegrityToken } from '@/lib/url-identity';

export interface LocationData {
  latitude: number;
  longitude: number;
}

export interface ChatResponse {
  response: string;
  status: string;
  qid?: string;
}

export interface TranscriptionResponse {
  text: string;
  lang_code: string;
  status: string;
}

export interface SuggestionItem {
  question: string;
}

interface TTSResponse {
  status: string;
  audio_data: string;
  session_id: string;
}

interface AuthResponse {
  token: string;
}

interface TelemetryFeedbackPayload {
  qid: string;
  session_id: string;
  message_id?: string;
  feedback_type: string;
  feedback_text: string;
  question_text: string;
  answer_text: string;
}

interface TelemetryErrorPayload {
  qid: string;
  session_id: string;
  error_text: string;
  question_text?: string;
  message_id?: string;
}

type UiTelemetryEvent = {
  event_name: string;
  category: string;
  time: string;
  metadata: Record<string, unknown>;
};

interface ImageUploadResponse {
  image_id: string;
}

const CHAT_QID_HEADER = "X-QID";
const SSE_KEEPALIVE_MARKER = "SSE_KEEPALIVE";

// Constants
const JWT_STORAGE_KEY = 'auth_jwt';

const stripSseKeepAliveMarkers = (chunk: string): string =>
  chunk
    .split(/\r?\n/)
    .filter((line) => line.trim() !== SSE_KEEPALIVE_MARKER)
    .join('\n');

const getTokenExpiryFromExp = (token: string): number | null => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payloadPart = parts[1];
    if (!payloadPart) return null;

    const payloadBase64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const paddedPayload = payloadBase64.padEnd(Math.ceil(payloadBase64.length / 4) * 4, '=');
    const payload = JSON.parse(atob(paddedPayload)) as { exp?: number };

    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
};

class ApiService {
  private apiUrl: string = environment.apiUrl;
  private locationData: LocationData | null = null;
  private currentSessionId: string | null = null;
  private axiosInstance: AxiosInstance;
  private authToken: string | null = null;
  private refreshTokenPromise: Promise<string | null> | null = null;

  constructor() {
    this.authToken = this.getAuthToken();
    this.axiosInstance = axios.create({
      baseURL: this.apiUrl,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.authToken ? `Bearer ${this.authToken}` : 'NA'
      }
    });

    // Add response interceptor for 401 errors
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401 && error.config) {
          const originalRequest = error.config as any;
          if (!originalRequest._retry) {
            originalRequest._retry = true;
            const refreshedToken = await this.performTokenRefresh();
            if (refreshedToken) {
              originalRequest.headers = {
                ...(originalRequest.headers || {}),
                Authorization: `Bearer ${refreshedToken}`,
              };
              return this.axiosInstance.request(originalRequest);
            }
          }
        }
        return Promise.reject(error);
      }
    );
  }

  private getAuthToken(): string | null {
    const keys = [JWT_STORAGE_KEY, 'accessToken', 'token'];
    
    for (const key of keys) {
      const data = localStorage.getItem(key);
      if (!data) continue;

      // Try to parse as JSON first (our new format)
      try {
        const parsed = JSON.parse(data);
        if (parsed && typeof parsed === 'object') {
          // It's JSON. Check for token property.
          const token = parsed.token || parsed.access_token || parsed.accessToken;
          if (token) {
            const now = new Date().getTime();
            // Only expire if we have a valid future expiry date set
            if (parsed.expiry && parsed.expiry > 0 && now > parsed.expiry) {
              localStorage.removeItem(key);
              continue;
            }
            return token;
          }
        }
      } catch (e) {
        console.error(e);
        // Not JSON, assume it's a plain token string
        if (data.split('.').length === 3) {
          return data;
        }
      }
    }
    return null;
  }

  private refreshAuthToken(): void {
    this.authToken = this.getAuthToken();
    if (this.authToken) {
      this.axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${this.authToken}`;
    } else {
      this.axiosInstance.defaults.headers.common['Authorization'] = 'NA';
      // Don't redirect here - let the 401 interceptor handle it when actual API calls fail
    }
  }

  private async performTokenRefresh(): Promise<string | null> {
    if (this.refreshTokenPromise) {
      return this.refreshTokenPromise;
    }

    this.refreshTokenPromise = (async () => {
      try {
        const metadata = getBrowserInfo();
        const fingerprintId = await getFingerprintId();
        const newToken = await this.fetchAuthToken(metadata, fingerprintId);
        const expiry = getTokenExpiryFromExp(newToken);
        if (!expiry) {
          throw new Error('JWT exp claim missing; refusing to store token with synthetic expiry');
        }

        localStorage.setItem(
          JWT_STORAGE_KEY,
          JSON.stringify({
            token: newToken,
            expiry,
          })
        );

        this.authToken = newToken;
        this.axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
        return newToken;
      } catch (error) {
        console.error('Failed to refresh auth token:', error);
        this.authToken = null;
        this.axiosInstance.defaults.headers.common['Authorization'] = 'NA';
        return null;
      } finally {
        this.refreshTokenPromise = null;
      }
    })();

    return this.refreshTokenPromise;
  }

  private async refreshAuthTokenIfExpiredOrMissing(): Promise<void> {
    this.refreshAuthToken();
    if (this.authToken) return;

    await this.performTokenRefresh();
  }
  
  // No longer redirecting to error page
  // private redirectToErrorPage(): void {
  //   // Check if we're in a browser environment and not already on error page
  //   if (typeof window !== 'undefined' && !window.location.pathname.includes('/error')) {
  //     window.location.href = '/error?reason=auth';
  //   }
  // }
  
  updateAuthToken(): void {
    this.refreshAuthToken();
  }

  private getAuthHeaders(): Record<string, string> {
    this.refreshAuthToken();
    return {
      'Authorization': this.authToken ? `Bearer ${this.authToken}` : 'NA'
    };
  }

  private validateAuth(): boolean {
    // If we have no token, alert but don't force redirect here
    // Let the calling component or an interceptor handle navigation
    if (!this.authToken) {
      console.error("Authentication token missing in ApiService");
      return false;
    }
    return true;
  }

  async sendUserQuery(
    msg: string,
    session: string,
    sourceLang: string,
    targetLang: string,
    onStreamData?: (_data: string) => void,
    onResponseStarted?: () => void
  ): Promise<ChatResponse> {
    try {
      await this.refreshAuthTokenIfExpiredOrMissing();
      if (!this.validateAuth()) {
        return { response: "Authentication error", status: "error" };
      }
      
      const params = {
        session_id: session,
        query: msg,
        source_lang: sourceLang,
        target_lang: targetLang,
        ...(this.locationData && {
          latitude: String(this.locationData.latitude),
          longitude: String(this.locationData.longitude)
        })
      };

      const headers = this.getAuthHeaders();

      if (onStreamData) {
        // Handle streaming response
        let response = await fetch(`${this.apiUrl}/api/chat/?${new URLSearchParams(params)}`, {
          method: 'GET',
          headers: headers          
        });

        if (response.status === 401) {
          const refreshedToken = await this.performTokenRefresh();
          if (refreshedToken) {
            response = await fetch(`${this.apiUrl}/api/chat/?${new URLSearchParams(params)}`, {
              method: 'GET',
              headers: {
                Authorization: `Bearer ${refreshedToken}`,
              },
            });
          }
        }

        if (!response.ok) {
          const responseQid = response.headers.get(CHAT_QID_HEADER) || undefined;
          if (response.status === 401) {
            const error = new Error('Unauthorized');
            (error as any).status = 401;
            if (responseQid) (error as any).qid = responseQid;
            throw error;
          }
          if (response.status === 429) {
            const error = new Error('Rate limit exceeded');
            (error as any).status = 429;
            if (responseQid) (error as any).qid = responseQid;
            throw error;
          }
          const error = new Error(`HTTP error! status: ${response.status}`);
          (error as any).status = response.status;
          if (responseQid) (error as any).qid = responseQid;
          throw error;
        }

        const responseQid = response.headers.get(CHAT_QID_HEADER) || undefined;
        onResponseStarted?.();

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('Response body is not readable');
        }

        let fullResponse = '';
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          const displayChunk = stripSseKeepAliveMarkers(chunk);

          if (chunk.includes(SSE_KEEPALIVE_MARKER) && !displayChunk.trim()) {
            continue;
          }

          fullResponse += displayChunk;
          onStreamData(displayChunk);
        }

        return { response: fullResponse, status: 'success', qid: responseQid };
      } else {
        // Regular non-streaming request
        const config = {
          params,
          headers: this.getAuthHeaders()
        };
        const response = await this.axiosInstance.get('/api/chat/', config);
        const responseQid = response.headers[CHAT_QID_HEADER.toLowerCase()] as string | undefined;
        onResponseStarted?.();
        return {
          ...response.data,
          qid: response.data?.qid || responseQid
        };
      }
    } catch (error) {
      const responseQid = axios.isAxiosError(error)
        ? error.response?.headers?.[CHAT_QID_HEADER.toLowerCase()]
        : undefined;
      if (responseQid) {
        (error as any).qid = responseQid;
      }
      console.error('Error sending user query:', error);
      throw error;
    }
  }

  private parseImageUploadResponse(payload: unknown): ImageUploadResponse {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Upload response is not a valid object');
    }

    const imageId = (payload as { image_id?: unknown }).image_id;
    if (typeof imageId !== 'string' || !imageId.trim()) {
      throw new Error('Upload response missing image_id');
    }

    return { image_id: imageId.trim() };
  }

  async uploadImage(imageFile: File): Promise<ImageUploadResponse> {
    try {
      await this.refreshAuthTokenIfExpiredOrMissing();
      if (!this.validateAuth()) {
        throw new Error("Authentication error");
      }

      const formData = new FormData();
      formData.append('image', imageFile);

      const headers = this.getAuthHeaders();
      const response = await fetch(`${this.apiUrl}/api/image/upload`, {
        method: 'POST',
        headers: headers,
        body: formData
      });

      if (!response.ok) {
        if (response.status === 401) {
          const refreshedToken = await this.performTokenRefresh();
          if (refreshedToken) {
            const retryResponse = await fetch(`${this.apiUrl}/api/image/upload`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${refreshedToken}` },
              body: formData
            });
            if (!retryResponse.ok) {
              throw new Error(`Upload failed: ${retryResponse.status}`);
            }
            const retryPayload = await retryResponse.json();
            return this.parseImageUploadResponse(retryPayload);
          }
        }
        throw new Error(`Upload failed: ${response.status}`);
      }

      const payload = await response.json();
      return this.parseImageUploadResponse(payload);
    } catch (error) {
      console.error('Error uploading image:', error);
      throw error;
    }
  }

  async sendImageQuery(
    imageFile: File,
    session: string,
    sourceLang: string,
    targetLang: string,
    onStreamData?: (_data: string) => void,
    onResponseStarted?: () => void
  ): Promise<ChatResponse> {
    // Step 1: Upload image to get image ID
    const uploadResult = await this.uploadImage(imageFile);
    const imageId = uploadResult.image_id;

    // Step 2: Send the image UUID along with a request message.
    // The backend resolves this ID to a localhost image URL internally.
    const query = `please do the pest analysis for this image ${imageId}`;

    return this.sendUserQuery(query, session, sourceLang, targetLang, onStreamData, onResponseStarted);
  }

  async getSuggestions(session: string, targetLang: string = 'mr'): Promise<SuggestionItem[]> {
    try {
      await this.refreshAuthTokenIfExpiredOrMissing();
      if (!this.validateAuth()) {
        return [];
      }
      
      const params = {
        session_id: session,
        target_lang: targetLang
      };

      const config = {
        params,
        headers: this.getAuthHeaders()
      };

      const response = await this.axiosInstance.get('/api/suggest/', config);
      return response.data.map((item: string) => ({
        question: item
      }));
    } catch (error) {
      console.error('Error getting suggestions:', error);
      throw error;
    }
  }

  async transcribeAudio(
    audioBase64: string,
    serviceType: string = 'bhashini',
    sessionId: string,
    lang_code: string
  ): Promise<TranscriptionResponse> {
    try {
      await this.refreshAuthTokenIfExpiredOrMissing();
      if (!this.validateAuth()) {
        return { text: "", lang_code: "", status: "error" };
      }
      
      const payload = {
        audio_content: audioBase64,
        service_type: serviceType,
        session_id: sessionId,
        lang_code: lang_code,
      };

      const config = {
        headers: this.getAuthHeaders()
      };

      const response = await this.axiosInstance.post('/api/transcribe/', payload, config);
      return response.data;
    } catch (error) {
      console.error('Error transcribing audio:', error);
      throw error;
    }
  }

  async getTranscript(sessionId: string, text: string, targetLang: string): Promise<AxiosResponse<TTSResponse>> {
    await this.refreshAuthTokenIfExpiredOrMissing();
    if (!this.validateAuth()) {
      return Promise.reject(new Error("Authentication required"));
    }
    
    const config = {
      headers: this.getAuthHeaders(),
      timeout: 120000, // 120s timeout for TTS (can be slow on cold start)
    };
    
    return this.axiosInstance.post(`/api/tts/`, {
      session_id: sessionId,
      text: text,
      target_lang: targetLang
    }, config);
  }

  async submitPositiveFeedback(messageId: string): Promise<void> {
    try {
      await this.submitTelemetryFeedback({
        qid: messageId,
        session_id: this.currentSessionId || "",
        message_id: messageId,
        feedback_type: "like",
        feedback_text: "Liked the response",
        question_text: "",
        answer_text: ""
      });
    } catch (error) {
      console.error('Error submitting positive feedback:', error);
      throw error;
    }
  }

  async submitNegativeFeedback(messageId: string, reason: string, feedback: string): Promise<void> {
    try {
      await this.submitTelemetryFeedback({
        qid: messageId,
        session_id: this.currentSessionId || "",
        message_id: messageId,
        feedback_type: "dislike",
        feedback_text: feedback || reason || "Negative feedback",
        question_text: "",
        answer_text: ""
      });
    } catch (error) {
      console.error('Error submitting negative feedback:', error);
      throw error;
    }
  }

  blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        try {
          const result = reader.result as string;
          const base64String = result.split(',')[1];
          if (base64String) {
            resolve(base64String);
          } else {
            reject(new Error('Failed to extract base64 from data URL'));
          }
        } catch (error) {
          console.error(error);
          reject(new Error('Failed to convert blob to base64'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read blob'));
      reader.readAsDataURL(blob);
    });
  }

  setLocationData(location: LocationData): void {
    this.locationData = location;
  }

  getLocationData(): LocationData | null {
    return this.locationData;
  }

  setSessionId(sessionId: string): void {
    this.currentSessionId = sessionId;
  }

  getSessionId(): string | null {
    return this.currentSessionId;
  }

  async submitTelemetryFeedback(payload: TelemetryFeedbackPayload): Promise<void> {
    if (!environment.feedbackEnabled) return; // relay off in this fork unless FEEDBACK_ENABLED=true
    await this.refreshAuthTokenIfExpiredOrMissing();
    if (!this.validateAuth()) return;

    await this.axiosInstance.post('/api/telemetry/feedback', payload, {
      headers: this.getAuthHeaders()
    });
  }

  async submitTelemetryError(payload: TelemetryErrorPayload): Promise<void> {
    if (!environment.telemetryEnabled) return; // relay off in this fork unless TELEMETRY_ENABLED=true
    await this.refreshAuthTokenIfExpiredOrMissing();
    if (!this.validateAuth()) return;

    await this.axiosInstance.post('/api/telemetry/error', payload, {
      headers: this.getAuthHeaders()
    });
  }

  trackUiTelemetryEvent(event: Omit<UiTelemetryEvent, "time"> & { time?: string }): void {
    if (!environment.telemetryEnabled) return;
    void this.submitUiTelemetryEvent(event);
  }

  private async submitUiTelemetryEvent(event: Omit<UiTelemetryEvent, "time"> & { time?: string }): Promise<void> {
    try {
      await this.refreshAuthTokenIfExpiredOrMissing();
      if (!this.validateAuth()) return;

      const metadata = {
        ...(event.metadata || {}),
        ...(this.currentSessionId && !event.metadata?.sid ? { sid: this.currentSessionId } : {})
      };

      const payload: UiTelemetryEvent[] = [{
        event_name: event.event_name,
        category: event.category,
        time: event.time || new Date().toISOString(),
        metadata
      }];

      await this.axiosInstance.post('/api/telemetry/events', payload, {
        headers: this.getAuthHeaders()
      });
    } catch {
      // UI telemetry must never block or surface errors to users.
    }
  }

  /** Token seam for the Sunbird emitter: stored JWT, or /api/token when forced or missing; null on failure. */
  async getTelemetryAuthToken(opts: { forceRefresh?: boolean } = {}): Promise<string | null> {
    try {
      const stored = opts.forceRefresh ? null : this.getAuthToken();
      return stored ?? (await this.performTokenRefresh());
    } catch {
      return null;
    }
  }

  async fetchAuthToken(
    metadata: string,
    fingerprintId?: string | null,
    integrityToken?: string,
    clientCode = 'bihar-krishi'
  ): Promise<string> {
    try {
      // Don't use authentication headers for this call as we're getting the token
      const response = await axios.post<AuthResponse>(
        `${this.apiUrl}/api/token`,
        {
          metadata,
          ...(fingerprintId ? { fingerprint_id: fingerprintId } : {}),
          integrityToken: integrityToken ?? getIntegrityToken(),
          clientCode,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data && response.data.token) {
        return response.data.token;
      }

      throw new Error("No token received from auth endpoint");
    } catch (error) {
      console.error("Error fetching auth token:", error);
      throw error;
    }
  }
}

const apiService = new ApiService();
export default apiService;
