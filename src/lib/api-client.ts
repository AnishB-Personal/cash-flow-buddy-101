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

import type { Invoice as InvoiceDTO } from "@/data/collectflow";
export type { InvoiceDTO };

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
  public isSuperseded: boolean;

  constructor(
    status: number,
    message: string,
    details?: string | ApiErrorDetail[] | undefined,
    isNetworkError = false,
    isSuperseded = false
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
    this.isNetworkError = isNetworkError;
    this.isSuperseded = isSuperseded;
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

  private sessionGeneration = 0;
  private loginSequence = 0;

  public getSessionGeneration(): number {
    return this.sessionGeneration;
  }

  public setToken(token: string | null, user?: UserProfile | null): void {
    this.inMemoryToken = token;
    this.inMemoryUser = user || null;
    this.sessionGeneration++;
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
    this.sessionGeneration++;
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

    const requestGeneration = this.sessionGeneration;
    const requestToken = this.inMemoryToken;

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
        if (this.sessionGeneration === requestGeneration && this.inMemoryToken === requestToken && this.inMemoryToken !== null) {
          this.clearSession();
        }
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
    const loginSeq = ++this.loginSequence;
    try {
      const res = await this.request<{ success: boolean; token: string; user: UserProfile }>(
        "/api/auth/login",
        {
          method: "POST",
          body: credentials,
        }
      );

      if (loginSeq !== this.loginSequence) {
        throw new ApiError(
          409,
          "Login request superseded by a newer authentication action.",
          undefined,
          false,
          true
        );
      }

      this.setToken(res.token, res.user);
      return { token: res.token, user: res.user };
    } catch (err: unknown) {
      if (loginSeq !== this.loginSequence) {
        if (err instanceof ApiError && err.isSuperseded) {
          throw err;
        }
        throw new ApiError(
          409,
          "Login request superseded by a newer authentication action.",
          undefined,
          false,
          true
        );
      }
      throw err;
    }
  }

  public async fetchCurrentUser(): Promise<UserProfile> {
    const requestGeneration = this.sessionGeneration;
    const requestToken = this.inMemoryToken;
    const res = await this.request<{ authenticated: boolean; user: UserProfile }>("/api/auth/me", {
      method: "GET",
    });
    if (this.sessionGeneration === requestGeneration && this.inMemoryToken === requestToken && this.inMemoryToken !== null) {
      this.inMemoryUser = res.user;
      return res.user;
    }
    if (this.inMemoryUser) {
      return this.inMemoryUser;
    }
    throw new ApiError(401, "Session invalidated during user verification.");
  }

  public async logout(): Promise<void> {
    const tokenToRevoke = this.inMemoryToken;
    // Invalidate local authentication immediately
    this.inMemoryToken = null;
    this.inMemoryUser = null;
    this.sessionGeneration++;
    this.loginSequence++;

    if (tokenToRevoke && this.mode === "live" && this.baseUrl) {
      try {
        const headers: Record<string, string> = {
          "Accept": "application/json",
          "Authorization": `Bearer ${tokenToRevoke}`,
        };
        await fetch(`${this.baseUrl}/api/auth/logout`, {
          method: "POST",
          headers,
        });
      } catch {
        // Silently handle remote network errors on logout
      }
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

  public async createFinancialYear(data: {
    code: string;
    start_date?: string | undefined;
    end_date?: string | undefined;
  }): Promise<{ success: boolean; message: string }> {
    return await this.request<{ success: boolean; message: string }>("/api/settings/financial-years", {
      method: "POST",
      body: data,
    });
  }

  public async deleteFinancialYear(code: string): Promise<{ success: boolean; message: string }> {
    return await this.request<{ success: boolean; message: string }>(`/api/settings/financial-years/${encodeURIComponent(code)}`, {
      method: "DELETE",
    });
  }

  public async getTaxes(): Promise<any> {
    return await this.request<any>("/api/settings/taxes");
  }

  public async createGstRate(data: {
    name: string;
    rate: number;
    tax_type?: string | undefined;
    is_default?: boolean | undefined;
  }): Promise<{ success: boolean; id: number; message: string }> {
    return await this.request<{ success: boolean; id: number; message: string }>("/api/settings/taxes/gst", {
      method: "POST",
      body: data,
    });
  }

  public async createTdsRate(data: {
    section_code: string;
    rate: number;
    description?: string | undefined;
  }): Promise<{ success: boolean; id: number; message: string }> {
    return await this.request<{ success: boolean; id: number; message: string }>("/api/settings/taxes/tds", {
      method: "POST",
      body: data,
    });
  }

  // User Management Operations (Admin RBAC)
  public async getUsers(): Promise<ManagedUserDTO[]> {
    return await this.request<ManagedUserDTO[]>("/api/users");
  }

  public async createUser(data: {
    username: string;
    password: string;
    role: "admin" | "finance" | "sales" | "viewer";
    full_name?: string | null;
  }): Promise<{ success: boolean; user_id: number; message: string }> {
    return await this.request<{ success: boolean; user_id: number; message: string }>("/api/users", {
      method: "POST",
      body: data,
    });
  }

  public async updateUser(
    id: number,
    data: { role?: string; full_name?: string | null; is_active?: boolean }
  ): Promise<{ success: boolean; message: string }> {
    return await this.request<{ success: boolean; message: string }>(`/api/users/${id}`, {
      method: "PUT",
      body: data,
    });
  }

  public async deleteUser(id: number): Promise<{ success: boolean; message: string }> {
    return await this.request<{ success: boolean; message: string }>(`/api/users/${id}`, {
      method: "DELETE",
    });
  }

  public async deactivateUser(id: number): Promise<{ success: boolean; message: string }> {
    return await this.request<{ success: boolean; message: string }>(`/api/users/${id}/deactivate`, {
      method: "PUT",
    });
  }

  public async resetUserPassword(
    id: number,
    newPassword: string
  ): Promise<{ success: boolean; message: string }> {
    return await this.request<{ success: boolean; message: string }>(`/api/users/${id}/password`, {
      method: "PUT",
      body: { new_password: newPassword },
    });
  }

  // Purchase Order Operations (Stage 4C.3)
  public async getOrders(params?: {
    page?: number | undefined;
    limit?: number | undefined;
    search?: string | undefined;
    fy?: string | undefined;
    status?: string | undefined;
  }): Promise<{ page: number; limit: number; total: number; total_pages: number; data: InvoiceDTO[] }> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.search) searchParams.set("search", params.search);
    if (params?.fy) searchParams.set("fy", params.fy);
    if (params?.status) searchParams.set("status", params.status);
    const query = searchParams.toString() ? `?${searchParams.toString()}` : "";
    return await this.request<{ page: number; limit: number; total: number; total_pages: number; data: InvoiceDTO[] }>(`/api/orders${query}`);
  }

  public async getOrder(id: number): Promise<InvoiceDTO> {
    return await this.request<InvoiceDTO>(`/api/orders/${id}`);
  }

  public async createOrder(data: OrderCreateDTO): Promise<InvoiceDTO> {
    return await this.request<InvoiceDTO>("/api/orders", {
      method: "POST",
      body: data,
    });
  }

  public async updateOrder(id: number, data: OrderUpdateDTO): Promise<InvoiceDTO> {
    return await this.request<InvoiceDTO>(`/api/orders/${id}`, {
      method: "PUT",
      body: data,
    });
  }

  public async deleteOrder(id: number): Promise<{ success: boolean; message: string }> {
    return await this.request<{ success: boolean; message: string }>(`/api/orders/${id}`, {
      method: "DELETE",
    });
  }

  public async convertOrder(id: number, data: { invoice_number: string; invoice_date: string; due_date?: string | null | undefined }): Promise<InvoiceDTO & { success: boolean; invoice_id: number }> {
    return await this.request<InvoiceDTO & { success: boolean; invoice_id: number }>(`/api/orders/${id}/convert`, {
      method: "POST",
      body: data,
    });
  }

  // Commercial Invoice Operations (Stage 4C.3)
  public async getInvoices(params?: {
    page?: number | undefined;
    limit?: number | undefined;
    search?: string | undefined;
    fy?: string | undefined;
    status?: string | undefined;
    customer_id?: number | undefined;
  }): Promise<{ page: number; limit: number; total: number; total_pages: number; data: InvoiceDTO[] }> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.search) searchParams.set("search", params.search);
    if (params?.fy) searchParams.set("fy", params.fy);
    if (params?.status) searchParams.set("status", params.status);
    if (params?.customer_id) searchParams.set("customer_id", String(params.customer_id));
    const query = searchParams.toString() ? `?${searchParams.toString()}` : "";
    return await this.request<{ page: number; limit: number; total: number; total_pages: number; data: InvoiceDTO[] }>(`/api/invoices${query}`);
  }

  public async getInvoice(id: number): Promise<{ invoice: InvoiceDTO; payments: any[]; items: any[] }> {
    return await this.request<{ invoice: InvoiceDTO; payments: any[]; items: any[] }>(`/api/invoices/${id}`);
  }

  public async createInvoice(data: InvoiceCreateDTO): Promise<{ success: boolean; id: number; invoice_number: string; message: string }> {
    return await this.request<{ success: boolean; id: number; invoice_number: string; message: string }>("/api/invoices", {
      method: "POST",
      body: data,
    });
  }

  public async updateInvoiceMetadata(id: number, data: { remarks?: string | undefined; due_date?: string | undefined; executive_id?: number | undefined }): Promise<{ success: boolean; message: string }> {
    return await this.request<{ success: boolean; message: string }>(`/api/invoices/${id}`, {
      method: "PUT",
      body: data,
    });
  }

  public async cancelInvoice(id: number, data: { reason: string }): Promise<{ success: boolean; message: string; lifecycle_status: string }> {
    return await this.request<{ success: boolean; message: string; lifecycle_status: string }>(`/api/invoices/${id}/cancel`, {
      method: "POST",
      body: data,
    });
  }
}

