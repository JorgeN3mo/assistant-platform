import fs from 'node:fs';
export const catalog = JSON.parse(fs.readFileSync(new URL('./funciones.json', import.meta.url), 'utf8'));
export const enabled = id => catalog.funciones.some(f => f.id === id && f.habilitada);
export const command = name => catalog.funciones.find(f => f.habilitada && f.comandos.includes(name));
export const company = code => catalog.empresas[String(code).toUpperCase()];
export const companyCode = name => Object.keys(catalog.empresas).find(k => catalog.empresas[k] === name);
export const shortNumber = value => (String(value ?? '').match(/\d+/g)?.at(-1) ?? '').slice(-4);
export const methodLabel = value => catalog.metodos[value]?.nombre ?? value;
export const menu = () => catalog.funciones.find(f=>f.id==='ayuda').ayuda;
