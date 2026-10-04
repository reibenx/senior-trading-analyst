import { AnalysisDashboard } from '@/app/components/AnalysisDashboard';
import { buildTechnicalSnapshot } from '@/core/engines/technical';
import { createDemoBars } from '@/core/fixtures/demo-market';

export default function Home() {
  const initialBars = createDemoBars();
  const initialSnapshot = buildTechnicalSnapshot({
    symbol: 'NVDA',
    timeframe: '1d',
    bars: initialBars,
  });

  return <AnalysisDashboard initialBars={initialBars} initialSnapshot={initialSnapshot} />;
}
