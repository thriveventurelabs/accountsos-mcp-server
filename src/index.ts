#!/usr/bin/env node
/**
 * AccountsOS MCP Server
 *
 * Gives Claude and other AI assistants access to your UK accounting data via MCP.
 *
 * Usage:
 * 1. Set ACCOUNTSOS_API_KEY environment variable
 * 2. Add to Claude Desktop config:
 *    {
 *      "mcpServers": {
 *        "accountsos": {
 *          "command": "npx",
 *          "args": ["-y", "@thriveventurelabs/accountsos-mcp"],
 *          "env": { "ACCOUNTSOS_API_KEY": "sk_live_xxx" }
 *        }
 *      }
 *    }
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { AccountsOS, AccountsOSError } from "./client.js";

// Get API key from environment
const apiKey = process.env.ACCOUNTSOS_API_KEY;
if (!apiKey) {
  console.error("Error: ACCOUNTSOS_API_KEY environment variable is required");
  console.error("Get your API key at https://accounts-os.com/settings");
  process.exit(1);
}

// Initialize AccountsOS client
const client = new AccountsOS({
  apiKey,
  baseUrl: process.env.ACCOUNTSOS_BASE_URL,
});

// Create MCP server
const server = new Server(
  {
    name: "accountsos",
    version: "0.2.3",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// ============================================
// Tool Definitions
// ============================================

server.setRequestHandler(ListToolsRequestSchema, async () => {
  // Single source of truth: ask the backend for its live tool catalogue so this
  // package never drifts from what Finn actually exposes. Falls back to the
  // built-in list below only if the backend is unreachable at startup.
  try {
    const tools = await client.listTools();
    if (Array.isArray(tools) && tools.length > 0) {
      return { tools };
    }
  } catch {
    // unreachable backend — use the built-in fallback list below
  }
  return {
    tools: [
      // Read Tools
      {
        name: "get_transactions",
        description:
          "Get transactions with optional filters. Use this to query financial transactions, expenses, and income.",
        inputSchema: {
          type: "object",
          properties: {
            from_date: {
              type: "string",
              description: "Start date (YYYY-MM-DD)",
            },
            to_date: {
              type: "string",
              description: "End date (YYYY-MM-DD)",
            },
            category: {
              type: "string",
              description: "Filter by category name",
            },
            min_amount: {
              type: "number",
              description: "Minimum amount",
            },
            max_amount: {
              type: "number",
              description: "Maximum amount",
            },
            search: {
              type: "string",
              description: "Search in description",
            },
            limit: {
              type: "number",
              minimum: 1,
              maximum: 100,
              description: "Max results to return. Default: 50",
            },
          },
        },
      },
      {
        name: "get_balance",
        description:
          "Get current account balance. Shows total balance and breakdown by account.",
        inputSchema: {
          type: "object",
          properties: {
            account_id: {
              type: "string",
              description: "Specific account ID (optional, shows all if not provided)",
            },
          },
        },
      },
      {
        name: "get_deadlines",
        description:
          "Get upcoming tax and filing deadlines. Shows VAT returns, corporation tax, confirmation statements, etc.",
        inputSchema: {
          type: "object",
          properties: {
            include_completed: {
              type: "boolean",
              description: "Include completed deadlines. Default: false",
            },
          },
        },
      },
      {
        name: "get_vat_summary",
        description:
          "Get VAT summary for a quarter. Shows VAT output (charged), input (reclaimable), and amount due.",
        inputSchema: {
          type: "object",
          properties: {
            quarter: {
              type: "string",
              description: 'Quarter (e.g., "Q1 2025"). Default: current quarter',
            },
          },
        },
      },
      {
        name: "search_documents",
        description:
          "Search uploaded documents like receipts and invoices by content or vendor name.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query",
            },
            type: {
              type: "string",
              enum: ["receipt", "invoice", "statement"],
              description: "Filter by document type",
            },
          },
          required: ["query"],
        },
      },
      { name: "upload_document", description: "Upload a document (receipt, invoice, bank statement) for AI processing and data extraction.", inputSchema: { type: "object", properties: { file_name: { type: "string", description: 'Original filename (e.g., "receipt.pdf")' }, file_data: { type: "string", description: "Base64-encoded file content" }, document_type: { type: "string", enum: ["receipt", "invoice", "bank_statement", "other"], description: "Type of document" } }, required: ["file_name", "file_data"] } },

      // --- Knowledge base ---
      { name: "read_wiki", description: "Read a page from Finn's knowledge base — compiled UK/US tax and accounting guidance. Call with page=\"index\" first to list all pages.", inputSchema: { type: "object", properties: { page: { type: "string", description: 'Wiki page name (e.g. "index", "corporation-tax", "vat", "ir35", "us-sales-tax-nexus")' } }, required: ["page"] } },
      { name: "search_wiki", description: "Search Finn's knowledge base by keyword. Returns matching page names and excerpts.", inputSchema: { type: "object", properties: { query: { type: "string", description: 'Search keyword (e.g. "marginal relief", "flat rate scheme")' } }, required: ["query"] } },

      // --- Company memory ---
      { name: "read_company_wiki", description: "Read a page from this company's private memory wiki (Finn's long-term per-company notes). Call with slug=\"index\" first to list pages.", inputSchema: { type: "object", properties: { slug: { type: "string", description: 'Page slug (defaults to "index")' } } } },
      { name: "search_company_wiki", description: "Search this company's private memory wiki by keyword.", inputSchema: { type: "object", properties: { query: { type: "string", description: "Search keyword" } }, required: ["query"] } },

      // --- Tax reference ---
      { name: "get_tax_facts", description: "Look up current UK tax rates, thresholds and allowances (income_tax, national_insurance, corporation_tax, dividends, capital_allowances, vat, pensions, mileage, etc.). Returns the figure plus source.", inputSchema: { type: "object", properties: { category: { type: "string", description: 'Tax category (e.g. "income_tax", "dividends", "mileage")' }, item: { type: "string", description: "Specific item (optional)" }, tax_year: { type: "string", description: 'Tax year (e.g. "2025-26"). Defaults to current.' } }, required: ["category"] } },
      { name: "search_tax_facts", description: "Search UK tax knowledge by keyword across all categories.", inputSchema: { type: "object", properties: { query: { type: "string", description: 'Search query (e.g. "employment allowance")' }, tax_year: { type: "string", description: "Tax year. Defaults to current." } }, required: ["query"] } },
      {
        name: "list_categories",
        description:
          "List available transaction categories for categorization. UK GAAP compliant categories.",
        inputSchema: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["income", "expense", "asset", "liability", "equity"],
              description: "Filter by category type",
            },
          },
        },
      },

      // Write Tools
      {
        name: "create_transaction",
        description:
          "Create a new manual transaction. Will auto-categorize if no category provided.",
        inputSchema: {
          type: "object",
          properties: {
            date: {
              type: "string",
              description: "Transaction date (YYYY-MM-DD)",
            },
            description: {
              type: "string",
              description: "Transaction description",
            },
            amount: {
              type: "number",
              description: "Amount (positive number)",
            },
            direction: {
              type: "string",
              enum: ["in", "out"],
              description: "Money direction: in (income) or out (expense)",
            },
            category_id: {
              type: "string",
              description: "Category ID (optional - will auto-categorize if not provided)",
            },
            counterparty: {
              type: "string",
              description: "Name of the other party (client, supplier, etc.)",
            },
            notes: {
              type: "string",
              description: "Additional notes",
            },
          },
          required: ["date", "description", "amount", "direction"],
        },
      },
      {
        name: "update_transaction",
        description:
          "Update a transaction's category, notes, or reconciliation status.",
        inputSchema: {
          type: "object",
          properties: {
            transaction_id: {
              type: "string",
              description: "Transaction ID to update",
            },
            category_id: {
              type: "string",
              description: "New category ID",
            },
            notes: {
              type: "string",
              description: "Notes to add or update",
            },
            reconciled: {
              type: "boolean",
              description: "Mark as reconciled",
            },
          },
          required: ["transaction_id"],
        },
      },
      {
        name: "categorize_transaction",
        description:
          "Get AI-suggested category for a transaction. Returns category, confidence score, and reasoning.",
        inputSchema: {
          type: "object",
          properties: {
            transaction_id: {
              type: "string",
              description: "Transaction ID to categorize",
            },
          },
          required: ["transaction_id"],
        },
      },
      {
        name: "create_deadline",
        description:
          "Create a new tax or filing deadline reminder.",
        inputSchema: {
          type: "object",
          properties: {
            type: {
              type: "string",
              description:
                "Deadline type (e.g., vat_return, corporation_tax, confirmation_statement)",
            },
            due_date: {
              type: "string",
              description: "Due date (YYYY-MM-DD)",
            },
            description: {
              type: "string",
              description: "Description of the deadline",
            },
            period_start: {
              type: "string",
              description: "Period start date",
            },
            period_end: {
              type: "string",
              description: "Period end date",
            },
          },
          required: ["type", "due_date"],
        },
      },

      // --- Contacts ---
      { name: "get_contacts", description: "List contacts (clients, suppliers, leads).", inputSchema: { type: "object", properties: { type: { type: "string", description: "Filter: client, supplier, lead" }, search: { type: "string", description: "Search by name or email" }, limit: { type: "number", description: "Max results (default 50)" } } } },
      { name: "create_contact", description: "Create a new contact.", inputSchema: { type: "object", properties: { name: { type: "string", description: "Contact name" }, email: { type: "string" }, phone: { type: "string" }, type: { type: "string", description: "client, supplier, lead, other" }, company_name: { type: "string" }, notes: { type: "string" } }, required: ["name"] } },

      // --- Bills ---
      { name: "get_bills", description: "Get supplier bills owed by the company.", inputSchema: { type: "object", properties: { status: { type: "string", description: "Filter: draft, received, paid, overdue, all" }, contact_id: { type: "string" }, limit: { type: "number" } } } },
      { name: "create_bill", description: "Record a supplier bill.", inputSchema: { type: "object", properties: { contact_id: { type: "string" }, bill_number: { type: "string" }, bill_date: { type: "string" }, due_date: { type: "string" }, items: { type: "array" }, notes: { type: "string" } }, required: ["contact_id", "bill_date", "due_date", "items"] } },
      { name: "pay_bill", description: "Record a payment against a bill.", inputSchema: { type: "object", properties: { bill_id: { type: "string" }, amount: { type: "number" }, payment_date: { type: "string" }, payment_method: { type: "string" } }, required: ["bill_id", "amount", "payment_date"] } },

      // --- Estimates ---
      { name: "get_estimates", description: "Get estimates/quotes.", inputSchema: { type: "object", properties: { status: { type: "string" }, contact_id: { type: "string" }, limit: { type: "number" } } } },
      { name: "create_estimate", description: "Create a new estimate/quote.", inputSchema: { type: "object", properties: { contact_id: { type: "string" }, estimate_date: { type: "string" }, valid_until: { type: "string" }, items: { type: "array" }, notes: { type: "string" } }, required: ["contact_id", "estimate_date", "items"] } },

      // --- Reports ---
      { name: "get_profit_and_loss", description: "Get Profit and Loss report.", inputSchema: { type: "object", properties: { from_date: { type: "string" }, to_date: { type: "string" } } } },
      { name: "get_balance_sheet", description: "Get Balance Sheet report.", inputSchema: { type: "object", properties: { as_at: { type: "string", description: "Report date (YYYY-MM-DD). Default: today" } } } },
      { name: "get_trial_balance", description: "Get Trial Balance.", inputSchema: { type: "object", properties: { from_date: { type: "string" }, to_date: { type: "string" } } } },

      // --- Tasks ---
      { name: "get_tasks", description: "Get tasks and to-dos.", inputSchema: { type: "object", properties: { completed: { type: "boolean" }, priority: { type: "string" }, limit: { type: "number" } } } },
      { name: "create_task", description: "Create a new task.", inputSchema: { type: "object", properties: { title: { type: "string" }, description: { type: "string" }, priority: { type: "string" }, due_date: { type: "string" }, type: { type: "string" } }, required: ["title"] } },

      // --- Expense Claims ---
      { name: "get_expense_claims", description: "Get expense claims.", inputSchema: { type: "object", properties: { status: { type: "string" }, limit: { type: "number" } } } },

      // --- Bank Accounts ---
      { name: "get_bank_accounts", description: "List bank accounts.", inputSchema: { type: "object", properties: {} } },

      // --- Journal Entries ---
      { name: "get_journal_entries", description: "Get GL journal entries.", inputSchema: { type: "object", properties: { from_date: { type: "string" }, to_date: { type: "string" }, limit: { type: "number" } } } },

      // --- Invoices & DLA ---
      { name: "get_invoices", description: "Get invoices with summary stats.", inputSchema: { type: "object", properties: { status: { type: "string" }, contact_id: { type: "string" }, search: { type: "string" } } } },
      { name: "get_dla_balance", description: "Get Director's Loan Account balance.", inputSchema: { type: "object", properties: { limit: { type: "number" } } } },

      // --- Pipeline ---
      { name: "list_opportunities", description: "List sales pipeline opportunities.", inputSchema: { type: "object", properties: { stage: { type: "string" }, status: { type: "string" }, limit: { type: "number" } } } },
      { name: "get_opportunity", description: "Get opportunity details with notes.", inputSchema: { type: "object", properties: { opportunity_id: { type: "string" } }, required: ["opportunity_id"] } },
      { name: "create_opportunity", description: "Create a new pipeline opportunity.", inputSchema: { type: "object", properties: { name: { type: "string" }, contact_id: { type: "string" }, value: { type: "number" }, stage_id: { type: "string" }, source: { type: "string" }, next_action: { type: "string" }, next_action_at: { type: "string" }, notes: { type: "string" } }, required: ["name"] } },
      { name: "add_opportunity_note", description: "Add a note to an opportunity.", inputSchema: { type: "object", properties: { opportunity_id: { type: "string" }, content: { type: "string" }, type: { type: "string" } }, required: ["opportunity_id", "content"] } },
      { name: "update_opportunity_stage", description: "Move an opportunity to a different stage.", inputSchema: { type: "object", properties: { opportunity_id: { type: "string" }, stage_id: { type: "string" }, next_action: { type: "string" }, next_action_at: { type: "string" } }, required: ["opportunity_id", "stage_id"] } },
      { name: "update_project", description: "Rename a project/deal, or change its notes, contact, or status.", inputSchema: { type: "object", properties: { project_id: { type: "string" }, project_name: { type: "string" }, name: { type: "string" }, notes: { type: "string" }, status: { type: "string" }, contact_id: { type: "string" } } } },
      { name: "delete_project", description: "Delete an empty project/deal. Refuses if records are still linked.", inputSchema: { type: "object", properties: { project_id: { type: "string" }, project_name: { type: "string" } } } },
    ],
  };
});

// ============================================
// Tool Handlers
// ============================================

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // Read Operations
      case "get_transactions": {
        const result = await client.getTransactions({
          from_date: args?.from_date as string | undefined,
          to_date: args?.to_date as string | undefined,
          category: args?.category as string | undefined,
          min_amount: args?.min_amount as number | undefined,
          max_amount: args?.max_amount as number | undefined,
          search: args?.search as string | undefined,
          limit: args?.limit as number | undefined,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "get_balance": {
        const result = await client.getBalance(args?.account_id as string | undefined);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "get_deadlines": {
        const result = await client.getDeadlines(args?.include_completed as boolean | undefined);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "get_vat_summary": {
        const result = await client.getVATSummary(args?.quarter as string | undefined);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "search_documents": {
        const result = await client.searchDocuments(
          args?.query as string,
          args?.type as string | undefined
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "list_categories": {
        const result = await client.listCategories(args?.type as string | undefined);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      // Write Operations
      case "create_transaction": {
        const result = await client.createTransaction({
          date: args?.date as string,
          description: args?.description as string,
          amount: args?.amount as number,
          direction: args?.direction as "in" | "out",
          category_id: args?.category_id as string | undefined,
          counterparty: args?.counterparty as string | undefined,
          notes: args?.notes as string | undefined,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  ...result,
                  message: result.auto_categorized
                    ? `Transaction created and auto-categorized with ${Math.round((result.categorization?.confidence || 0) * 100)}% confidence`
                    : "Transaction created successfully",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "update_transaction": {
        const result = await client.updateTransaction({
          transaction_id: args?.transaction_id as string,
          category_id: args?.category_id as string | undefined,
          notes: args?.notes as string | undefined,
          reconciled: args?.reconciled as boolean | undefined,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  ...result,
                  message: `Transaction updated: ${result.updated_fields.join(", ")}`,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "categorize_transaction": {
        const result = await client.categorizeTransaction(args?.transaction_id as string);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  ...result,
                  confidence_percent: `${Math.round(result.confidence * 100)}%`,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "create_deadline": {
        const result = await client.createDeadline({
          type: args?.type as string,
          due_date: args?.due_date as string,
          description: args?.description as string | undefined,
          period_start: args?.period_start as string | undefined,
          period_end: args?.period_end as string | undefined,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  ...result,
                  message: "Deadline created successfully",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // All other tools: generic passthrough to the backend API.
      // The backend server.ts validates and dispatches; the npm package
      // just needs to proxy the request and return the JSON result.
      default: {
        const result = await client.callTool(name, args || {});
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }
    }
  } catch (error) {
    const message =
      error instanceof AccountsOSError
        ? `${error.code}: ${error.message}`
        : error instanceof Error
          ? error.message
          : "Unknown error";
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// ============================================
// Resource Definitions
// ============================================

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: "accountsos://company",
        name: "Company",
        description: "Company details and settings",
        mimeType: "application/json",
      },
      {
        uri: "accountsos://transactions",
        name: "Recent Transactions",
        description: "Most recent 50 transactions",
        mimeType: "application/json",
      },
      {
        uri: "accountsos://documents",
        name: "Documents",
        description: "Uploaded receipts and invoices",
        mimeType: "application/json",
      },
      {
        uri: "accountsos://deadlines",
        name: "Deadlines",
        description: "Upcoming tax and filing deadlines",
        mimeType: "application/json",
      },
    ],
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  try {
    switch (uri) {
      case "accountsos://company": {
        const result = await client.getCompany();
        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "accountsos://transactions": {
        const result = await client.getRecentTransactions();
        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "accountsos://documents": {
        const result = await client.getDocuments();
        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "accountsos://deadlines": {
        const result = await client.getDeadlinesResource();
        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown resource: ${uri}`);
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Failed to read resource: ${message}`);
  }
});

// ============================================
// Start Server
// ============================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("AccountsOS MCP server running");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
