// An inline failure with Retry (App Flow §15.9). It replaces the data it was loading, so a stale
// table is never left looking current, and it is announced: a moderator may have triggered the
// load from a keyboard and not be watching that part of the screen.
import { errorMessage } from '@/api/errors';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export function ErrorBanner({ error, onRetry, className }: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <Card className={className ?? 'mt-4 p-4'}>
      <p role="alert">{errorMessage(error)}</p>
      {onRetry && <Button className="mt-3" onClick={onRetry}>Try again</Button>}
    </Card>
  );
}
