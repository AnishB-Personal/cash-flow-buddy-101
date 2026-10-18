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

  public async getAllInvoices(params?: {
    search?: string | undefined;
    fy?: string | undefined;
    status?: string | undefined;
    customer_id?: number | undefined;
  }): Promise<{ page: number; limit: number; total: number; total_pages: number; data: InvoiceDTO[] }> {
    const firstPage = await this.getInvoices({ ...params, page: 1, limit: 500 });
    let allData = [...firstPage.data];
    if (firstPage.total_pages > 1) {
      const remainingPages = [];
      for (let p = 2; p <= firstPage.total_pages; p++) {
        remainingPages.push(this.getInvoices({ ...params, page: p, limit: 500 }));
      }
      const pageResults = await Promise.all(remainingPages);
      for (const res of pageResults) {
        allData = allData.concat(res.data);
      }
    }
    return {
      page: 1,
      limit: allData.length,
      total: firstPage.total,
      total_pages: 1,
      data: allData,
    };
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

  public async getPayments(params?: {
    page?: number | undefined;
    limit?: number | undefined;
    fy?: string | undefined;
    invoice_id?: number | undefined;
    customer_id?: number | undefined;
    payment_mode?: string | undefined;
    transaction_type?: string | undefined;
    date_from?: string | undefined;
    date_to?: string | undefined;
    search?: string | undefined;
  }): Promise<{ page: number; limit: number; total: number; total_pages: number; summary: PaymentSummaryDTO; data: PaymentDTO[] }> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.fy && params.fy !== "ALL" && params.fy !== "All") searchParams.set("fy", params.fy);
    if (params?.invoice_id) searchParams.set("invoice_id", String(params.invoice_id));
    if (params?.customer_id) searchParams.set("customer_id", String(params.customer_id));
    if (params?.payment_mode) searchParams.set("payment_mode", params.payment_mode);
    if (params?.transaction_type) searchParams.set("transaction_type", params.transaction_type);
    if (params?.date_from) searchParams.set("date_from", params.date_from);
    if (params?.date_to) searchParams.set("date_to", params.date_to);
    if (params?.search && params.search.trim()) searchParams.set("search", params.search.trim());
    const query = searchParams.toString() ? `?${searchParams.toString()}` : "";
    return await this.request<{ page: number; limit: number; total: number; total_pages: number; summary: PaymentSummaryDTO; data: PaymentDTO[] }>(`/api/payments${query}`);
  }

  public async createPayment(data: PaymentCreateDTO): Promise<{ success: boolean; payment_id: number; message: string; invoice_summary?: any; summary?: any }> {
    const headers: Record<string, string> = {};
    if (data.idempotency_key) {
      headers["idempotency-key"] = data.idempotency_key;
    }
    return await this.request<{ success: boolean; payment_id: number; message: string; invoice_summary?: any; summary?: any }>("/api/payments", {
      method: "POST",
      headers,
      body: data,
    });
  }

  public async correctPayment(id: number, data: PaymentCorrectionDTO): Promise<{ success: boolean; reversal_id: number; replacement_id?: number | null; message: string; invoice_summary?: any; summary?: any }> {
    return await this.request<{ success: boolean; reversal_id: number; replacement_id?: number | null; message: string; invoice_summary?: any; summary?: any }>(`/api/payments/${id}/correct`, {
      method: "POST",
      body: data,
    });
  }

  public async getTargets(params?: { fy?: string | undefined; user_id?: number | undefined }): Promise<{ fy_code: string; targets: SalesTargetDTO[] }> {
    const searchParams = new URLSearchParams();
    if (params?.fy && params.fy !== "ALL" && params.fy !== "All") searchParams.set("fy", params.fy);
    if (params?.user_id) searchParams.set("user_id", String(params.user_id));
    const query = searchParams.toString() ? `?${searchParams.toString()}` : "";
    const res = await this.request<any>(`/api/targets${query}`);
    if (Array.isArray(res)) {
      return {
        fy_code: params?.fy || "FY 2026-27",
        targets: res,
      };
    }
    return res;
  }

  public async upsertTarget(userId: number, data: TargetUpsertDTO): Promise<{ success: boolean; message: string; target: SalesTargetDTO }> {
    return await this.request<{ success: boolean; message: string; target: SalesTargetDTO }>(`/api/targets/${userId}`, {
      method: "POST",
      body: data,
    });
  }

  public async getReportingSummary(params?: { fy?: string | undefined; as_of_date?: string | undefined }): Promise<ReportingSummaryDTO> {
    const searchParams = new URLSearchParams();
    if (params?.fy && params.fy !== "ALL" && params.fy !== "All") searchParams.set("fy", params.fy);
    if (params?.as_of_date) searchParams.set("as_of_date", params.as_of_date);
    const query = searchParams.toString() ? `?${searchParams.toString()}` : "";
    return await this.request<ReportingSummaryDTO>(`/api/reporting/summary${query}`);
  }

  public async getArAging(params?: { as_of_date?: string | undefined; fy?: string | undefined }): Promise<ArAgingReportDTO> {
    const searchParams = new URLSearchParams();
    if (params?.as_of_date) searchParams.set("as_of_date", params.as_of_date);
    if (params?.fy && params.fy !== "ALL" && params.fy !== "All") searchParams.set("fy", params.fy);
    const query = searchParams.toString() ? `?${searchParams.toString()}` : "";
    return await this.request<ArAgingReportDTO>(`/api/reporting/ar-aging${query}`);
  }

  public async getExecutiveAttainment(params?: { fy?: string | undefined }): Promise<ExecutiveAttainmentReportDTO> {
    const searchParams = new URLSearchParams();
    if (params?.fy && params.fy !== "ALL" && params.fy !== "All") searchParams.set("fy", params.fy);
    const query = searchParams.toString() ? `?${searchParams.toString()}` : "";
    return await this.request<ExecutiveAttainmentReportDTO>(`/api/reporting/attainment${query}`);
  }

  public async getCustomerExposure(params?: { fy?: string | undefined; as_of_date?: string | undefined }): Promise<CustomerExposureReportDTO> {
    const searchParams = new URLSearchParams();
    if (params?.fy && params.fy !== "ALL" && params.fy !== "All") searchParams.set("fy", params.fy);
    if (params?.as_of_date) searchParams.set("as_of_date", params.as_of_date);
    const query = searchParams.toString() ? `?${searchParams.toString()}` : "";
    return await this.request<CustomerExposureReportDTO>(`/api/reporting/customer-exposure${query}`);
  }

  public async createExportToken(params?: { format?: string | undefined; fy?: string | undefined; scope?: string | undefined }): Promise<{ token: string; expires_in: number; expires_at: string; format?: string | undefined; fy?: string | undefined; scope?: string | undefined }> {
    const res = await this.request<any>("/api/export/token", {
      method: "POST",
      body: params || {},
    });
    const secret = res.token || res.ticket || "";
    return {
      token: secret,
      expires_in: res.expires_in ?? 300,
      expires_at: res.expires_at || new Date(Date.now() + 300 * 1000).toISOString(),
      format: res.format,
      fy: res.fy,
      scope: res.scope,
    };
  }

  public async downloadExport(
    format: "excel" | "csv",
    params?: { ticket?: string | undefined; fy?: string | undefined; scope?: string | undefined; as_of_date?: string | undefined }
  ): Promise<{ blob: Blob; filename: string }> {
    if (this.mode !== "live") {
      throw new Error("ApiClient.downloadExport() called while in mock mode.");
    }
    const searchParams = new URLSearchParams();
    if (params?.ticket) searchParams.set("ticket", params.ticket);
    if (params?.fy) searchParams.set("fy", params.fy);
    if (params?.scope) searchParams.set("scope", params.scope);
    if (params?.as_of_date) searchParams.set("as_of_date", params.as_of_date);
    const query = searchParams.toString() ? `?${searchParams.toString()}` : "";
    const cleanEndpoint = `/api/export/${format}${query}`;
    const url = `${this.baseUrl}${cleanEndpoint}`;

    const headers: Record<string, string> = {};
    if (this.inMemoryToken) {
      headers["Authorization"] = `Bearer ${this.inMemoryToken}`;
    }
    const response = await fetch(url, { method: "GET", headers });
    if (!response.ok) {
      let errorMsg = `Export download failed (${response.status})`;
      try {
        const errJson = await response.json();
        if (errJson.detail) errorMsg = typeof errJson.detail === "string" ? errJson.detail : JSON.stringify(errJson.detail);
      } catch {}
      throw new ApiError(response.status, errorMsg);
    }
    const contentDisp = response.headers.get("Content-Disposition") || "";
    let filename = format === "excel" ? "collectflow_export.xlsx" : "collectflow_export.csv";
    const match = contentDisp.match(/filename="?([^";]+)"?/);
    if (match && match[1]) {
      filename = match[1];
    }
    const blob = await response.blob();
    return { blob, filename };
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

