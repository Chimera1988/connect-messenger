'use strict';
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const files=[];function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else if(/\.tsx?$/.test(file)&&!file.endsWith('.d.ts'))files.push(file);}}
for(const dir of ['app','components','lib'])walk(dir);
const graph=new Map();
for(const file of files){const source=fs.readFileSync(file,'utf8'),tree=ts.createSourceFile(file,source,99,true,file.endsWith('tsx')?4:3),edges=[];
 for(const node of tree.statements){if(!(ts.isImportDeclaration(node)||ts.isExportDeclaration(node))||node.importClause?.isTypeOnly||node.isTypeOnly)continue;const name=node.moduleSpecifier?.text;if(!name?.startsWith('.'))continue;const base=path.normalize(path.join(path.dirname(file),name));const target=[base,base+'.ts',base+'.tsx',base+'/index.ts',base+'/index.tsx'].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());if(!target)throw Error('Unresolved relative import '+file+' -> '+name);edges.push(target);if(source.startsWith("'use client'")&&target.startsWith('lib/server/'))throw Error('Client imports privileged server module: '+file);}
 graph.set(file,edges);
}
const visiting=new Set(),visited=new Set();function visit(file,stack=[]){if(visiting.has(file))throw Error('Import cycle: '+[...stack,file].join(' -> '));if(visited.has(file))return;visiting.add(file);for(const target of graph.get(file)||[])visit(target,[...stack,file]);visiting.delete(file);visited.add(file);}
for(const file of files)visit(file);console.log('Architecture checks passed: '+files.length+' modules, no runtime import cycles.');
