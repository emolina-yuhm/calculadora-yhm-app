// src/utils/finance.js

export const fmtARS = (n) =>
  Number(n || 0).toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/**
 * Formato compacto para UI (sin decimales), ej: "$ 817.000"
 * Útil para la visualización en pantalla “sin ceros innecesarios”.
 * Para la plantilla usá SIEMPRE fmtARS (dos decimales).
 */
export const fmtARSCompact = (n) =>
  Number(n || 0).toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

/**
 * Sanitiza números pegados en diferentes formatos:
 * - Acepta "$ 1.234.567,89", "1,234,567.89", "1234567,89", etc.
 * - Regla: si hay ',' y '.' → la ÚLTIMA aparición es decimal y la otra es miles
 * - Si hay un solo separador:
 *   - Si aparece >1 vez → se asume separador de miles (sin decimales)
 *   - Si aparece 1 vez:
 *       · si hay exactamente 2 dígitos a la derecha → decimal
 *       · si hay 3 dígitos a la derecha y muchos a la izquierda → miles
 *       · caso contrario → decimal por defecto
 */
export const sanitizeNumber = (val) => {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;

  const raw = String(val).trim();
  if (!raw) return 0;

  // Dejar solo dígitos, coma, punto y signo - (el resto lo removemos: $, espacios, etc.)
  let s = raw.replace(/[^\d,.\-]+/g, '');

  if (!s) return 0;

  // Normalizar el signo: solo permitir uno al inicio
  s = s.replace(/(?!^)-/g, '');

  const commas = (s.match(/,/g) || []).length;
  const dots = (s.match(/\./g) || []).length;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  let decimalSep = null;

  if (commas && dots) {
    // Hay ambos: la última aparición entre coma/punto define los decimales
    decimalSep = lastComma > lastDot ? ',' : '.';
  } else if (commas === 1 && dots === 0) {
    // Solo una coma
    const right = s.length - lastComma - 1;
    if (right === 2) decimalSep = ',';                 // típico decimal
    else if (right === 3 && s.slice(0, lastComma).replace(/[^0-9]/g, '').length >= 1) {
      // parece miles => sin decimales
      decimalSep = null;
    } else decimalSep = ',';                           // por defecto decimal
  } else if (dots === 1 && commas === 0) {
    // Solo un punto
    const right = s.length - lastDot - 1;
    if (right === 2) decimalSep = '.';                 // típico decimal
    else if (right === 3 && s.slice(0, lastDot).replace(/[^0-9]/g, '').length >= 1) {
      // parece miles => sin decimales
      decimalSep = null;
    } else decimalSep = '.';                           // por defecto decimal
  } else if (commas > 1 && dots === 0) {
    // Varias comas → miles
    decimalSep = null;
  } else if (dots > 1 && commas === 0) {
    // Varios puntos → miles
    decimalSep = null;
  } else if (commas === 1 && dots === 1) {
    // Ambos una vez: ya lo cubrimos con la regla de "último es decimal"
    decimalSep = lastComma > lastDot ? ',' : '.';
  } else {
    // Sin separadores → número entero
    decimalSep = null;
  }

  if (decimalSep) {
    const other = decimalSep === ',' ? '.' : ',';
    s = s.replace(new RegExp('\\' + other, 'g'), '');  // remover miles
    if (decimalSep === ',') s = s.replace(/,/g, '.');  // decimal a punto
  } else {
    // No hay decimales: remover cualquier separador
    s = s.replace(/[.,]/g, '');
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Calcula plan de financiación:
 * - precio: precio base (monto)
 * - adelanto: pago inicial (se resta del precio)
 * - coefPct: porcentaje total (ej: 18 => 18%)
 * - cuotas: cantidad de cuotas
 *
 * Retorna:
 * { aFinanciar, interesTotal, costoFinal, valorCuota }
 */
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

/**
 * Genera todos los planes a partir de los coeficientes configurados de una tarjeta.
 * - coeficientes: { "3": 14, "6": 25, ... }
 */
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

/**
 * Plantilla TEXTO: ahora incluye Precio, Adelanto y A financiar (si están disponibles).
 */
export const plantillaPresupuesto = ({
  producto = '',
  tarjetaNombre = '',
  planes = [],
  adelanto = 0,
  aFinanciar = null,
  precio = null,
}) => {
  const ordenados = [...planes].sort((a, b) => (a.cuotas || 0) - (b.cuotas || 0));

  const bloquesPlanes = ordenados
    .map((p) =>
      [
        `Cuotas: ${p.cuotas}`,
        `Valor de cuota: ${fmtARS(p.valorCuota)}`,
        `Margen necesario: ${fmtARS(p.costoFinal)}`,
      ].join('\n')
    )
    .join('\n\n');

  const anticipo = sanitizeNumber(adelanto);
  const precioNum = precio !== null && precio !== undefined ? sanitizeNumber(precio) : null;

  let aFin = aFinanciar !== null && aFinanciar !== undefined ? sanitizeNumber(aFinanciar) : null;
  if (aFin === null && precioNum !== null) aFin = Math.max(0, precioNum - anticipo);

  const lineas = [
    'PRESUPUESTO',
    '',
    `Producto: ${producto}`,
    '',
    `Financiamiento - Tarjeta: ${tarjetaNombre}`,
    '',
    ...(precioNum !== null ? [`Precio: ${fmtARS(precioNum)}`] : []),
    ...(anticipo > 0 ? [`Adelanto: ${fmtARS(anticipo)}`] : []),
    ...(aFin !== null ? [`A financiar: ${fmtARS(aFin)}`, ''] : ['']),
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

/**
 * Plantilla WHATSAPP: incluye *PRECIO*, *ADELANTO* y *A FINANCIAR* si aplican.
 */
export const plantillaPresupuestoWA = ({
  producto = '',
  tarjetaNombre = '',
  planes = [],
  adelanto = 0,
  aFinanciar = null,
  precio = null,
}) => {
  const ordenados = [...planes].sort((a, b) => (a.cuotas || 0) - (b.cuotas || 0));

  const bloquesPlanes = ordenados
    .map((p) =>
      [
        `*Cuotas: ${p.cuotas}*`,
        `Valor de cuota: ${fmtARS(p.valorCuota)}`,
        `Margen necesario: ${fmtARS(p.costoFinal)}`,
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
    ...(precioNum !== null ? [`*PRECIO:* ${fmtARS(precioNum)}`] : []),
    ...(anticipo > 0 ? [`*ADELANTO:* ${fmtARS(anticipo)}`] : []),
    ...(aFin !== null ? [`*A FINANCIAR:* ${fmtARS(aFin)}`, ''] : ['']),
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