export interface ManagedUserDTO {
  id: number;
  username: string;
  role: "admin" | "finance" | "sales" | "viewer";
  full_name?: string | null;
  is_active: boolean;
  created_at?: string | null;
}


export interface CustomerDTO {
  id: number;
  billing_name: string;
  billing_address?: string | null | undefined;
  city?: string | null | undefined;
  state?: string | null | undefined;
  country?: string | null | undefined;
  pin_code?: string | null | undefined;
  gst_number?: string | null | undefined;
  contact_person?: string | null | undefined;
  designation?: string | null | undefined;
  email?: string | null | undefined;
  phone_1?: string | null | undefined;
  phone_2?: string | null | undefined;
  is_active: boolean;
  total_orders?: number | undefined;
  unbilled_orders_value?: string | undefined;
  total_billed?: string | undefined;
  total_cash?: string | undefined;
  total_tds?: string | undefined;
  total_settled?: string | undefined;
  total_paid?: string | undefined;
  total_outstanding?: string | undefined;
}

export interface CustomerCreateDTO {
  billing_name: string;
  billing_address?: string | null | undefined;
  city?: string | null | undefined;
  state?: string | null | undefined;
  country?: string | null | undefined;
  pin_code?: string | null | undefined;
  gst_number?: string | null | undefined;
  contact_person?: string | null | undefined;
  designation?: string | null | undefined;
  email?: string | null | undefined;
  phone_1?: string | null | undefined;
  phone_2?: string | null | undefined;
}

