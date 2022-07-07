#!/usr/bin/env node
"use strict";
//process.on('uncaughtException', function (err) { console.error(err); });
//process.on('unhandledRejection', function (err) { console.log('unhandledRejection Error: ' + err.stack); });

global.env = require('./env.json')
const http = require('http')
const fs = require('fs')
const func = require('./func.js')
const perm = require('./perm.js')
const dbm = require('./dbm.js')
//const sched = require('./sched.js')
//const ws = require('./ws.js')
global.arg = func.getArgs()

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
      let ext, head, u = req.url.slice(1)
      let mm = { js: 'text/javascript', json: 'application/json', css: 'text/css', ico: 'image/x-icon', png: 'image/png', jpg: 'image/jpeg', svg: 'image/svg+xml', zip: 'application/zip', htm: 'text/html', html: 'text/html' }
      if ( u.indexOf('..') >= 0 ) { res.end(); return }
      if ( u.indexOf('?') >= 0 ) u = u.substring(0, u.indexOf('?'))
      if ( u.indexOf('.') >= 0) ext = u.slice(u.lastIndexOf('.') + 1, u.length)
      if ( u == '' ) u = 'index.html'
      u = 'public/' + u
      if ( !fs.existsSync(u) || fs.lstatSync(u).isDirectory() || !mm[ext] ) { res.end('Not Found'); return }
      res.writeHead(200, { 'Content-Type': mm[ext], "Cache-Control": "max-age=" + global.arg.sys == 'local' ? 0 : 10800 } )
      res.end(fs.readFileSync(u)); return
    }

    // ----------------------------- API
    if (req.method == 'POST') {
      let q = {}, buf = '', requestId
      req.on('data', function (data) { buf += data; });
      req.on('end', async function () {

        // filter out script injection
        buf = buf.replace(/</g, '[').replace(/>/g, ']').replace(/javascript/ig, 'java script').replace(/\$where/ig, 'where')

        // log to console
        { let a = buf; a = a.replace(/\n/g, ''); a = func.replaceFromTo(a, 0 , '"token"', '",', ':"...'); a = func.replaceFromTo(a, 0 , '"token"', '"}', ':"...'); console.log('=== ' + a.substring(0,100) ); }

        // parse the json input
        try { q = JSON.parse(buf); } catch (error) { reply( { error: "invalid json" } ); return }
        q.user = { name: 'Guest', email: 'guest', role: 'guest' }
        await perm.initTokenPass()

        // comply to restful conventions
        // curl "http://localhost:1111/users/find/620904d3c8d550b7694ca84e" -H "authorization:+TMAuuHjRdVfVyKltvPDm0ZHGTCBtCE/KaTynCozTVvIks39b8OA8t5AHM3NIkNfIESuZWIgQw1YKm3iIUeaFzh/fpAi05SGv9qXDAK7XBts2fGk7aBT36XkqCzjtpUn20al2qHat+Dr/sTp0J+9fEMDDYo0lN1nIEttE7OLIXsHmACV8CMBNOd+vJIMtWrcGVbqV6ZSbuqUL2IqB7FH+A==.PYSWVPhtOKCdZCoBbtDwZA==" -d '{}'
        {
          if (req.headers && req.headers.authorization) q.token = req.headers.authorization
          let uu = req.url.split('/')
          if (uu[1]) q.col = uu[1]
          if (uu[2]) q.act = uu[2]
          if (uu[3]) { if (!q.query) q.query = {}; q.query._id = uu[3]; }
        }

        // log to file
        if ( arg.log ) {
          requestId = func.randomString(10, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890') 
          let a = func.clone(q); delete a.token
          let f = '../log/' + global.dbName + '-' + new Date().toISOString().substring(0,10) + '.log'
          let text = 'Q|' + new Date().toISOString() + '|' + requestId + '|' + clientIP() + '|' + q.user?.email + '|' + JSON.stringify(a).replace(/\n/g, '§') + '\n'
          func.addLog2(f, text)
        }

        // authenticate
        {
          q.origin = req.headers.origin
          q.ip = req.headers['x-forwarded-for'] + ''; if ( q.ip == '' ) q.ip = req.connection.remoteAddress; if (q.ip.indexOf(':') >= 0) q.ip = q.ip.substring(q.ip.lastIndexOf(':')+1, q.ip.length)
          // To pass the IP address, edit /etc/nginx/nginx.conf, under http {} section add this line: proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
          let r = await perm.login(q); if (r) { reply(r); return }
        }

        // handle the query
        let qq = q.queries,  results = []; if ( !qq ) { qq = [q] }; for (let t of qq) { t.ip = q.ip; t.origin = q.origin; t.user = q.user }
        for (let q of qq) {
          let r = {}
          if (!q.data) q.data = []; if (typeof q.data == 'object' && !Array.isArray(q.data)) q.data = [q.data]
          { let r = await perm.checkPermissions(q); if (r) { reply( { error: r } ); return } }
          dbm.convertMongoIds(q)

          // guest level actions
          if (q.act == 'register') r = await func.register(q)
          if (q.act == 'registerConfirm') r = await func.registerConfirm(q)
          if (q.act == 'sendResetToken') r = await func.sendResetToken(q)
          if (q.act == 'useResetToken') r = await func.useResetToken(q)

          // actions
          if (q.act == 'changePassword') r = await func.changePassword(q);
          if (['find', 'insert', 'update', 'upsert', 'delete', 'push', 'pull'].includes(q.act)) r = await dbm.dbDo(q);
          if ( q.lookups ) await func.addLookups(q, r)

          results.push(r);
        }

        // response
        if ( q.queries) { reply( { results } ) } else { reply( results[0] ) }
        return
      });

      function reply(r) {
        let statusCode = 200; if (r.error || r.ok == 0) statusCode = 400
        res.writeHead(statusCode, {
          "Content-Type": "text/json",
          "Access-Control-Allow-Origin": "*", //cors
          //"Access-Control-Allow-Methods": "OPTIONS, POST, GET",
          //"Access-Control-Max-Age": 86400,
          "Connection": "close"
        });
        res.end(JSON.stringify(r))
        if ( arg.log == '2' ) {
          let f = '../log/' + global.dbName + '-' + new Date().toISOString().substring(0,10) + '.log'
          let text = 'R|' + new Date().toISOString() + '|' + requestId + '|' + JSON.stringify(r).replace(/\n/g, '§') + '\n'
          func.addLog2(f, text)
        }
        return
      }

      function clientIP() {
        let r = req.headers['x-forwarded-for'] + ''; if ( r == '' ) r = req.connection.remoteAddress
        if (r.indexOf(':') >= 0) r = r.substring(r.lastIndexOf(':')+1, r.length)
        return r
        // To pass the IP address, edit /etc/nginx/nginx.conf, under http {} section add this line:
        // proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        // And then you'll have in nodejs req.headers['x-forwarded-for']
      }

    }

  }).listen(global.port);
  console.log('listening on port ' + global.port + ' db ' + global.dbName )

  //ws.init(httpServer);
}


