// src/utils/finance.js

export const fmtARS = (n) =>
  Number(n || 0).toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/**
 * Formato compacto para UI (sin decimales)
 */
export const fmtARSCompact = (n) =>
  Number(n || 0).toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

/** Parser robusto */
export const sanitizeNumber = (val) => {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;

  const raw = String(val).trim();
  if (!raw) return 0;

  let s = raw.replace(/[^\d,.\-]+/g, '');
  s = s.replace(/(?!^)-/g, '');

  const commas = (s.match(/,/g) || []).length;
  const dots = (s.match(/\./g) || []).length;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  let decimalSep = null;

  if (commas && dots) {
    decimalSep = lastComma > lastDot ? ',' : '.';
  } else if (commas === 1 && dots === 0) {
    const right = s.length - lastComma - 1;
    if (right === 2) decimalSep = ',';
    else if (right === 3 && s.slice(0, lastComma).replace(/[^0-9]/g, '').length >= 1) decimalSep = null;
    else decimalSep = ',';
  } else if (dots === 1 && commas === 0) {
    const right = s.length - lastDot - 1;
    if (right === 2) decimalSep = '.';
    else if (right === 3 && s.slice(0, lastDot).replace(/[^0-9]/g, '').length >= 1) decimalSep = null;
    else decimalSep = '.';
  } else if (commas > 1 && dots === 0) {
    decimalSep = null;
  } else if (dots > 1 && commas === 0) {
    decimalSep = null;
  } else if (commas === 1 && dots === 1) {
    decimalSep = lastComma > lastDot ? ',' : '.';
  } else {
    decimalSep = null;
  }

  if (decimalSep) {
    const other = decimalSep === ',' ? '.' : ',';
    s = s.replace(new RegExp('\\' + other, 'g'), '');
    if (decimalSep === ',') s = s.replace(/,/g, '.');
  } else {
    s = s.replace(/[.,]/g, '');
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

/** Cálculos */
export const calcularPlan = ({ precio, adelanto, coefPct, cuotas }) => {
  const monto = Math.max(0, sanitizeNumber(precio));
  const down = Math.min(monto, Math.max(0, sanitizeNumber(adelanto)));
  const aFinanciar = Math.max(0, monto - down);
  const coef = Math.max(0, Number(coefPct) || 0) / 100;

  const interesTotal = aFinanciar * coef;
  const costoFinal = aFinanciar + interesTotal;
  const valorCuota = cuotas > 0 ? costoFinal / cuotas : 0;

  return { aFinanciar, interesTotal, costoFinal, valorCuota };
};

export const calcularPlanesPorCoeficientes = ({ precio, adelanto = 0, coeficientes = {} }) => {
  const entries = Object.entries(coeficientes)
    .map(([k, v]) => ({ cuotas: Number(k), coefPct: Number(v) }))
    .filter((e) => Number.isFinite(e.cuotas) && e.cuotas > 0 && Number.isFinite(e.coefPct) && e.coefPct >= 0)
    .sort((a, b) => a.cuotas - b.cuotas);

  return entries.map(({ cuotas, coefPct }) => {
    const plan = calcularPlan({ precio, adelanto, coefPct, cuotas });
    return { cuotas, coefPct, ...plan };
  });
};

/** plantilla TEXTO — sin precio visible, con espaciado e indentación */
export const plantillaPresupuesto = ({
  producto = '',
  tarjetaNombre = '',
  planes = [],
  adelanto = 0,
  aFinanciar = null,
  precio = null, // solo para cálculo interno de a financiar (no se muestra)
}) => {
  const ordenados = [...planes].sort((a, b) => (a.cuotas || 0) - (b.cuotas || 0));
  const bloquesPlanes = ordenados
    .map((p) =>
      [
        `Cuotas: ${p.cuotas}`,
        `  Valor de cuota: ${fmtARS(p.valorCuota)}`,
        `  Margen necesario: ${fmtARS(p.costoFinal)}`,
      ].join('\n')
    )
    .join('\n\n');

  const anticipo = sanitizeNumber(adelanto);
  const precioNum = precio !== null && precio !== undefined ? sanitizeNumber(precio) : null;

  let aFin = aFinanciar !== null && aFinanciar !== undefined ? sanitizeNumber(aFinanciar) : null;
  if (aFin === null && precioNum !== null) aFin = Math.max(0, precioNum - anticipo);

  const lineas = [
    'PRESUPUESTO:',
    '',
    `PRODUCTO: ${producto}`,
    '',
    `FINANCIAMIENTO: Tarjeta: ${tarjetaNombre}`,
    '',
    `ANTICIPO: ${fmtARS(anticipo)}`,
    '',
    `A FINANCIAR: ${fmtARS(aFin ?? 0)}`,
    '',
    '', // ← línea extra para dejar más aire antes de Cuotas
    bloquesPlanes,
    '',
    'CONDICIONES GENERALES',
    '',
    '- Los precios indicados son sin incluir costos de patentamiento',
    '- Puede usar varias tarjetas de crédito.',
    '- El monto del patentamiento le informa el vendedor.',
    '- Los precios están sujetos a modificaciones sin previo aviso.',
    '',
    'VALIDEZ DEL PRESUPUESTO 24 hs',
    '',
    '¿Le interesa este presupuesto?',
  ];

  return lineas.filter((l, i) => !(l === '' && lineas[i - 1] === '')).join('\n');
};

/** plantilla WHATSAPP — sin precio visible, con línea extra tras A FINANCIAR */
export const plantillaPresupuestoWA = ({
  producto = '',
  tarjetaNombre = '',
  planes = [],
  adelanto = 0,
  aFinanciar = null,
  precio = null, // solo para cálculo interno de a financiar (no se muestra)
}) => {
  const ordenados = [...planes].sort((a, b) => (a.cuotas || 0) - (b.cuotas || 0));
  const bloquesPlanes = ordenados
    .map((p) =>
      [
        `*Cuotas:* ${p.cuotas}`,
        `  Valor de cuota: ${fmtARS(p.valorCuota)}`,
        `  Margen necesario: ${fmtARS(p.costoFinal)}`,
      ].join('\n')
    )
    .join('\n\n');

  const anticipo = sanitizeNumber(adelanto);
  const precioNum = precio !== null && precio !== undefined ? sanitizeNumber(precio) : null;

  let aFin = aFinanciar !== null && aFinanciar !== undefined ? sanitizeNumber(aFinanciar) : null;
  if (aFin === null && precioNum !== null) aFin = Math.max(0, precioNum - anticipo);

  const lineas = [
    '*PRESUPUESTO:*',
    '',
    `*PRODUCTO:* ${producto}`,
    '',
    `*FINANCIAMIENTO:* Tarjeta: ${tarjetaNombre}`,
    '',
    `*ANTICIPO:* ${fmtARS(anticipo)}`,
    '',
    `*A FINANCIAR:* ${fmtARS(aFin ?? 0)}`,
    '',
    '', // ← línea extra para dejar más aire antes de Cuotas
    bloquesPlanes,
    '',
    '*CONDICIONES GENERALES*',
    '',
    '- Los precios indicados son sin incluir costos de patentamiento',
    '- Puede usar varias tarjetas de crédito.',
    '- El monto del patentamiento le informa el vendedor.',
    '- Los precios están sujetos a modificaciones sin previo aviso.',
    '',
    '*VALIDEZ DEL PRESUPUESTO 24 hs*',
    '',
    '¿Le interesa este presupuesto?',
  ];

  return lineas.filter((l, i) => !(l === '' && lineas[i - 1] === '')).join('\n');
};
