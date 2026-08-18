/** Набор правило-замена для получения множественного числа. */
const PLURALS = [
  { rule: /(a)lumna$/i, replacement: '$1lumnae' },
  { rule: /(g)oose$/i, replacement: '$1eese' },
  { rule: /(m)ove$/i, replacement: '$1oves' },
  { rule: /(s)ex$/i, replacement: '$1exes' },
  { rule: /(c)hild$/i, replacement: '$1hildren' },
  { rule: /(m)an$/i, replacement: '$1en' },
  { rule: /(p)erson$/i, replacement: '$1eople' },
  { rule: /(quiz)$/i, replacement: '$1zes' },
  { rule: /^(ox)$/i, replacement: '$1en' },
  { rule: /([m|l])ouse$/i, replacement: '$1ice' },
  { rule: /(matr|vert|ind)ix|ex$/i, replacement: '$1ices' },
  { rule: /(s|x|ch|ss|sh)$/i, replacement: '$1es' },
  { rule: /([^aeiouy]|qu)y$/i, replacement: '$1ies' },
  { rule: /(hive)$/i, replacement: '$1s' },
  { rule: /(?:([^f])fe|([lr])f)$/i, replacement: '$1$2ves' },
  { rule: /sis$/i, replacement: 'ses' },
  { rule: /([ti])um$/i, replacement: '$1a' },
  { rule: /(buffal|tomat|volcan)o$/i, replacement: '$1oes' },
  { rule: /(bu)s$/i, replacement: '$1ses' },
  { rule: /(alias|status)$/i, replacement: '$1es' },
  { rule: /(octop|vir|alumn|fung)us$/i, replacement: '$1i' },
  { rule: /(ax|test)is$/i, replacement: '$1es' },
  { rule: /$/i, replacement: 's' },
];

/** Неисчисляемые. */
const UNCOUNTABLE = [
  'aircraft',
  'deer',
  'sheep',
  'fish',
  'series',
  'species',
  'money',
  'rice',
  'information',
  'equipment',
];

/**
 * Получить имя во множественном числе.
 * @param name Имя.
 * @returns Имя во множественном числе.
 */
export function pluralize(name: string): string {
  if (UNCOUNTABLE.includes(name.toLowerCase())) return name;
  for (const plural of PLURALS) {
    const regex = plural.rule;
    if (regex.test(name)) {
      return name.replace(plural.rule, plural.replacement);
    }
  }
  return name;
}
