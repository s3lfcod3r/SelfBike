// Verkaufsnamen zu Bosch-Teilenummern (Smart System). Akku und Bedieneinheit melden nur die Nummer,
// Motor und ABS bringen ihren Namen selbst mit. Unbekannte Nummern bleiben, wie sie sind.

const NAMES = {
  BBP3750: 'PowerTube 500', BBP3751: 'PowerTube 500',
  BBP3760: 'PowerTube 625', BBP3761: 'PowerTube 625',
  BBP3770: 'PowerTube 750', BBP3771: 'PowerTube 750',
  BBP3865: 'PowerTube 600', BBP3880: 'PowerTube 800',
  BBP3340: 'PowerPack 400', BBP3350: 'PowerPack 500',
  BBP3551: 'PowerPack 545', BBP3570: 'PowerPack 725',
  BBP3620: 'PowerMore 250',
  BRC3100: 'System Controller', BRC3200: 'Kiox 400C', BRC3300: 'Mini Remote',
  BRC3600: 'LED Remote', BRC3800: 'Purion 200',
  BHU3200: 'Intuvia 100', BHU3210: 'Intuvia 200', BHU3600: 'Kiox 300', BHU3700: 'Kiox 500',
  BCM3101: 'Connect Module',
};

export const productName = (code) => NAMES[String(code ?? '').trim().slice(0, 7).toUpperCase()] ?? null;

// „BBP3880“ → „PowerTube 800 · BBP3880“
export function withProductName(code) {
  const name = productName(code);
  return name ? `${name} · ${code}` : code;
}
