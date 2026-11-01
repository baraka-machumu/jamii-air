// Outline icons, 24 pt, 2 pt stroke (Design Brief §4.4); `filled` only for active states (active
// tab, liked heart). Paths match the approved designs.
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type IconName = 'home' | 'search' | 'create' | 'heart' | 'comment' | 'share' | 'more' | 'back'
  | 'close' | 'camera' | 'check' | 'settings' | 'play' | 'video' | 'sound' | 'muted' | 'carousel' | 'reply' | 'lock'
  | 'bell' | 'udaku' | 'ocean' | 'bag' | 'story' | 'tag' | 'image' | 'plus' | 'bookmark' | 'menu' | 'crop';

export function Icon({ name, size = 24, color, filled = false, fillColor, strokeWidth = 2 }: {
  name: IconName;
  size?: number;
  color: string;
  filled?: boolean;
  /** What `filled` fills with, when not the stroke colour (the active tab's tint, §15.4). */
  fillColor?: string;
  strokeWidth?: number;
}) {
  const fill = filled ? (fillColor ?? color) : 'none';
  const common = { stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessible={false}>
      {name === 'home' && <Path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z" fill={fill} {...common} />}
      {name === 'search' && (<><Circle cx={11} cy={11} r={7} {...common} /><Path d="m20 20-3.5-3.5" {...common} /></>)}
      {name === 'create' && (<><Rect x={3} y={3} width={18} height={18} rx={5} fill={fill} {...common} /><Path d="M12 8v8M8 12h8" {...common} stroke={filled ? '#FFFFFF' : color} /></>)}
      {name === 'heart' && <Path d="M12 20.5s-7.5-4.6-9.2-9.3C1.7 8 3.6 4.5 7.2 4.5c2 0 3.6 1.1 4.8 2.8 1.2-1.7 2.8-2.8 4.8-2.8 3.6 0 5.5 3.5 4.4 6.7-1.7 4.7-9.2 9.3-9.2 9.3z" fill={fill} {...common} />}
      {name === 'comment' && <Path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.6L3 21l1.9-5.3A8.5 8.5 0 1 1 21 11.5z" {...common} />}
      {name === 'share' && (<><Path d="M22 2 11 13" {...common} /><Path d="M22 2 15 22l-4-9-9-4z" {...common} /></>)}
      {name === 'more' && (<><Circle cx={5} cy={12} r={1} {...common} /><Circle cx={12} cy={12} r={1} {...common} /><Circle cx={19} cy={12} r={1} {...common} /></>)}
      {name === 'back' && <Path d="m15 18-6-6 6-6" {...common} />}
      {name === 'close' && <Path d="M18 6 6 18M6 6l12 12" {...common} />}
      {name === 'camera' && (<><Path d="M3 8h3l2-3h8l2 3h3v12H3z" {...common} /><Circle cx={12} cy={13} r={4} {...common} /></>)}
      {name === 'check' && <Path d="m5 12.5 4.5 4.5L19 7" {...common} />}
      {name === 'play' && <Path d="M8 5.5v13l11-6.5z" fill={color} {...common} />}
      {name === 'video' && (<><Rect x={2} y={6} width={13} height={12} rx={3} {...common} /><Path d="m16 11 6-3.5v9L16 13z" {...common} /></>)}
      {name === 'sound' && (<><Path d="M4 9h3l4-3.5v13L7 15H4z" {...common} /><Path d="M16 8.5a5 5 0 0 1 0 7" {...common} /></>)}
      {name === 'muted' && (<><Path d="M4 9h3l4-3.5v13L7 15H4z" {...common} /><Path d="m16 9.5 5 5m0-5-5 5" {...common} /></>)}
      {name === 'carousel' && (<><Rect x={7} y={3} width={14} height={14} rx={3} {...common} /><Path d="M17 21H6a3 3 0 0 1-3-3V7" {...common} /></>)}
      {name === 'lock' && (<><Rect x={4} y={10} width={16} height={11} rx={3} {...common} /><Path d="M8 10V7a4 4 0 0 1 8 0v3" {...common} /></>)}
      {name === 'reply' && <Path d="M10 9V5l-7 7 7 7v-4c4.5 0 7.5 1.5 10 5-1-5-4-10-10-10z" {...common} />}
      {name === 'bell' && (<><Path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" fill={fill} {...common} /><Path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" {...common} /></>)}
      {name === 'udaku' && (<><Path d="m3 11 18-5v12L3 14v-3z" fill={fill} {...common} /><Path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" {...common} /></>)}
      {name === 'ocean' && (<>{[6, 12, 18].map((y) => <Path key={y} d={`M2 ${y}c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1`} {...common} />)}</>)}
      {name === 'bag' && (<><Path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" fill={fill} {...common} /><Path d="M3 6h18M16 10a4 4 0 0 1-8 0" {...common} /></>)}
      {name === 'story' && (<><Circle cx={12} cy={12} r={10} strokeDasharray="3 3" {...common} /><Path d="M12 8v8M8 12h8" {...common} /></>)}
      {name === 'tag' && (<><Path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z" {...common} /><Path d="M7 7h.01" {...common} /></>)}
      {name === 'image' && (<><Rect x={3} y={3} width={18} height={18} rx={2} {...common} /><Circle cx={9} cy={9} r={2} {...common} /><Path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" {...common} /></>)}
      {name === 'plus' && <Path d="M5 12h14M12 5v14" {...common} />}
      {name === 'bookmark' && <Path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" fill={fill} {...common} />}
      {name === 'crop' && <Path d="M6 2v14a2 2 0 0 0 2 2h14M18 22V8a2 2 0 0 0-2-2H2" {...common} />}
      {name === 'menu' && <Path d="M4 6h16M4 12h16M4 18h16" {...common} />}
      {name === 'settings' && (<><Path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" {...common} /><Circle cx={12} cy={12} r={3} {...common} /></>)}
    </Svg>
  );
}
