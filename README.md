# AccountsOS MCP Server

Query your live AccountsOS ledger from any MCP client (Claude Desktop, Claude Code, Cursor) via the Model Context Protocol.

AccountsOS runs jurisdiction playbooks for 26 countries. The UK is the proof jurisdiction, with live HMRC MTD VAT filing.

**npm:** https://www.npmjs.com/package/@thriveventurelabs/accountsos-mcp

## Installation

### Option 1: Global Install (Recommended)

```bash
npm install -g @thriveventurelabs/accountsos-mcp
```

Then add to Claude Desktop config:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "accountsos": {
      "command": "accountsos-mcp",
      "args": [],
      "env": {
        "ACCOUNTSOS_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### Option 2: Using npx

```json
{
  "mcpServers": {
    "accountsos": {
      "command": "npx",
      "args": ["--yes", "@thriveventurelabs/accountsos-mcp@latest"],
      "env": {
        "ACCOUNTSOS_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Get your API key from [AccountsOS Settings](https://accounts-os.com/settings).

## Available Tools

### Read Operations

| Tool | Description |
|------|-------------|
| `get_transactions` | Query transactions with filters (date, category, amount, search) |
| `get_balance` | Get current account balance(s) |
| `get_deadlines` | View upcoming tax and filing deadlines |
| `get_vat_summary` | Get VAT summary for any quarter |
| `search_documents` | Search uploaded receipts and invoices |
| `list_categories` | List available UK GAAP transaction categories |

### Write Operations

| Tool | Description |
|------|-------------|
| `create_transaction` | Create a new transaction (with auto-categorization) |
| `update_transaction` | Update category, notes, or reconciliation status |
| `categorize_transaction` | Get AI-suggested category for a transaction |
| `create_deadline` | Create a new tax/filing deadline reminder |

## Available Resources

| Resource | Description |
|----------|-------------|
| `accountsos://company` | Company details and settings |
| `accountsos://transactions` | Most recent 50 transactions |
| `accountsos://documents` | Uploaded documents |
| `accountsos://deadlines` | Upcoming deadlines |

## Example Prompts

Once connected, try asking Claude:

- "What's my account balance?"
- "Show me transactions from last month"
- "When is my next VAT deadline?"
- "How much have I spent on software subscriptions?"
- "Create a transaction for lunch with a client, £45"
- "What's my VAT summary for Q4 2024?"

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run locally (for testing)
ACCOUNTSOS_API_KEY=sk_live_xxx npm start
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ACCOUNTSOS_API_KEY` | Yes | Your AccountsOS API key |
| `ACCOUNTSOS_BASE_URL` | No | Override API base URL (default: https://accounts-os.com) |

## Troubleshooting

### Server disconnected

Check logs at `~/Library/Logs/Claude/mcp-server-accountsos.log`

### npx issues

If npx has caching issues, use global install instead:

```bash
npm install -g @thriveventurelabs/accountsos-mcp
```

## License

MIT
