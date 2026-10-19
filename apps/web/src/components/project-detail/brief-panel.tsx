import {
  Image as ImageIcon,
  Layers,
  Palette,
  Quote,
  Ruler,
  ShieldAlert,
} from "lucide-react";
import type { ReactNode } from "react";

import type { Brief } from "@/lib/types";

const referenceGradients = [
  "from-[#062a3d] via-[#071a2c] to-[#070d1f]",
  "from-[#141b3a] via-[#0d1428] to-[#070d1f]",
  "from-[#2a1230] via-[#161226] to-[#070d1f]",
];

function PanelHeader({
  icon,
  title,
  aside,
}: {
  icon: ReactNode;
  title: string;
  aside?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-ink-muted" aria-hidden="true">
          {icon}
        </span>
        <h3 className="text-headline-sm text-ink">{title}</h3>
      </div>
      {aside ? <span className="meta shrink-0">{aside}</span> : null}
    </div>
  );
}

export function BriefPanel({ brief }: { brief: Brief }) {
  return (
    <div id="brief" className="scroll-mt-6 space-y-4">
      <h2 className="sr-only">AI-Structured Brief</h2>

      <section aria-label="Asset technical specifications" className="panel overflow-hidden">
        <PanelHeader
          icon={<Ruler className="h-4 w-4" />}
          title="Asset Technical Specifications"
          aside="Engine Constraints"
        />
        <div className="grid grid-cols-1 gap-px bg-line sm:grid-cols-2 xl:grid-cols-4">
          {brief.specs.map((spec) => (
            <div key={spec.label} className="bg-surface-1 p-4">
              <p className="meta">{spec.label}</p>
              <p className="mt-2 text-[15px] font-semibold leading-5 text-ink">{spec.value}</p>
              {spec.note ? (
                <p className="mt-1 text-body-sm text-ink-dim">{spec.note}</p>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Style and aesthetics matrix" className="panel overflow-hidden">
        <PanelHeader
          icon={<Palette className="h-4 w-4" />}
          title="Style & Aesthetics Matrix"
        />
        <div className="p-4">
          <p className="text-body-md leading-6 text-ink-muted">{brief.summary}</p>
          <ul className="mt-4 space-y-2">
            {brief.palette.map((swatch) => (
              <li
                key={`${swatch.label}-${swatch.hex}`}
                className="flex items-center gap-3 rounded border border-line bg-surface-2 px-3 py-2"
              >
                <span
                  aria-hidden="true"
                  className="h-3 w-3 shrink-0 rounded-full border border-white/15"
                  style={{ backgroundColor: swatch.hex }}
                />
                <span className="text-body-sm text-ink">{swatch.label}</span>
                <span className="ml-auto font-mono text-label-sm uppercase text-ink-dim">
                  {swatch.hex}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-label="References and moodboard" className="panel overflow-hidden">
        <PanelHeader
          icon={<ImageIcon className="h-4 w-4" />}
          title="References & Moodboard"
          aside={`${brief.references.length} Assets Attached`}
        />
        <div className="grid grid-cols-3 gap-2 p-3">
          {brief.references.map((reference, index) => (
            <figure
              key={reference.id}
              className="relative aspect-[4/3] overflow-hidden rounded border border-line"
            >
              <div
                aria-hidden="true"
                className={`absolute inset-0 bg-gradient-to-br ${
                  referenceGradients[index % referenceGradients.length]
                }`}
              />
              <div aria-hidden="true" className="absolute inset-0 grid-noise opacity-60" />
              <Layers
                aria-hidden="true"
                className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 text-ink-dim/40"
              />
              <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#020617] via-[#020617]/80 to-transparent px-2 pb-2 pt-6">
                <span className="block truncate font-mono text-[10px] leading-4 text-ink-muted">
                  {reference.label}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section aria-label="Special engineering directives" className="panel overflow-hidden">
        <PanelHeader
          icon={<ShieldAlert className="h-4 w-4" />}
          title="Special Engineering Directives"
        />
        <div className="p-4">
          <blockquote className="relative rounded border border-line bg-surface-2/70 p-4 pl-10">
            <Quote
              aria-hidden="true"
              className="absolute left-3 top-3 h-4 w-4 text-brand/70"
            />
            <p className="text-body-md leading-6 text-ink">{brief.directives}</p>
          </blockquote>
        </div>
      </section>
    </div>
  );
}
