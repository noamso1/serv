#!/usr/bin/env node
"use strict";
process.on('uncaughtException', function (err) { console.error(err); });
process.on('unhandledRejection', function (err) { console.log('unhandledRejection Error: ' + err.stack); });

global.env = require('./env.json')
const http = require('http')
const fs = require('fs')
const func = require('./func.js')
const permissions = require('./permissions.js')
const dbm = require('./db.js')
//const sched = require('./sched.js')
//const ws = require('./ws.js')
//const email = require('./email.js')

// load the arguments: node main.js db=serv port=9999 ----> arg = {"db": "serv", "port": "9999"}
global.arg = {};
for (let i = 2; i < 999; i++) {
  let a = process.argv[i];
  if (a === undefined) break;
  if (a.indexOf('=') >= 0) {
    let k = a.substring(0, a.indexOf('='));
    let v = a.substring(a.indexOf('=') + 1, a.length);
    global.arg[k] = v;
  }
}

// initial values
global.port = global.arg.port; if (!global.port) global.port = env.port 
global.dbName = global.arg.db; if (!global.dbName) global.dbName = env.dbName
global.dbConn = global.arg.conn; if (!global.dbConn) global.dbConn = env.dbConn

// start the server
initServer()

async function initServer() {
  if (!global.db) await dbm.dbConnect(global.dbConn, global.dbName);
  let httpServer = http.createServer(async function (req, res) {

    // ----------------- static file server - front end
    if (req.method == 'GET') {
      let ext, head, t, u = req.url.slice(1)
      if ( u.indexOf('..') >= 0 ) { res.end(); return }
      if ( u.indexOf('?') >= 0 ) u = u.substring(0, u.indexOf('?'))
      if ( u == '' ) u = 'index.html'
      u = 'public/' + u
      if ( !fs.existsSync(u) || fs.lstatSync(u).isDirectory() ) { res.end('Not Found'); return }
      if ( u.indexOf('.') >= 0) ext = u.slice(u.lastIndexOf('.') + 1, u.length)
      if ( ext == 'js' ) t = 'text/javascript'
      if ( ext == 'css' ) t = 'text/css'
      if ( ext == 'ico' ) t = 'image/x-icon'
      if ( ext == 'png' ) t = 'image/png'
      if ( ext == 'jpg' ) t = 'image/jpeg'
      if ( ext == 'svg' ) t = 'image/svg+xml'
      if ( ext == 'zip' ) t = 'application/zip'
      if ( ext == 'htm' ) t = 'text/html'
      if ( ext == 'html' ) t = 'text/html'
      if ( !t ) { res.end('Not Found'); return }
      res.writeHead(200, { 'Content-Type': t, "Cache-Control": "max-age=86400" } ); res.end(fs.readFileSync(u)); return
    }

    // ----------------------------- API
    if (req.method == 'POST') {
      let q = {}, buf = '';
      req.on('data', function (data) { buf += data; });
      req.on('end', async function () {

        // log 
        { let a = buf; a = a.replace(/\n/g, ''); a = func.replaceFromTo(a, 0 , '"token"', '",', ':"...'); a = func.replaceFromTo(a, 0 , '"token"', '"}', ':"...'); console.log('=== ' + a.substring(0,100) ); }

        // filter out script injection
        buf = buf.replace(/</g, '[').replace(/>/g, ']').replace(/javascript/ig, 'java script').replace(/\$where/ig, 'where')

        // parse the json input
        try { q = JSON.parse(buf); } catch (error) { reply( { error: "invalid json" } ); return }
        delete q.user

        // actions without token
        if (q.act == 'publicEndPoint') { reply( { ok: 1 } ); return; }

        // authenticate
        {
          q.origin = req.headers.origin
          q.ip = req.headers['x-forwarded-for'] + ''; if ( q.ip == '' ) q.ip = req.connection.remoteAddress; if (q.ip.indexOf(':') >= 0) q.ip = q.ip.substring(q.ip.lastIndexOf(':')+1, q.ip.length)
          // To pass the IP address, edit /etc/nginx/nginx.conf, under http {} section add this line: proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
          let r = await permissions.login(q); if (r) { reply(r); return }
        }

        // handle the query
        let qq = q.queries,  results = []; if ( !qq ) { qq = [q] }; for (let t of qq) { t.ip = q.ip; t.origin = q.origin; t.user = q.user }
        for (let q of qq) {
          let r = {}
          if (!q.data) q.data = []; if (typeof q.data == 'object' && !Array.isArray(q.data)) q.data = [q.data]
          { let r = await permissions.checkPermissions(q); if (r) { reply( { error: r } ); return } }
          dbm.convertMongoIds(q.query)

          // actions
          if (q.act == 'passwordChange') r = await func.passwordChange(q);
          if (['find', 'insert', 'update', 'upsert', 'delete', 'push', 'pull'].includes(q.act)) r = await dbm.dbDo(q);

          results.push(r);
        }

        // response
        if ( q.queries) { reply( { results } ) } else { reply( results[0] ) }
        return
      });
    }

    function reply(r) {
      let statusCode = 200; if (r.error || r.ok == 0) statusCode = 400
      res.writeHead(statusCode, {
        "Content-Type": "text/json",
        "Access-Control-Allow-Origin": "*", //cors
        "Access-Control-Allow-Methods": "OPTIONS, POST, GET",
        "Access-Control-Max-Age": 86400,
        "Connection": "close"
      });
      res.end(JSON.stringify(r))
      if ( global.arg.logAll ) func.addLog('../log.txt', new Date().toISOString() + ' ' + req.connection.remoteAddress + ' RES\n' + JSON.stringify(r) + '\n')
      return
    }

  }).listen(global.port);
  console.log('listening on port ' + global.port + ' db ' + global.dbName )

  //ws.init(httpServer);
}


