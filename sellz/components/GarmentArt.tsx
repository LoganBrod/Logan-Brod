/**
 * Garment illustrations for the banner's listing cards.
 *
 * Drawn rather than photographed: the banner must not wait on a network
 * request, and a stock photo of clothing would imply inventory this seller
 * does not have. Sleeves, hems and drawstrings are separate groups so each
 * can pivot from its own seam — see the .garment* rules in globals.css.
 */

export interface Palette {
  /** Main fabric */
  fabric: string;
  /** Shadowed side of the fabric */
  shade: string;
  /** Topstitching and seams */
  stitch: string;
}

const STITCH_DASH = "5 4";

function Stitch({ d }: { d: string }) {
  return (
    <path
      d={d}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeDasharray={STITCH_DASH}
      strokeLinecap="round"
      opacity="0.55"
    />
  );
}

export function DenimJacket({ p }: { p: Palette }) {
  return (
    <svg viewBox="0 0 200 230" className="h-full w-full" aria-hidden>
      <g className="garment" color={p.stitch}>
        {/* Sleeves pivot at the shoulder seam */}
        <g className="garment-sleeve-l">
          <path d="M62 50 L40 58 L26 148 L52 158 L60 66 Z" fill={p.shade} />
          <path d="M26 148 L52 158 L48 176 L22 166 Z" fill={p.fabric} />
          <Stitch d="M32 150 L54 159" />
        </g>
        <g className="garment-sleeve-r">
          <path d="M138 50 L160 58 L174 148 L148 158 L140 66 Z" fill={p.shade} />
          <path d="M174 148 L148 158 L152 176 L178 166 Z" fill={p.fabric} />
          <Stitch d="M168 150 L146 159" />
        </g>

        {/* Body */}
        <path d="M62 48 L138 48 L146 196 L54 196 Z" fill={p.fabric} />
        {/* Yoke seam across the chest */}
        <Stitch d="M62 76 L138 76" />

        {/* Collar */}
        <path d="M84 44 L100 60 L116 44 L110 38 L100 50 L90 38 Z" fill={p.shade} />

        {/* Button placket */}
        <path d="M96 52 L104 52 L104 196 L96 196 Z" fill={p.shade} opacity="0.75" />
        {[86, 116, 146, 176].map((y) => (
          <circle key={y} cx="100" cy={y} r="3" fill={p.stitch} opacity="0.8" />
        ))}

        {/* Chest pockets with flaps */}
        <g>
          <path d="M70 92 L92 92 L92 118 L70 118 Z" fill={p.shade} opacity="0.65" />
          <path d="M68 88 L94 88 L94 98 L68 98 Z" fill={p.fabric} />
          <Stitch d="M70 100 L92 100" />
        </g>
        <g>
          <path d="M108 92 L130 92 L130 118 L108 118 Z" fill={p.shade} opacity="0.65" />
          <path d="M106 88 L132 88 L132 98 L106 98 Z" fill={p.fabric} />
          <Stitch d="M108 100 L130 100" />
        </g>

        {/* Waistband */}
        <path d="M54 182 L146 182 L146 196 L54 196 Z" fill={p.shade} />
        <Stitch d="M58 189 L142 189" />
      </g>
    </svg>
  );
}

