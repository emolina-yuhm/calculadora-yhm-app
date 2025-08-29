// utils/finance.js

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

export const sanitizeNumber = (val) => {
  if (val === null || val === undefined) return 0;
  const s = String(val).replace(/\./g, '').replace(',', '.');
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
 * - coeficientes: objeto donde la clave es la cantidad de cuotas (string o number) y el valor es el % total (ej: { "3": 14, "6": 25 })
 * - precio, adelanto: montos ingresados por el usuario
 *
 * Retorna un array ordenado por cuotas asc:
 * [{ cuotas, coefPct, aFinanciar, interesTotal, costoFinal, valorCuota }]
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
 * Construye el bloque de texto EXACTO para “Copiar plan en plantilla” (texto plano).
 * Sin líneas de "/" al inicio/fin.
 *
 * params:
 * - producto: string
 * - tarjetaNombre: string
 * - planes: array de { cuotas, valorCuota, costoFinal }
 *
 * Retorna string listo para copiar al portapapeles.
 */
export const plantillaPresupuesto = ({ producto = '', tarjetaNombre = '', planes = [] }) => {
  const ordenados = [...planes].sort((a, b) => (a.cuotas || 0) - (b.cuotas || 0));

  const bloquesPlanes = ordenados
    .map((p) =>
      [
        `Cuotas: ${p.cuotas}`,
        `Valor de cuota: ${fmtARS(p.valorCuota)}`,   // 2 decimales en plantilla
        `Margen necesario: ${fmtARS(p.costoFinal)}`,
      ].join('\n')
    )
    .join('\n\n');

  const lineas = [
    'PRESUPUESTO',
    '',
    `Producto: ${producto}`,
    '',
    `Financiamiento - Tarjeta: ${tarjetaNombre}`,
    '',
    bloquesPlanes,
    '',
    'CONDICIONES GENERALES ',
    '',
    '-Los precios indicados son sin incluir costos de patentamiento',
    '-Puede usar varias tarjetas de crédito.',
    '-El monto del patentamiento le informa el vendedor.',
    '-Los precios están sujetos a modificaciones sin previo aviso.',
    '',
    'VALIDEZ DEL PRESUPUESTO 24 hs',
    '',
    'Le interesa este presupuesto?',
  ];

  // Evita dobles saltos consecutivos iniciales por seguridad
  return lineas.filter((l, i) => !(l === '' && lineas[i - 1] === '')).join('\n');
};

/**
 * Versión WhatsApp-friendly con *negritas* (sin líneas de "/").
 * Negritas en: PRESUPUESTO:, PRODUCTO:, FINANCIAMIENTO:, Cuotas: N, CONDICIONES GENERALES,
 * VALIDEZ DEL PRESUPUESTO 24 hs, Le interesa este presupuesto?
 */
export const plantillaPresupuestoWA = ({ producto = '', tarjetaNombre = '', planes = [] }) => {
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

  const lineas = [
    '*PRESUPUESTO:*',
    '',
    `*PRODUCTO:* ${producto}`,
    '',
    `*FINANCIAMIENTO:* Tarjeta: ${tarjetaNombre}`,
    '',
    bloquesPlanes,
    '',
    '*CONDICIONES GENERALES*',
    '',
    '-Los precios indicados son sin incluir costos de patentamiento',
    '-Puede usar varias tarjetas de crédito.',
    '-El monto del patentamiento le informa el vendedor.',
    '-Los precios están sujetos a modificaciones sin previo aviso.',
    '',
    '*VALIDEZ DEL PRESUPUESTO 24 hs*',
    '',
    '*Le interesa este presupuesto?*',
  ];

  return lineas.filter((l, i) => !(l === '' && lineas[i - 1] === '')).join('\n');
};
