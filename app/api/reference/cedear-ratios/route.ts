import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CajaDeValoresRatioProvider } from '@/core/providers/caja-de-valores-ratios';

const querySchema = z.object({
  symbols: z.string().trim().min(1).max(500),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const { symbols } = querySchema.parse({ symbols: url.searchParams.get('symbols') ?? '' });
    const requested = [...new Set(
      symbols
        .split(',')
        .map((symbol) => symbol.trim().toUpperCase())
        .filter(Boolean),
    )].slice(0, 50);

    const provider = new CajaDeValoresRatioProvider(
      process.env.CEDEAR_CAJA_URL?.trim() || 'https://cajadevalores.com.ar/Servicios/Cedears',
    );
    const ratios = await provider.getRatios(requested);
    const found = new Set(ratios.map((item) => item.symbol));

    return NextResponse.json({
      source: provider.id,
      generatedAt: new Date().toISOString(),
      ratios,
      missing: requested.filter((symbol) => !found.has(symbol)),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid symbols query', details: error.issues }, { status: 400 });
    }
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to load CEDEAR ratios',
    }, { status: 502 });
  }
}
