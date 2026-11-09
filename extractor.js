/**
 * SheetPulse AI v1.1.0 — Core Table Extraction, Smart Cleaning, CFO Circuit Breaker & Sales PLG Engine
 * Works in both Chrome Extension DOM context, MCP Server, and Node.js unit test runner.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SheetPulseExtractor = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // CFO Iron Rule: Free tier allows unlimited local DOM extraction ($0 cost),
  // but strictly caps AI Smart Clean & Normalize at 3 runs/day (max 150 rows/run)
  const MAX_FREE_DAILY_AI_RUNS = 3;
  const MAX_FREE_AI_ROWS_PER_RUN = 150;

  const PUBLIC_AND_EDU_DOMAINS = new Set([
    'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com',
    'msn.com', 'yahoo.com', 'ymail.com', 'icloud.com', 'me.com', 'mac.com',
    'qq.com', 'vip.qq.com', '163.com', '126.com', 'yeah.net', 'foxmail.com',
    'sina.com', 'sohu.com', 'aliyun.com', 'proton.me', 'protonmail.com',
    'zoho.com', 'aol.com', 'gmx.com', 'mail.com', 'yandex.com', 'hey.com',
    'fastmail.com', 'tutanota.com'
  ]);

  /**
   * Cleans a single cell string according to user-selected cleaning options.
   */
  function cleanCellValue(raw, options = {}) {
    const {
      stripNewlines = true,
      normalizeNumbers = false,
      trimWhitespace = true,
    } = options;

    if (raw === null || raw === undefined) return '';
    let val = String(raw).replace(/[\u200B-\u200D\uFEFF]/g, '');

    if (stripNewlines) {
      val = val.replace(/[\r\n\t]+/g, ' ');
    }
    if (trimWhitespace) {
      val = val.replace(/\s+/g, ' ').trim();
    }

    if (normalizeNumbers && val) {
      // Match currency/percentage/comma numbers like "$1,299.50", "¥ 3,400", "€99.00", "-$45.2"
      const currencyMatch = val.match(/^([+-]?)\s*[$¥€£₹]\s*([0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(\.[0-9]+)?$/);
      if (currencyMatch) {
        const sign = currencyMatch[1] || '';
        const intPart = currencyMatch[2].replace(/,/g, '');
        const decPart = currencyMatch[3] || '';
        return `${sign}${intPart}${decPart}`;
      }
      // Match plain comma-formatted numbers like "12,345.67"
      const commaNumMatch = val.match(/^([+-]?)([0-9]{1,3}(?:,[0-9]{3})+)(\.[0-9]+)?$/);
      if (commaNumMatch) {
        const sign = commaNumMatch[1] || '';
        const intPart = commaNumMatch[2].replace(/,/g, '');
        const decPart = commaNumMatch[3] || '';
        return `${sign}${intPart}${decPart}`;
      }
    }

    return val;
  }

  /**
   * Cleans a 2D array of rows, optionally removing empty rows and exact duplicate rows.
   */
  function processTableRows(rawRows, options = {}) {
    const {
      deduplicate = true,
      removeEmptyRows = true,
      stripNewlines = true,
      normalizeNumbers = false,
      enforceFreeRowCap = false,
    } = options;

    if (!Array.isArray(rawRows) || rawRows.length === 0) return [];

    const sourceRows = enforceFreeRowCap
      ? rawRows.slice(0, MAX_FREE_AI_ROWS_PER_RUN + 1)
      : rawRows;

    const cleaned = [];
    const seenKeys = new Set();

    sourceRows.forEach((row, rowIndex) => {
      if (!Array.isArray(row)) return;
      const cells = row.map((cell) =>
        cleanCellValue(cell, {
          stripNewlines,
          normalizeNumbers: rowIndex === 0 ? false : normalizeNumbers,
          trimWhitespace: true,
        })
      );

      if (removeEmptyRows && cells.every((c) => c === '')) {
        return;
      }

      if (deduplicate && rowIndex > 0) {
        const key = cells.join('\u0001');
        if (seenKeys.has(key)) return;
        seenKeys.add(key);
      }

      cleaned.push(cells);
    });

    return cleaned;
  }

  /**
   * CFO Circuit Breaker: Evaluates whether a user can run AI Smart Clean & Normalize today.
   */
  function evaluateDailyAiCircuitBreaker(state = {}, todayStr = new Date().toISOString().slice(0, 10)) {
    const isPaid = state.tier === 'pro' || state.tier === 'team';
    if (isPaid) {
      return {
        allowed: true,
        remainingToday: Infinity,
        maxRowsPerRun: 5000,
        reason: 'PAID_UNLIMITED',
        nextState: { ...state, lastDate: todayStr },
      };
    }

    const usedToday = state.lastDate === todayStr ? Number(state.usedToday || 0) : 0;
    const bonusQuota = Math.max(0, Number(state.bonusQuota || 0));
    const dailyRemaining = Math.max(0, MAX_FREE_DAILY_AI_RUNS - usedToday);
    const totalAvailable = dailyRemaining + bonusQuota;

    if (totalAvailable <= 0) {
      return {
        allowed: false,
        remainingToday: 0,
        maxRowsPerRun: MAX_FREE_AI_ROWS_PER_RUN,
        reason: 'CFO_DAILY_3_CIRCUIT_BREAKER_TRIPPED',
        nextState: { ...state, lastDate: todayStr, usedToday },
      };
    }

    let nextUsedToday = usedToday;
    let nextBonus = bonusQuota;
    if (dailyRemaining > 0) {
      nextUsedToday += 1;
    } else {
      nextBonus -= 1;
    }

    return {
      allowed: true,
      remainingToday: totalAvailable - 1,
      maxRowsPerRun: MAX_FREE_AI_ROWS_PER_RUN,
      reason: 'FREE_QUOTA_OK',
      nextState: {
        ...state,
        lastDate: todayStr,
        usedToday: nextUsedToday,
        bonusQuota: nextBonus,
      },
    };
  }

  /**
   * RFC 4180 CSV serializer (with optional UTF-8 BOM for Excel).
   */
  function rowsToCSV(rows, includeBom = true) {
    if (!Array.isArray(rows) || rows.length === 0) return '';
    const lines = rows.map((row) =>
      row
        .map((cell) => {
          const str = cell === null || cell === undefined ? '' : String(cell);
          if (/[",\r\n]/.test(str)) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(',')
    );
    const body = lines.join('\r\n');
    return includeBom ? `\uFEFF${body}` : body;
  }

  /**
   * TSV serializer for 1-Click paste into Google Sheets / Excel.
   */
  function rowsToTSV(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return '';
    return rows
      .map((row) =>
        row
          .map((cell) => {
            const str = cell === null || cell === undefined ? '' : String(cell);
            return str.replace(/[\t\r\n]+/g, ' ').trim();
          })
          .join('\t')
      )
      .join('\n');
  }

  /**
   * Sales B2B Domain Detector: Distinguishes corporate domains (@company.com) from consumer/edu emails.
   */
  function inspectCorporateEmail(email) {
    const clean = String(email || '').trim().toLowerCase();
    const m = clean.match(/^[a-z0-9._%+-]+@([a-z0-9.-]+\.[a-z]{2,})$/i);
    if (!m) {
      return { isValid: false, isCorporate: false, domain: '' };
    }
    const domain = m[1].toLowerCase();
    const isEduOrGov = /\.(edu|ac\.[a-z]{2}|gov|mil)$/i.test(domain);
    const isPublic = PUBLIC_AND_EDU_DOMAINS.has(domain) || isEduOrGov;
    const isCorporate = !isPublic;

    return {
      isValid: true,
      isCorporate,
      domain,
      recommendedPlan: isCorporate
        ? `Team Workspace Plan ($29/mo — No-Approval <$50 Expense Ready for @${domain})`
        : 'Pro Individual Plan ($9.90/mo)',
      checkoutPriceUsd: isCorporate ? 29.0 : 9.9,
    };
  }

  /**
   * Sales PLG Weapon #1: Generates a 3-sentence Manager Reimbursement Pitch for Slack/Teams/Email.
   */
  function generateManagerSlackPitch(params = {}) {
    const domain = params.domain || 'our team';
    return [
      `Hi! I'm using SheetPulse AI to automate our web table & CRM data extraction/cleaning into Google Sheets (saves ~4 hrs/week of manual copy-paste and formula fixing for @${domain}).`,
      `The Team Workspace plan is $29/mo (under our $50 auto-approval software expense limit) and includes 5 shared team seats.`,
      `I've attached the standard Cloud BI & Data ETL tax receipt — putting this on the team card for this month!`
    ].join(' ');
  }

  /**
   * Sales PLG Weapon #2: Generates an Expense-Ready (<$50) Tax Invoice HTML for Ramp/Expensify/Brex.
   */
  function generateExpenseInvoiceHtml(params = {}) {
    const email = params.email || 'user@company.com';
    const domain = params.domain || email.split('@')[1] || 'company.com';
    const dateStr = params.dateStr || new Date().toISOString().slice(0, 10);
    const invoiceNo = params.invoiceNo || `INV-SP-${dateStr.replace(/-/g, '')}-2900`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Tax Invoice ${invoiceNo} — SheetPulse AI Cloud BI</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; max-width: 680px; margin: 32px auto; padding: 28px; border: 1px solid #cbd5e1; border-radius: 10px; }
    .top { display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 20px; }
    .badge { background: #dcfce7; color: #166534; font-weight: 700; font-size: 12px; padding: 4px 10px; border-radius: 999px; display: inline-block; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { border-bottom: 1px solid #e2e8f0; padding: 10px 8px; text-align: left; font-size: 13px; }
    th { background: #f8fafc; font-weight: 700; }
    .total { font-size: 18px; font-weight: 800; text-align: right; margin-top: 12px; }
    .meta { font-size: 12px; color: #475569; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="top">
    <div>
      <h2 style="margin:0;">SheetPulse AI Inc.</h2>
      <div class="meta">Category: Cloud BI &amp; Automated Data ETL Productivity Software</div>
    </div>
    <div style="text-align:right;">
      <span class="badge">PAID / EXPENSE-READY (&lt;$50 AUTO-APPROVAL)</span>
      <div class="meta" style="margin-top:6px;"><strong>Invoice #:</strong> ${invoiceNo}<br><strong>Date:</strong> ${dateStr}</div>
    </div>
  </div>
  <div class="meta">
    <strong>Billed To Organization:</strong> @${domain} (${email})<br>
    <strong>Expense Policy Compliance:</strong> Under $50.00 USD Monthly SaaS Micro-Purchase Threshold (Ramp / Brex / Expensify Ready)
  </div>
  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th>Seats</th>
        <th>Billing Cycle</th>
        <th>Amount (USD)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>SheetPulse AI — Team Workspace License</strong><br><span class="meta">Automated Web Data ETL, Currency Normalization &amp; Google Sheets Integration</span></td>
        <td>Up to 5 (@${domain})</td>
        <td>Monthly</td>
        <td>$29.00</td>
      </tr>
    </tbody>
  </table>
  <div class="total">Total Amount: $29.00 USD</div>
</body>
</html>`;
  }

  /**
   * Extracts tables and ARIA grid tables from a DOM Document.
   */
  function extractTablesFromDocument(doc, options = {}) {
    if (!doc || typeof doc.querySelectorAll !== 'function') return [];
    const results = [];

    const tables = Array.from(doc.querySelectorAll('table'));
    tables.forEach((tbl, idx) => {
      const trs = Array.from(tbl.querySelectorAll('tr'));
      const rawRows = trs.map((tr) => {
        const cells = Array.from(tr.querySelectorAll('th, td'));
        return cells.map((c) => c.innerText ?? c.textContent ?? '');
      });
      const rows = processTableRows(rawRows, options);
      if (rows.length >= 2 && rows[0].length >= 2) {
        const caption = tbl.querySelector('caption')?.textContent?.trim() || '';
        const title = caption || tbl.getAttribute('aria-label') || `Table #${idx + 1} (${rows[0].slice(0, 3).filter(Boolean).join(' · ') || 'Data'})`;
        results.push({
          id: `table-${idx}`,
          sourceType: 'html-table',
          title: title.slice(0, 65),
          rowCount: rows.length,
          colCount: Math.max(...rows.map((r) => r.length)),
          headers: rows[0],
          rows,
        });
      }
    });

    const ariaGrids = Array.from(doc.querySelectorAll('[role="table"], [role="grid"]')).filter(
      (el) => el.tagName.toLowerCase() !== 'table'
    );
    ariaGrids.forEach((grid, idx) => {
      const rowEls = Array.from(grid.querySelectorAll('[role="row"]'));
      const rawRows = rowEls.map((rEl) => {
        const cellEls = Array.from(
          rEl.querySelectorAll('[role="columnheader"], [role="rowheader"], [role="cell"], [role="gridcell"]')
        );
        return cellEls.map((c) => c.innerText ?? c.textContent ?? '');
      });
      const rows = processTableRows(rawRows, options);
      if (rows.length >= 2 && rows[0].length >= 2) {
        const title = grid.getAttribute('aria-label') || `Grid #${idx + 1} (${rows[0].slice(0, 3).filter(Boolean).join(' · ')})`;
        results.push({
          id: `grid-${idx}`,
          sourceType: 'aria-grid',
          title: title.slice(0, 65),
          rowCount: rows.length,
          colCount: Math.max(...rows.map((r) => r.length)),
          headers: rows[0],
          rows,
        });
      }
    });

    return results;
  }

  return {
    MAX_FREE_DAILY_AI_RUNS,
    MAX_FREE_AI_ROWS_PER_RUN,
    cleanCellValue,
    processTableRows,
    evaluateDailyAiCircuitBreaker,
    rowsToCSV,
    rowsToTSV,
    inspectCorporateEmail,
    generateManagerSlackPitch,
    generateExpenseInvoiceHtml,
    extractTablesFromDocument,
  };
});
