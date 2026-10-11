import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Fixed executable/script; invoice text is JSON on stdin, never shell code.
export function renderReport(snapshot, python='/usr/bin/python3') {
  return new Promise((resolve,reject)=>{
    const child=execFile(python,[fileURLToPath(new URL('./render-report.py',import.meta.url))],
      {timeout:20000,maxBuffer:10*1024*1024,encoding:'buffer'},(error,stdout)=>{
        if(error||!stdout.subarray(0,5).equals(Buffer.from('%PDF-')))reject(new Error('PDF generation failed'));
        else resolve(stdout);
      });
    child.stdin.on('error',()=>{});
    child.stdin.end(JSON.stringify(snapshot));
  });
}
