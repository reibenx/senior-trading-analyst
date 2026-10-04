import { AnalysisDashboardV2 } from '@/app/components/AnalysisDashboardV2';
import { buildTechnicalSnapshot } from '@/core/engines/technical';
import { createDemoBars } from '@/core/fixtures/demo-market';

export default function Home() {
  const initialBars = createDemoBars();
  const initialSnapshot = buildTechnicalSnapshot({
    symbol: 'NVDA',
    timeframe: '1d',
    bars: initialBars,
  });

  return <AnalysisDashboardV2 initialBars={initialBars} initialSnapshot={initialSnapshot} />;
}
