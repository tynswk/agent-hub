import type { ErrorBoundaryProps } from 'expo-router';
import { ErrorScreen } from '@/components/ErrorScreen';

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <ErrorScreen error={error} onRetry={() => void retry()} />;
}
