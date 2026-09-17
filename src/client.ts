/**
 * AccountsOS API Client
 *
 * Simple HTTP client for calling AccountsOS backend from the MCP server.
 */

export interface AccountsOSConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  currency: string;
  category: string | null;
  merchant_name: string | null;
  type: "income" | "expense";
  vat_amount: number | null;
  vat_rate: number | null;
}

export interface Balance {
  total_balance: number;
  currency: string;
  accounts: Array<{
    id: string;
    name: string;
    balance: number;
    currency: string;
  }>;
}

export interface Deadline {
  id: string;
  type: string;
  due_date: string;
  status: string;
  description: string | null;
  period_start: string | null;
  period_end: string | null;
}

export interface VATSummary {
  vat_output: number;
  vat_input: number;
  vat_due: number;
  period: { start: string; end: string };
}

export interface Document {
  id: string;
  name: string;
  type: string;
  created_at: string;
  description: string | null;
  vendor_name: string | null;
  amount: number | null;
}

export interface Category {
  id: string;
  code: string;
  name: string;
  type: string;
  tax_deductible: boolean;
  description: string | null;
}

export interface Company {
  id: string;
  name: string;
  trading_name: string | null;
  company_number: string | null;
  vat_registered: boolean;
  vat_number: string | null;
}

export class AccountsOSError extends Error {
  constructor(
    public code: string,
    message: string,
    public status?: number
  ) {
    super(message);
    this.name = "AccountsOSError";
  }
}

export class AccountsOS {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: AccountsOSConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || "https://accounts-os.com";
  }

  private async request<T>(
    type: "tool" | "resource",
    nameOrUri: string,
    args?: Record<string, unknown>
  ): Promise<T> {
    const body =
      type === "tool"
        ? { type: "tool", name: nameOrUri, arguments: args || {} }
        : { type: "resource", uri: nameOrUri };

    const response = await fetch(`${this.baseUrl}/api/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new AccountsOSError(
        error.error?.code || "request_failed",
        error.error?.message || `Request failed with status ${response.status}`,
        response.status
      );
    }

    const data = await response.json();
    return data.result as T;
  }

  /**
   * Generic tool call. Used for tools where a dedicated typed method
   * doesn't exist yet. The backend validates and dispatches.
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    return this.request("tool", name, args);
  }

  /**
   * Fetch the live tool catalogue from the backend (JSON-RPC tools/list, no
   * auth needed). This is the single source of truth: whatever Finn exposes
   * over MCP, this returns, so the server never drifts from a hard-coded list.
   */
  async listTools(): Promise<
    Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>
  > {
    // Retry once. A single transient failure here is expensive out of all
    // proportion to its cause: the caller falls back to a small built-in list,
    // so the user silently gets a fraction of the tools with no error anywhere.
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}/api/mcp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) {
          throw new AccountsOSError(
            "tools_list_failed",
            `tools/list failed (${response.status})`,
            response.status
          );
        }
        const data = await response.json();
        return data?.result?.tools ?? [];
      } catch (error) {
        lastError = error;
        if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    throw lastError;
  }

  // ============================================
  // Read Operations
  // ============================================

  async getTransactions(params?: {
    from_date?: string;
    to_date?: string;
    category?: string;
    min_amount?: number;
    max_amount?: number;
    search?: string;
    limit?: number;
  }): Promise<{ transactions: Transaction[]; count: number }> {
    return this.request("tool", "get_transactions", params);
  }

  async getBalance(accountId?: string): Promise<Balance> {
    return this.request("tool", "get_balance", { account_id: accountId });
  }

  async getDeadlines(
    includeCompleted?: boolean
  ): Promise<{ deadlines: Deadline[]; count: number }> {
    return this.request("tool", "get_deadlines", {
      include_completed: includeCompleted,
    });
  }

  async getVATSummary(quarter?: string): Promise<VATSummary> {
    return this.request("tool", "get_vat_summary", { quarter });
  }

  async searchDocuments(
    query: string,
    type?: string
  ): Promise<{ documents: Document[]; count: number }> {
    return this.request("tool", "search_documents", { query, type });
  }

  async listCategories(
    type?: string
  ): Promise<{ categories: Category[]; count: number }> {
    return this.request("tool", "list_categories", { type });
  }

  // ============================================
  // Write Operations
  // ============================================

  async createTransaction(params: {
    date: string;
    description: string;
    amount: number;
    direction: "in" | "out";
    category_id?: string;
    counterparty?: string;
    notes?: string;
  }): Promise<{
    transaction_id: string;
    auto_categorized: boolean;
    categorization: { confidence: number; reasoning: string } | null;
  }> {
    return this.request("tool", "create_transaction", params);
  }

  async updateTransaction(params: {
    transaction_id: string;
    category_id?: string;
    notes?: string;
    reconciled?: boolean;
  }): Promise<{
    transaction_id: string;
    updated_fields: string[];
  }> {
    return this.request("tool", "update_transaction", params);
  }

  async categorizeTransaction(transactionId: string): Promise<{
    suggested_category: string | null;
    suggested_category_id: string | null;
    confidence: number;
    reasoning: string;
    is_business_expense: boolean;
    tax_deductible: boolean;
  }> {
    return this.request("tool", "categorize_transaction", {
      transaction_id: transactionId,
    });
  }

  async createDeadline(params: {
    type: string;
    due_date: string;
    description?: string;
    period_start?: string;
    period_end?: string;
  }): Promise<{
    deadline_id: string;
    type: string;
    due_date: string;
  }> {
    return this.request("tool", "create_deadline", params);
  }

  async uploadDocument(params: {
    file_name: string;
    file_data: string;
    document_type?: "receipt" | "invoice" | "bank_statement" | "other";
  }): Promise<{
    document_id: string;
    status: string;
    extracted_data: Record<string, unknown> | null;
  }> {
    return this.request("tool", "upload_document", params);
  }

  // ============================================
  // Resources
  // ============================================

  async getCompany(): Promise<{ company: Company }> {
    return this.request("resource", "accountsos://company");
  }

  async getRecentTransactions(): Promise<{
    transactions: Transaction[];
    count: number;
  }> {
    return this.request("resource", "accountsos://transactions");
  }

  async getDocuments(): Promise<{ documents: Document[]; count: number }> {
    return this.request("resource", "accountsos://documents");
  }

  async getDeadlinesResource(): Promise<{
    deadlines: Deadline[];
    count: number;
  }> {
    return this.request("resource", "accountsos://deadlines");
  }
}
