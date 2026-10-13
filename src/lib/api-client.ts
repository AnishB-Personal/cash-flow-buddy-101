/**
 * CollectFlow Unified API Client
 * 
 * Supports dual-mode execution:
 * - 'mock': Standalone in-memory execution using sanitized Phase 3 fixtures.
 * - 'live': Real HTTP communication with isolated FastAPI backend.
 * 
 * In-memory token management:
 * - Session tokens are held in-memory ONLY during the application lifecycle.
 * - Tokens are NEVER stored in localStorage or sessionStorage in Stage 4B.
 * - Tokens are NEVER printed to logs, console, or error traces.
 */

export type ApiMode = "mock" | "live";

export interface UserProfile {
  id: number;
  username: string;
  role: "admin" | "finance" | "sales" | "viewer";
  full_name?: string | null;
}

export interface AuthSession {
  token: string;
  user: UserProfile;
}

export interface ApiErrorDetail {
  loc?: (string | number)[];
  msg: string;
  type?: string;
}

export class ApiError extends Error {
  public status: number;
  public details: string | ApiErrorDetail[] | undefined;
  public isNetworkError: boolean;

  constructor(status: number, message: string, details?: string | ApiErrorDetail[] | undefined, isNetworkError = false) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
    this.isNetworkError = isNetworkError;
  }
}

export interface ApiClientConfig {
  mode?: ApiMode;
  baseUrl?: string;
  timeoutMs?: number;
}

class ApiClient {
  private mode: ApiMode = "mock";
  private baseUrl = "";
  private timeoutMs = 10000;
  // In-memory token storage (ephemeral, not persisted to web storage)
  private inMemoryToken: string | null = null;
  private inMemoryUser: UserProfile | null = null;
  private onUnauthorizedCallback: (() => void) | null = null;

  constructor() {
    this.initFromEnv();
  }

  public initFromEnv(): void {
    const rawMode = (import.meta.env["VITE_API_MODE"] || "mock").toLowerCase();
    this.mode = rawMode === "live" ? "live" : "mock";

    if (this.mode === "live") {
      const url = import.meta.env["VITE_API_BASE_URL"];
      if (!url) {
        throw new Error(
          "CONFIGURATION ERROR: VITE_API_MODE is set to 'live', but VITE_API_BASE_URL is not configured. " +
          "Live mode requires an explicit sandbox API URL."
        );
      }
      this.baseUrl = url.replace(/\/+$/, "");
    } else {
      this.baseUrl = "";
    }
  }

  public configure(config: ApiClientConfig): void {
    if (config.mode !== undefined) {
      this.mode = config.mode;
    }
    if (config.baseUrl !== undefined) {
      this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    }
    if (config.timeoutMs !== undefined) {
      this.timeoutMs = config.timeoutMs;
    }
  }

  public getMode(): ApiMode {
    return this.mode;
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public setToken(token: string | null, user?: UserProfile | null): void {
    this.inMemoryToken = token;
    this.inMemoryUser = user || null;
  }

  public getToken(): string | null {
    return this.inMemoryToken;
  }

  public getCurrentUser(): UserProfile | null {
    return this.inMemoryUser;
  }

  public clearSession(): void {
    this.inMemoryToken = null;
    this.inMemoryUser = null;
    if (this.onUnauthorizedCallback) {
      this.onUnauthorizedCallback();
    }
  }

  public onUnauthorized(callback: () => void): void {
    this.onUnauthorizedCallback = callback;
  }

  /**
   * Execute an HTTP request against the live backend
   */
  public async request<T>(
    endpoint: string,
    options: {
      method?: "GET" | "POST" | "PUT" | "DELETE";
      body?: unknown;
      headers?: Record<string, string>;
      idempotencyKey?: string;
      signal?: AbortSignal;
    } = {}
  ): Promise<T> {
    if (this.mode !== "live") {
      throw new Error("ApiClient.request() called while in mock mode. Use mock adapter instead.");
    }

    if (!this.baseUrl) {
      throw new Error("ApiClient: Base URL is not set in live mode.");
    }

    const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    const url = `${this.baseUrl}${cleanEndpoint}`;

    const headers: Record<string, string> = {
      "Accept": "application/json",
      ...options.headers,
    };

    if (this.inMemoryToken) {
      headers["Authorization"] = `Bearer ${this.inMemoryToken}`;
    }

    if (options.idempotencyKey) {
      headers["Idempotency-Key"] = options.idempotencyKey;
    }

    let requestBody: string | undefined = undefined;
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      requestBody = JSON.stringify(options.body);
    }

    // Handle timeout with AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    const combinedSignal = options.signal || controller.signal;

    const fetchOptions: RequestInit = {
      method: options.method || "GET",
      headers,
      signal: combinedSignal,
    };
    if (requestBody !== undefined) {
      fetchOptions.body = requestBody;
    }

    try {
      const response = await fetch(url, fetchOptions);

      clearTimeout(timeoutId);

      // Handle HTTP 401 Unauthorized
      if (response.status === 401) {
        this.clearSession();
        let errorMsg = "Unauthorized: Session has expired or credentials are invalid.";
        try {
          const errPayload = await response.json();
          if (errPayload && errPayload.detail) {
            errorMsg = typeof errPayload.detail === "string" ? errPayload.detail : JSON.stringify(errPayload.detail);
          }
        } catch {
          // Fallback to default message
        }
        throw new ApiError(401, errorMsg);
      }

      // Handle HTTP 403 Forbidden (Never masquerade as 401)
      if (response.status === 403) {
        let errorMsg = "Forbidden: You do not have permission to perform this action.";
        try {
          const errPayload = await response.json();
          if (errPayload && errPayload.detail) {
            errorMsg = typeof errPayload.detail === "string" ? errPayload.detail : JSON.stringify(errPayload.detail);
          }
        } catch {
          // Fallback
        }
        throw new ApiError(403, errorMsg);
      }

      if (!response.ok) {
        let errorMsg = `HTTP Error ${response.status}: ${response.statusText}`;
        let details: string | ApiErrorDetail[] | undefined = undefined;
        try {
          const errPayload = await response.json();
          if (errPayload && errPayload.detail) {
            details = errPayload.detail;
            errorMsg = typeof errPayload.detail === "string" ? errPayload.detail : "Validation error occurred";
          }
        } catch {
          // JSON parsing failed
        }
        throw new ApiError(response.status, errorMsg, details);
      }

      // Successful JSON response
      return await response.json() as T;
    } catch (err: unknown) {
      clearTimeout(timeoutId);

      if (err instanceof ApiError) {
        throw err;
      }

      if (err instanceof Error && err.name === "AbortError") {
        throw new ApiError(408, "Request timed out after 10 seconds", undefined, true);
      }

      const networkMsg = err instanceof Error ? err.message : "Network error occurred";
      throw new ApiError(0, `Network failure: Unable to reach backend at ${this.baseUrl}. (${networkMsg})`, undefined, true);
    }
  }

