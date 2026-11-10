// Padrões forenses pré-configurados e validadores (compartilhado entre servidor e worker).

const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64,
  65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

const digits = (s) => s.replace(/\D/g, '');

export function validCpf(v) {
  const d = digits(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const n of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += +d[i] * (n + 1 - i);
    const dv = ((sum * 10) % 11) % 10;
    if (dv !== +d[n]) return false;
  }
  return true;
}

export function validCnpj(v) {
  const d = digits(v);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (len) => {
    const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = w.reduce((s, x, i) => s + x * +d[i], 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === +d[12] && calc(13) === +d[13];
}

export function validPhone(v) {
  let d = digits(v);
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  if (d.length === 10 || d.length === 11) {
    if (!DDDS.has(+d.slice(0, 2))) return false;
    if (d.length === 11 && d[2] !== '9') return false;
    if (d.length === 10 && !/[2-9]/.test(d[2])) return false;
    return !/^(\d)\1+$/.test(d);
  }
  if (d.length === 8 || d.length === 9) return d.length === 8 || d[0] === '9';
  return false;
}

export function validDate(v) {
  const m = /(\d{1,4})[\/.-](\d{1,2})[\/.-](\d{1,4})/.exec(v);
  if (!m) return true; // por extenso
  let [, a, b, c] = m;
  let y, mo, d;
  if (a.length === 4) [y, mo, d] = [+a, +b, +c];
  else [d, mo, y] = [+a, +b, +c];
  if (y < 100) y += 2000;
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}

export const VALIDATORS = { cpf: validCpf, cnpj: validCnpj, phone: validPhone, date: validDate };

const MONTHS = 'janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro';

export const PRESETS = {
  cpf: {
    label: 'CPF',
    hint: '000.000.000-00 ou 11 dígitos',
    source: String.raw`(?<![\d.\/-])\d{3}\.?\d{3}\.?\d{3}[-.\s]?\d{2}(?![\d\/-])`,
    flags: 'g',
    validate: 'cpf',
    normalize: 'digits',
  },
  cnpj: {
    label: 'CNPJ',
    hint: '00.000.000/0001-00 ou 14 dígitos',
    source: String.raw`(?<![\d.\/-])\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}(?![\d\/-])`,
    flags: 'g',
    validate: 'cnpj',
    normalize: 'digits',
  },
  phone: {
    label: 'Telefone',
    hint: '(00) 00000-0000, +55, com/sem DDD',
    source: String.raw`(?<![\d\/.,-])(?:\+?55[\s.-]?)?(?:\(\s?\d{2}\s?\)|\d{2})[\s.-]?9?\s?\d{4}[\s.-]?\d{4}(?![\d\/]|[.,]\d)|(?<![\d\/.,-])9?\d{4}-\d{4}(?![\d\/-]|[.,]\d)`,
    flags: 'g',
    validate: 'phone',
    normalize: 'digits',
  },
  rg: {
    label: 'RG',
    hint: '00.000.000-0, "RG 1234567"',
    source: String.raw`(?<![\d.\/-])\d{1,2}\.\d{3}\.\d{3}-?[\dXx](?![\d.\/-])|\b(?:RG|R\.G\.|identidade)\b[\s:nNº°.#-]*\d[\d.\-]{4,12}[\dXx]\b`,
    flags: 'gi',
    normalize: 'digits',
  },
  date: {
    label: 'Datas',
    hint: 'DD/MM/AAAA, AAAA-MM-DD, "12 de março"',
    source: String.raw`(?<![\d\/.-])(?:0?[1-9]|[12]\d|3[01])[\/.-](?:0?[1-9]|1[0-2])[\/.-](?:\d{4}|\d{2})(?![\d\/.-])|(?<![\d-])(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])(?![\d-])|(?<![\p{L}\d])\d{1,2}(?:º|°)?\s+de\s+(?:${MONTHS})(?:\s+de\s+\d{4})?(?![\p{L}])`,
    flags: 'giu',
    validate: 'date',
  },
  email: {
    label: 'E-mail',
    hint: 'nome@dominio.com',
    source: String.raw`[\p{L}\d._%+-]+@[\p{L}\d-]+(?:\.[\p{L}\d-]+)*\.[\p{L}]{2,}`,
    flags: 'giu',
    normalize: 'lower',
  },
  money: {
    label: 'Valores R$',
    hint: 'R$ 1.234,56',
    source: String.raw`R\$\s?\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?(?!\d)|R\$\s?\d+(?:,\d{1,2})?(?!\d)`,
    flags: 'gi',
  },
};

export function normalizeValue(v, mode) {
  if (mode === 'digits') return digits(v) || v;
  if (mode === 'lower') return v.toLowerCase();
  return v;
}