export function Hoodie({ p }: { p: Palette }) {
  return (
    <svg viewBox="0 0 200 230" className="h-full w-full" aria-hidden>
      <g className="garment" color={p.stitch}>
        <g className="garment-sleeve-l">
          <path d="M60 58 L36 68 L22 150 L50 160 L58 74 Z" fill={p.shade} />
          <path d="M22 150 L50 160 L46 180 L18 170 Z" fill={p.fabric} />
        </g>
        <g className="garment-sleeve-r">
          <path d="M140 58 L164 68 L178 150 L150 160 L142 74 Z" fill={p.shade} />
          <path d="M178 150 L150 160 L154 180 L182 170 Z" fill={p.fabric} />
        </g>

        {/* Body */}
        <path d="M60 56 L140 56 L148 194 L52 194 Z" fill={p.fabric} />

        {/* Hood, sitting behind the shoulders */}
        <path d="M76 56 C76 26 124 26 124 56 C114 46 86 46 76 56 Z" fill={p.shade} />
        <path d="M82 56 C88 44 112 44 118 56 Z" fill={p.fabric} opacity="0.5" />

        {/* Drawstrings, each swinging on its own */}
        <g className="garment-string">
          <path d="M90 58 L88 92" stroke={p.stitch} strokeWidth="2.6" strokeLinecap="round" fill="none" />
          <circle cx="88" cy="94" r="2.6" fill={p.stitch} />
        </g>
        <g className="garment-string garment-string-b">
          <path d="M110 58 L112 88" stroke={p.stitch} strokeWidth="2.6" strokeLinecap="round" fill="none" />
          <circle cx="112" cy="90" r="2.6" fill={p.stitch} />
        </g>

        {/* Kangaroo pocket */}
        <path d="M70 130 L130 130 L134 168 L66 168 Z" fill={p.shade} opacity="0.7" />
        <Stitch d="M70 132 L130 132" />

        {/* Ribbed hem */}
        <path d="M52 178 L148 178 L148 194 L52 194 Z" fill={p.shade} />
        {[64, 76, 88, 100, 112, 124, 136].map((x) => (
          <path key={x} d={`M${x} 180 L${x} 192`} stroke={p.stitch} strokeWidth="1.2" opacity="0.4" />
        ))}
      </g>
    </svg>
  );
}

export function Tee({ p }: { p: Palette }) {
  return (
    <svg viewBox="0 0 200 230" className="h-full w-full" aria-hidden>
      <g className="garment" color={p.stitch}>
        <g className="garment-sleeve-l">
          <path d="M64 54 L34 66 L22 108 L52 120 L62 78 Z" fill={p.shade} />
          <Stitch d="M26 106 L52 117" />
        </g>
        <g className="garment-sleeve-r">
          <path d="M136 54 L166 66 L178 108 L148 120 L138 78 Z" fill={p.shade} />
          <Stitch d="M174 106 L148 117" />
        </g>

        <path d="M64 52 L136 52 L142 190 L58 190 Z" fill={p.fabric} />

        {/* Ribbed neckline */}
        <path d="M82 50 C88 66 112 66 118 50 L112 44 C108 56 92 56 88 44 Z" fill={p.shade} />

        {/* Print block on the chest, the thing a buyer actually looks at */}
        <rect x="80" y="88" width="40" height="40" fill={p.stitch} opacity="0.22" />
        <path d="M88 118 L100 100 L110 114 L118 106" stroke={p.stitch} strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.55" />

        <Stitch d="M62 182 L138 182" />
      </g>
    </svg>
  );
}

export function Jeans({ p }: { p: Palette }) {
  return (
    <svg viewBox="0 0 200 230" className="h-full w-full" aria-hidden>
      <g className="garment" color={p.stitch}>
        {/* Legs, each swinging slightly out of phase */}
        <g className="garment-sleeve-l">
          <path d="M68 96 L96 96 L94 206 L66 206 Z" fill={p.fabric} />
          <Stitch d="M72 110 L70 200" />
        </g>
        <g className="garment-sleeve-r">
          <path d="M104 96 L132 96 L134 206 L106 206 Z" fill={p.fabric} />
          <Stitch d="M128 110 L130 200" />
        </g>

        {/* Seat and rise */}
        <path d="M66 46 L134 46 L134 104 L104 104 L100 84 L96 104 L66 104 Z" fill={p.fabric} />

        {/* Waistband and belt loops */}
        <path d="M64 44 L136 44 L136 62 L64 62 Z" fill={p.shade} />
        {[74, 100, 126].map((x) => (
          <path key={x} d={`M${x} 44 L${x} 62`} stroke={p.stitch} strokeWidth="2.4" opacity="0.6" />
        ))}
        <Stitch d="M66 56 L134 56" />

        {/* Fly */}
        <Stitch d="M100 62 L100 92" />

        {/* Back pockets */}
        <path d="M72 68 L92 68 L90 86 L74 86 Z" fill={p.shade} opacity="0.75" />
        <path d="M108 68 L128 68 L126 86 L110 86 Z" fill={p.shade} opacity="0.75" />
      </g>
    </svg>
  );
}
