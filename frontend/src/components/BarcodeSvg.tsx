import { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';

interface BarcodeSvgProps {
  // The text to encode. For a batch label this is the batch code, e.g. KODO500-261013A.
  value: string;
  height?: number;
  width?: number;
}

// Renders a Code 128 barcode as SVG. Code 128 holds letters, digits and hyphens, which covers
// item and batch codes. A value it can't encode shows a message instead of an empty box.
export function BarcodeSvg({ value, height = 60, width = 2 }: BarcodeSvgProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    try {
      JsBarcode(svgRef.current, value, {
        format: 'CODE128',
        displayValue: true,
        fontSize: 14,
        height,
        width,
        margin: 8,
        background: '#ffffff',
        lineColor: '#000000',
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create barcode');
    }
  }, [value, height, width]);

  if (error) {
    return <div className="error-banner">Barcode not available: {error}</div>;
  }
  return <svg ref={svgRef} style={{ maxWidth: '100%', height: 'auto' }} role="img" aria-label={`Barcode ${value}`} />;
}