export interface CustomerUpdateDTO {
  billing_name?: string | null | undefined;
  billing_address?: string | null | undefined;
  city?: string | null | undefined;
  state?: string | null | undefined;
  country?: string | null | undefined;
  pin_code?: string | null | undefined;
  gst_number?: string | null | undefined;
  contact_person?: string | null | undefined;
  designation?: string | null | undefined;
  email?: string | null | undefined;
  phone_1?: string | null | undefined;
  phone_2?: string | null | undefined;
  is_active?: boolean | undefined;
}

export interface OrderItemCreateDTO {
  item_description: string;
  quantity?: number | undefined;
  unit_price?: number | undefined;
  tax_rate?: number | undefined;
}

export interface OrderCreateDTO {
  fy_code: string;
  po_number?: string | null | undefined;
  po_date: string;
  customer_id: number;
  executive_id?: number | null | undefined;
  order_type?: string | undefined;
  currency?: string | undefined;
  exchange_rate?: number | undefined;
  exclusive_amount?: number | undefined;
  tax_rate?: number | undefined;
  tax_amount?: number | undefined;
  total_amount?: number | undefined;
  remarks?: string | null | undefined;
  items?: OrderItemCreateDTO[] | undefined;
  line_item_description?: string | undefined;
  quantity?: number | undefined;
  unit_price?: number | undefined;
}

export interface OrderUpdateDTO {
  po_number?: string | null | undefined;
  po_date?: string | null | undefined;
  customer_id?: number | null | undefined;
  executive_id?: number | null | undefined;
  currency?: string | null | undefined;
  exchange_rate?: number | null | undefined;
  remarks?: string | null | undefined;
  items?: OrderItemCreateDTO[] | null | undefined;
  line_item_description?: string | undefined;
  quantity?: number | undefined;
  unit_price?: number | undefined;
  tax_rate?: number | undefined;
}

export interface InvoiceCreateDTO {
  fy_code: string;
  invoice_number: string;
  invoice_date: string;
  due_date?: string | null | undefined;
  customer_id: number;
  executive_id?: number | null | undefined;
  executive_name?: string | null | undefined;
  order_type?: string | undefined;
  po_number?: string | null | undefined;
  po_date?: string | null | undefined;
  currency?: string | undefined;
  exchange_rate?: number | undefined;
  exclusive_amount?: number | undefined;
  tax_rate?: number | undefined;
  tax_amount?: number | undefined;
  total_amount?: number | undefined;
  remarks?: string | null | undefined;
  items?: {
    description: string;
    quantity?: number | undefined;
    unit_price?: number | undefined;
    tax_rate?: number | undefined;
  }[] | undefined;
}

export const apiClient = new ApiClient();
