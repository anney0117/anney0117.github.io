// replicad 1.2.1 calls Flatbush with zero items when an HLR line group is empty.
// An empty group has an empty Drawing; do not alter nonempty projection results.
import {readFileSync,writeFileSync} from 'node:fs';
const file=new URL('../node_modules/replicad/dist/replicad.js',import.meta.url);
const before='var edgesToDrawing = (edges) => {';
const after=before+'\n\tif (edges.length === 0) return new Drawing();';
const text=readFileSync(file,'utf8');
if(!text.includes(after)){if(!text.includes(before))throw new Error('replicad changed: review empty projection patch');writeFileSync(file,text.replace(before,after));}
