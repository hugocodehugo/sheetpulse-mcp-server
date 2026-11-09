# ⚡ SheetPulse AI — MCP Server (`@sheetpulse/mcp-server`)

[![MCP Protocol](https://img.shields.io/badge/MCP-2024--11--05-10b981?style=flat-square)](https://modelcontextprotocol.io)
[![Smithery Ready](https://img.shields.io/badge/Smithery-Auto--Indexed-3b82f6?style=flat-square)](https://smithery.ai)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-Zero%20(100%25%20Local%20Stdio)-f59e0b?style=flat-square)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=flat-square)](LICENSE)

**Stop burning Claude & Cursor tokens on messy HTML tables and broken currency strings (`$1,299.50 (est.)` → `#VALUE!`).**

**SheetPulse AI MCP Server** gives **Claude Desktop**, **Cursor**, **Windsurf**, and **Cline** a deterministic, zero-latency spreadsheet cleaning & export engine. It strips currency symbols (`$`, `€`, `£`, `¥`), removes thousand-separators, deduplicates rows, and outputs **1-click Google Sheets TSV** and **RFC-4180 UTF-8 CSV** without LLM hallucination.

---

## 🔥 Why Developers & Analysts Install SheetPulse MCP in 10 Seconds

| Pain Point | Raw LLM Prompting (Without SheetPulse) | With `@sheetpulse/mcp-server` |
| :--- | :--- | :--- |
| **Messy Currency & Units** (`$1,299.00 (est.)`, `45.2%`) | LLM misses edge cases or truncates rows after 50 lines, breaking `=SUM()` in Google Sheets | **100% Deterministic Normalization** (`1299.00`, `45.2`) ready for instant math |
| **Token Cost & Speed** | Burns 4,000+ output tokens regenerating a 200-row CSV (~18 seconds) | **Processed Locally in `< 5ms`** via Node.js stdio engine |
| **Google Sheets Paste Alignment** | Markdown tables paste into a single broken cell in Google Sheets | Outputs pure **Tab-Separated Values (`tsv`)** + **RFC-4180 `csv`** |
| **Privacy & Security** | Uploads sensitive financial/CRM tables to third-party scraping APIs | **100% Local Execution** (`stdio` JSON-RPC 2.0, zero external network dependencies) |

---

## 🚀 10-Second Quickstart (Copy & Paste JSON)

### Option 1: Claude Desktop (`claude_desktop_config.json`)
Add this to your `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "sheetpulse-ai": {
      "command": "npx",
      "args": ["-y", "@sheetpulse/mcp-server"]
    }
  }
}
```

### Option 2: Cursor IDE (`.cursor/mcp.json` or Global MCP Settings)
Create or edit `.cursor/mcp.json` in your workspace root:

```json
{
  "mcpServers": {
    "sheetpulse-ai": {
      "command": "npx",
      "args": ["-y", "@sheetpulse/mcp-server"]
    }
  }
}
```

### Option 3: Install via Smithery CLI (1-Line Auto-Config)
```bash
npx -y @smithery/cli install @sheetpulse/mcp-server --client claude
```

---

## 🛠️ Available MCP Tools (`tools/list`)

### 1. `sheetpulse_clean_table`
Cleans, deduplicates, normalizes currency/comma numbers (`$1,299.50` → `1299.50`), and exports a 2D array of rows into Google Sheets TSV and Excel-ready CSV.

- **Input Schema**:
  - `rows` (`string[][]`, required): 2D array of table rows (first row is header).
  - `normalizeNumbers` (`boolean`, default: `true`): Strip currency symbols (`$`, `€`, `£`, `¥`), commas, and annotations into pure numbers.
  - `deduplicate` (`boolean`, default: `true`): Remove duplicate and empty rows automatically.
  - `format` (`"csv" | "tsv" | "both"`, default: `"both"`): Output format selector.

### 2. `sheetpulse_b2b_expense_pack`
Designed for analysts and engineers at corporate domains (`@company.com`) who hit the daily free AI normalization quota and want to expense the **$29/mo SheetPulse Team Plan** under their company's **<$50 No-Approval Corporate Card Policy**.

- **Input Schema**:
  - `email` (`string`, required): Your corporate email address (e.g., `alex@stripe.com`).
- **Returns**:
  - `domainInspection`: Verifies corporate domain eligibility for the `<$50` No-Approval Team Fast-Track.
  - `managerSlackPitch`: A ready-to-send 3-sentence Slack/Teams message to your manager or finance channel.
  - `expenseInvoiceHtml`: A Ramp / Expensify / Brex compliant HTML tax invoice (`Category: Cloud BI & Productivity Software — $29.00 USD/mo, 5 Seats Included`).

---

## 💎 Pricing & Team Expense Fast-Track (`<$50` No-Approval Rule)

- **🟢 Free Forever Tier**:
  - **Unlimited** raw table extraction, row deduplication, and CSV/TSV export (`normalizeNumbers: false`).
  - **3 Free AI Smart Currency/Number Normalizations per day** (resets daily at midnight UTC).
- **🚀 Pro Individual (`$9.90 / month`)**:
  - Unlimited Smart Number & Currency Normalization + 300 AI Schema Mapping credits/month.
- **🏢 Corporate Team Plan (`$29.00 / month` for 5 Seats — Most Popular)**:
  - Priced intentionally at **$29/mo** so any engineer, financial analyst, or ops manager can swipe their corporate Ramp/Brex card **under the standard $50 No-Approval Expense Policy**.
  - Run the `sheetpulse_b2b_expense_pack` tool inside Claude or Cursor with your `@company.com` email to generate your instant tax receipt!

---

## 🧪 Run Verification & Unit Tests Locally

```bash
npm test
# Runs 8/8 automated assertions covering MCP JSON-RPC 2.0 handshake,
# deterministic table cleaning, CFO 3/day circuit breaker, and B2B invoice generation.
```
