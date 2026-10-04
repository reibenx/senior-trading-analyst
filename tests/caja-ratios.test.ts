import { describe, expect, it } from 'vitest';
import { parseCajaCedearHtml, parseCedearRatio } from '@/core/providers/caja-de-valores-ratios';

describe('parseCedearRatio', () => {
  it('parses standard CEDEAR ratios', () => {
    expect(parseCedearRatio('24:1')).toBe(24);
    expect(parseCedearRatio('1:2')).toBe(0.5);
    expect(parseCedearRatio('10 : 1')).toBe(10);
  });
});

describe('parseCajaCedearHtml', () => {
  it('extracts BYMA symbol, underlying ticker and ratio from Caja table rows', () => {
    const html = `
      <table>
        <tr>
          <td>NVIDIA CORPORATION</td>
          <td>NVDA</td>
          <td>NVDA</td>
          <td>9999</td>
          <td>ARTEST</td>
          <td>123</td>
          <td>US123</td>
          <td>NASDAQ</td>
          <td>24:1</td>
          <td>1000000</td>
          <td>Calificado y No Calificado</td>
        </tr>
      </table>`;

    const result = parseCajaCedearHtml(html, '2026-10-04T00:00:00Z');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      symbol: 'NVDA',
      underlyingSymbol: 'NVDA',
      cedearsPerUnderlyingShare: 24,
      source: 'caja-de-valores',
    });
  });
});
