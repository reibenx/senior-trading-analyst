import { ActivityHistory } from '@/app/components/ActivityHistory';
import { AlertPreferencesPanel } from '@/app/components/AlertPreferencesPanel';

export default function AlertsPage() {
  return (
    <>
      <AlertPreferencesPanel />
      <ActivityHistory />
    </>
  );
}
