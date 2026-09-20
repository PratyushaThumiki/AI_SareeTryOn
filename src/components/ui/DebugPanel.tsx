'use client';

import type { TryOnStats } from '@/lib/hooks/useTryOnLoop';
import type { VisionFrame } from '@/lib/vision/types';

interface DebugPanelProps {
  stats: TryOnStats;
  vision: VisionFrame | null;
}

export function DebugPanel({ stats, vision }: DebugPanelProps) {
  const lmCount = vision?.landmarks?.length ?? 0;
  const hasMask = Boolean(vision?.segmentation);

  return (
    <div
      role="region"
      aria-label="Development debug panel"
      className="font-mono text-[11px] leading-5 text-muted"
    >
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        <span className="text-edge">FPS</span>
        <span className={stats.fps < 15 ? 'text-danger' : stats.fps < 24 ? 'text-accent' : 'text-privacyOk'}>
          {stats.fps}
        </span>
        <span className="text-edge">Vision</span>
        <span>{stats.visionMs} ms</span>
        <span className="text-edge">Render</span>
        <span>{stats.renderMs} ms</span>
        <span className="text-edge">Pose pts</span>
        <span>{lmCount}</span>
        <span className="text-edge">Seg mask</span>
        <span>{hasMask ? 'yes' : 'no'}</span>
        {vision?.reason && (
          <>
            <span className="text-edge">Reason</span>
            <span className="text-accent">{vision.reason}</span>
          </>
        )}
      </div>
    </div>
  );
}