export interface PaymentDTO {
  id: number;
  invoice_id: number;
  parent_transaction_id?: number | null | undefined;
  is_superseded?: boolean | undefined;
  transaction_type: 'PAYMENT' | 'REVERSAL' | 'ADJUSTMENT';
  cash_amount: string;
  payment_amount: string;
  tds_amount: string;
  total_settled: string;
  net_settled: string;
  tds_section?: string | null | undefined;
  payment_date: string;
  payment_mode: string;
  remittance_number?: string | null | undefined;
  notes?: string | null | undefined;
  recorded_by: number;
  created_at?: string | null | undefined;
  invoice_number: string;
  invoice_lifecycle_status?: string | null | undefined;
  customer_id: number;
  customer_name: string;
  fy_code: string;
}

export interface PaymentSummaryDTO {
  total_cash: string;
  total_tds: string;
  total_settled: string;
  transaction_count?: number | undefined;
}

export interface PaymentCreateDTO {
  invoice_id: number;
  payment_amount: number | string;
  tds_amount?: number | string | undefined;
  tds_section?: string | null | undefined;
  payment_date: string;
  payment_mode?: string | undefined;
  remittance_number?: string | null | undefined;
  notes?: string | null | undefined;
  idempotency_key?: string | null | undefined;
}

export interface PaymentCorrectionDTO {
  reason: string;
  corrected_payment_amount: number | string;
  corrected_tds_amount?: number | string | undefined;
  corrected_tds_section?: string | null | undefined;
  corrected_payment_date: string;
  corrected_payment_mode?: string | undefined;
  corrected_remittance_number?: string | null | undefined;
  notes?: string | null | undefined;
}

