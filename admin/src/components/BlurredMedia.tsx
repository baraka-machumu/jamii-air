// Reported media, blurred until the moderator asks for it (Plan 4.4). A report queue is a stream
// of other people's worst content, and nudity and violence are two of the seven reasons the app
// offers: the image loads but stays obscured, so nothing appears on a shared screen until someone
// decides to look at it.
//
// The cover is a real button, so it is reachable by keyboard and announced for what it is, and the
// blur is CSS over the loaded image rather than a separate thumbnail - the server sends one URL,
// and a click should not then wait for a download.
import { useState } from 'react';
import { cn } from '@/lib/utils';

export function BlurredMedia({ src, alt, reason, className }: {
  src: string;
  /** What the image is, for a screen reader and for a broken URL. */
  alt: string;
  /** Printed on the cover, so the moderator knows what they are about to see. */
  reason?: string;
  className?: string;
}) {
  const [shown, setShown] = useState(false);

  return (
    <div className={cn('relative overflow-hidden rounded-lg border bg-secondary', className)}>
      <img
        src={src}
        alt={alt}
        className={cn(
          'block h-full w-full object-contain transition-[filter] duration-200',
          !shown && 'blur-2xl',
        )}
      />
      {!shown ? (
        <button
          type="button"
          onClick={() => setShown(true)}
          className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-background/40 text-center backdrop-blur-sm"
        >
          <span className="font-medium">Click to show</span>
          <span className="text-muted-foreground">{reason ? `Reported for ${reason.toLowerCase()}` : 'Reported content'}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setShown(false)}
          className="absolute right-2 top-2 rounded-md bg-background/90 px-2 py-1 text-xs font-medium shadow-sm"
        >
          Hide again
        </button>
      )}
    </div>
  );
}
