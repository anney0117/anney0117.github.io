import {defineConfig} from 'vite';
// Keep the empty HLR group fix active in preview environments that reinstall dependencies.
export default defineConfig({
 optimizeDeps:{exclude:['replicad']},
 plugins:[{name:'replicad-empty-projection',enforce:'pre',transform(code,id){
  if(!id.includes('/replicad/dist/replicad.js'))return;
  const marker='var edgesToDrawing = (edges) => {';
  return code.replace(marker,marker+'\n if (edges.length === 0) return new Drawing();');
 }}],
 worker:{format:'es',plugins:()=>[{name:'replicad-worker-empty-projection',enforce:'pre',transform(code,id){
  if(!id.includes('/replicad/dist/replicad.js'))return;
  const marker='var edgesToDrawing = (edges) => {';
  return code.replace(marker,marker+'\n if (edges.length === 0) return new Drawing();');
 }}]}
});