  // Live Authentication API operations
  public async login(credentials: { username: string; password: string }): Promise<AuthSession> {
    const res = await this.request<{ success: boolean; token: string; user: UserProfile }>(
      "/api/auth/login",
      {
        method: "POST",
        body: credentials,
      }
    );

    this.setToken(res.token, res.user);
    return { token: res.token, user: res.user };
  }

  public async fetchCurrentUser(): Promise<UserProfile> {
    const res = await this.request<{ authenticated: boolean; user: UserProfile }>("/api/auth/me", {
      method: "GET",
    });
    this.inMemoryUser = res.user;
    return res.user;
  }

  public async logout(): Promise<void> {
    try {
      if (this.inMemoryToken) {
        await this.request<{ success: boolean; message: string }>("/api/auth/logout", {
          method: "POST",
        });
      }
    } finally {
      this.clearSession();
    }
  }

  // Customer Master Operations
  public async getCustomers(search?: string): Promise<CustomerDTO[]> {
    const query = search ? `?search=${encodeURIComponent(search)}` : "";
    return await this.request<CustomerDTO[]>(`/api/customers${query}`);
  }

  public async getCustomer(id: number): Promise<CustomerDTO> {
    return await this.request<CustomerDTO>(`/api/customers/${id}`);
  }

  public async createCustomer(data: CustomerCreateDTO): Promise<{ success: boolean; id: number; message: string }> {
    return await this.request<{ success: boolean; id: number; message: string }>("/api/customers", {
      method: "POST",
      body: data,
    });
  }

  public async updateCustomer(id: number, data: CustomerUpdateDTO): Promise<{ success: boolean; message: string }> {
    return await this.request<{ success: boolean; message: string }>(`/api/customers/${id}`, {
      method: "PUT",
      body: data,
    });
  }

  public async deleteCustomer(id: number): Promise<{ success: boolean; message: string }> {
    return await this.request<{ success: boolean; message: string }>(`/api/customers/${id}`, {
      method: "DELETE",
    });
  }

  // Statutory Reference Data Operations
  public async getMetadata(): Promise<any> {
    return await this.request<any>("/api/meta");
  }

  public async getFinancialYears(): Promise<any[]> {
    return await this.request<any[]>("/api/settings/financial-years");
  }

  public async getTaxes(): Promise<any> {
    return await this.request<any>("/api/settings/taxes");
  }
}

export interface CustomerDTO {
  id: number;
  billing_name: string;
  billing_address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  pin_code?: string | null;
  gst_number?: string | null;
  contact_person?: string | null;
  designation?: string | null;
  email?: string | null;
  phone_1?: string | null;
  phone_2?: string | null;
  is_active: boolean;
  total_orders?: number;
  unbilled_orders_value?: string;
  total_billed?: string;
  total_cash?: string;
  total_tds?: string;
  total_settled?: string;
  total_paid?: string;
  total_outstanding?: string;
}

export interface CustomerCreateDTO {
  billing_name: string;
  billing_address?: string;
  city?: string;
  state?: string;
  country?: string;
  pin_code?: string;
  gst_number?: string;
  contact_person?: string;
  designation?: string;
  email?: string;
  phone_1?: string;
  phone_2?: string;
}

export interface CustomerUpdateDTO {
  billing_name?: string;
  billing_address?: string;
  city?: string;
  state?: string;
  country?: string;
  pin_code?: string;
  gst_number?: string;
  contact_person?: string;
  designation?: string;
  email?: string;
  phone_1?: string;
  phone_2?: string;
  is_active?: boolean;
}

export const apiClient = new ApiClient();
