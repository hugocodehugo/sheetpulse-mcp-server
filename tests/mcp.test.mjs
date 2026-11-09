import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { handleJsonRpc } = require('../index.js');

test('MCP Server responds to initialize and tools/list over JSON-RPC 2.0', () => {
  const initRes = handleJsonRpc({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  assert.equal(initRes.result.serverInfo.name, 'sheetpulse-ai-mcp');
  assert.equal(initRes.result.serverInfo.version, '1.1.0');

  const listRes = handleJsonRpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.equal(listRes.result.tools.length, 2);
  assert.equal(listRes.result.tools[0].name, 'sheetpulse_clean_table');
  assert.equal(listRes.result.tools[1].name, 'sheetpulse_b2b_expense_pack');
});

test('MCP Server sheetpulse_clean_table cleans currency & deduplicates', () => {
  const callRes = handleJsonRpc({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'sheetpulse_clean_table',
      arguments: {
        rows: [
          ['Vendor', 'Amount'],
          ['AWS', '$1,450.00'],
          ['AWS', '$1,450.00'],
          ['Vercel', '$20.00'],
        ],
        normalizeNumbers: true,
        deduplicate: true,
      },
    },
  });
  const data = JSON.parse(callRes.result.content[0].text);
  assert.equal(data.rowCount, 3);
  assert.deepEqual(data.cleanedRows[1], ['AWS', '1450.00']);
  assert.ok(data.tsv.includes('AWS\t1450.00'));
});

test('MCP Server sheetpulse_b2b_expense_pack detects @company.com and generates <$50 invoice', () => {
  const callRes = handleJsonRpc({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: {
      name: 'sheetpulse_b2b_expense_pack',
      arguments: { email: 'head.data@notion.so' },
    },
  });
  const data = JSON.parse(callRes.result.content[0].text);
  assert.equal(data.domainInspection.isCorporate, true);
  assert.equal(data.domainInspection.domain, 'notion.so');
  assert.ok(data.managerSlackPitch.includes('$29/mo'));
  assert.ok(data.expenseInvoiceHtml.includes('$29.00'));
});
