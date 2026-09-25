// Explicit ABI generation only; never deploys or writes outside frontend.
import { readFileSync, writeFileSync } from 'node:fs';
const abi = JSON.parse(readFileSync(new URL('../../contracts/PactraEscrow.abi.json', import.meta.url), 'utf8'));
writeFileSync(new URL('../lib/escrow-abi.ts', import.meta.url), '// Generated from contracts/PactraEscrow.abi.json; parity tested.\nexport const escrowAbi = ' + JSON.stringify(abi) + ' as const;\n');
