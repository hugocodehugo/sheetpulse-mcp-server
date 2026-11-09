#!/usr/bin/env node
/**
 * SheetPulse AI — Standard Model Context Protocol (MCP) Server v1.1.0
 * Zero-cost ($0 registration fee) distribution channel for Claude Desktop, Cursor, Windsurf & MCP Registries.
 * Supports JSON-RPC 2.0 over stdio + programmatic handleJsonRpc() for testing.
 */
'use strict';

const fs = require('node:fs');
const readline = require('node:readline');
const path = require('node:path');
const localExtractorPath = path.resolve(__dirname, './extractor.js');
const fallbackExtractorPath = path.resolve(__dirname, '../sheetpulse-chrome-ext/extractor.js');
const Extractor = require(fs.existsSync(localExtractorPath) ? localExtractorPath : fallbackExtractorPath);

const SERVER_INFO = {
  name: 'sheetpulse-ai-mcp',
  version: '1.1.0',
};

const TOOLS = [
  {
    name: 'sheetpulse_clean_table',
    description:
      'Cleans, deduplicates, normalizes currency/comma numbers ($1,299.50 -> 1299.50), and exports a 2D array of rows into Google Sheets TSV or Excel-ready CSV.',
    inputSchema: {
      type: 'object',
      properties: {
        rows: {
          type: 'array',
          description: '2D array of table rows (first row is header)',
          items: { type: 'array', items: { type: 'string' } },
        },
        normalizeNumbers: {
          type: 'boolean',
          description: 'Strip currency symbols and thousand separators into pure numbers',
          default: true,
        },
        deduplicate: {
          type: 'boolean',
          description: 'Remove duplicate and empty rows',
          default: true,
        },
        format: {
          type: 'string',
          enum: ['csv', 'tsv', 'both'],
          default: 'both',
        },
      },
      required: ['rows'],
    },
  },
  {
    name: 'sheetpulse_b2b_expense_pack',
    description:
      'Inspects a user work email (@company.com), evaluates CFO daily AI quota, and generates a <$50 No-Approval $29/mo Team Expense Invoice HTML + 3-line Manager Slack Pitch.',
    inputSchema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          description: 'User work email (e.g. alex@stripe.com)',
        },
      },
      required: ['email'],
    },
  },
];

let serverQuotaState = {
  tier: 'free',
  lastDate: new Date().toISOString().slice(0, 10),
  usedToday: 0,
  bonusQuota: 0,
};

function handleJsonRpc(req) {
  if (!req || typeof req !== 'object') {
    return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } };
  }

  const { id, method, params } = req;

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        serverInfo: SERVER_INFO,
        capabilities: { tools: {} },
      },
    };
  }

  if (method === 'notifications/initialized') {
    return null;
  }

  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: { tools: TOOLS },
    };
  }

  if (method === 'tools/call') {
    const toolName = params?.name;
    const args = params?.arguments || {};

    if (toolName === 'sheetpulse_clean_table') {
      const normalize = args.normalizeNumbers !== false;
      if (normalize) {
        const check = Extractor.evaluateDailyAiCircuitBreaker(serverQuotaState);
        if (!check.allowed) {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              isError: true,
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    error: 'CFO_DAILY_3_CIRCUIT_BREAKER_TRIPPED',
                    message:
                      'Daily 3 Free AI Smart-Cleans reached! Call sheetpulse_b2b_expense_pack with your @company.com email to unlock the $29/mo (<$50 No-Approval) Team Plan.',
                  }),
                },
              ],
            },
          };
        }
        serverQuotaState = check.nextState;
      }

      const cleanedRows = Extractor.processTableRows(args.rows || [], {
        normalizeNumbers: normalize,
        deduplicate: args.deduplicate !== false,
        removeEmptyRows: true,
        enforceFreeRowCap: serverQuotaState.tier === 'free',
      });

      const payload = {
        rowCount: cleanedRows.length,
        cleanedRows,
        csv: Extractor.rowsToCSV(cleanedRows, false),
        tsv: Extractor.rowsToTSV(cleanedRows),
      };

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
        },
      };
    }

    if (toolName === 'sheetpulse_b2b_expense_pack') {
      const info = Extractor.inspectCorporateEmail(args.email || '');
      const pitch = Extractor.generateManagerSlackPitch({ domain: info.domain || 'our team' });
      const invoiceHtml = Extractor.generateExpenseInvoiceHtml({
        email: args.email || 'user@company.com',
        domain: info.domain || 'company.com',
      });

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  domainInspection: info,
                  managerSlackPitch: pitch,
                  expenseInvoiceHtml: invoiceHtml,
                },
                null,
                2
              ),
            },
          ],
        },
      };
    }

    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `Unknown tool: ${toolName}` },
    };
  }

  return {
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `Method not found: ${method}` },
  };
}

if (require.main === module) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const req = JSON.parse(trimmed);
      const resp = handleJsonRpc(req);
      if (resp) {
        process.stdout.write(JSON.stringify(resp) + '\n');
      }
    } catch (err) {
      process.stdout.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'Parse error' },
        }) + '\n'
      );
    }
  });
}

module.exports = { handleJsonRpc, TOOLS, SERVER_INFO };