export interface SalesTargetDTO {
  id?: number | null;
  user_id: number;
  username?: string;
  full_name?: string | null;
  executive_name?: string | null;
  role?: string;
  is_active?: boolean;
  fy_code: string;
  target_amount?: string;
  yearly_target?: string;
  half_yearly_target?: string;
  quarterly_target?: string;
  monthly_target?: string;
  monthly_bottom_line?: string;
  yearly_bottom_line?: string;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface TargetUpsertDTO {
  fy_code: string;
  yearly_target: number | string;
  half_yearly_target?: number | string | undefined;
  quarterly_target?: number | string | undefined;
  monthly_target?: number | string | undefined;
  monthly_bottom_line?: number | string | undefined;
  yearly_bottom_line?: number | string | undefined;
  target_amount?: number | string | undefined;
}

export interface ReportingSummaryDTO {
  fy_code: string;
  as_of_date: string;
  total_invoiced: string;
  total_exclusive?: string;
  total_tax?: string;
  total_settled: string;
  total_cash: string;
  total_tds: string;
  total_outstanding: string;
  total_overdue: string;
  unbilled_orders_value: string;
  total_invoices?: number;
  active_invoices_count?: number;
  unbilled_count?: number;
  active_orders_count?: number;
  collection_rate_pct?: number | string;
  settlement_ratio_pct?: number;
  collection_efficiency_pct?: number;
}

export interface ArAgingBucketDTO {
  bucket_id?: string;
  bucket?: string;
  label?: string;
  min_days?: number | null;
  max_days?: number | null;
  amount: string;
  count?: number;
  invoice_count?: number;
  percentage?: number;
}

export interface ArAgingInvoiceDTO {
  invoice_id: number;
  invoice_number: string;
  customer_id: number;
  customer_name: string;
  executive_name?: string | null;
  invoice_date: string;
  due_date?: string | null;
  total_amount: string;
  outstanding_balance: string;
  days_overdue: number;
  bucket_id: string;
}

export interface ArAgingReportDTO {
  as_of_date: string;
  total_outstanding: string;
  buckets: ArAgingBucketDTO[];
  invoices?: ArAgingInvoiceDTO[];
  rows?: any[];
}

export interface ExecutiveAttainmentItemDTO {
  user_id: number;
  username?: string;
  full_name?: string | null;
  executive_name?: string | null;
  role?: string;
  is_active?: boolean;
  fy_code?: string;
  target_amount?: string;
  yearly_target?: string;
  achieved_amount?: string;
  actual_sales?: string;
  attainment_pct?: number;
  achievement_pct?: number;
  active_invoices_count?: number;
  order_count?: number;
  outstanding_balance?: string;
}

export interface ExecutiveAttainmentReportDTO {
  fy_code?: string;
  overall?: {
    total_target: string;
    total_achieved: string;
    attainment_pct: number;
  };
  summary?: {
    fy_code: string;
    total_target: string;
    total_actual_sales: string;
    overall_achievement_pct: number;
    total_remaining: string;
    executive_count: number;
    excluded_unbilled_sales: string;
  };
  executives?: ExecutiveAttainmentItemDTO[];
  rows?: ExecutiveAttainmentItemDTO[];
}

export interface CustomerExposureItemDTO {
  customer_id: number;
  customer_name?: string;
  billing_name?: string;
  gstin?: string;
  state?: string;
  total_orders?: number;
  total_billed?: string;
  total_invoiced?: string;
  total_cash?: string;
  total_tds?: string;
  total_settled: string;
  outstanding_balance: string;
  unbilled_value?: string;
  unbilled_orders_value?: string;
  overdue_exposure?: string;
  overdue_balance?: string;
  max_days_overdue?: number;
  invoices_count?: number;
}

export interface CustomerExposureSummaryDTO {
  as_of_date?: string;
  fy_code?: string;
  total_billed: string;
  total_cash: string;
  total_tds: string;
  total_settled: string;
  total_outstanding: string;
  total_overdue: string;
  customer_count: number;
}

export interface CustomerExposureReportDTO {
  as_of_date?: string;
  fy_code?: string;
  total_outstanding?: string;
  rows: CustomerExposureItemDTO[];
  summary: CustomerExposureSummaryDTO;
  customers?: CustomerExposureItemDTO[];
}

export const apiClient = new ApiClient();
