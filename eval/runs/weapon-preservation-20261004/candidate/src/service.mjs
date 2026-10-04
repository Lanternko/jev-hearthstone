import http from 'node:http';
import {next,inspect} from './bridge.mjs';
let busy=false;
http.createServer(async(req,res)=>{
 res.setHeader('Content-Type','application/json');
 if(req.headers['x-jev-local']!=='1'||req.headers.origin){res.writeHead(403);res.end('{}');return}
 if(busy){res.writeHead(409);res.end('{"error":"busy"}');return}
 busy=true;
 try{if(req.url==='/next'&&req.method==='POST')res.end(JSON.stringify(await next()));else if(req.url==='/state'){const s=await inspect();res.end(JSON.stringify({state:s.state,actions:s.actions}));}else{res.writeHead(404);res.end('{}')}}catch(e){res.writeHead(500);res.end(JSON.stringify({error:e.message}))}finally{busy=false}
}).listen(17341,'127.0.0.1',()=>console.log('Jev local bridge listening on 127.0.0.1:17341'));
