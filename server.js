#!/usr/bin/env node
"use strict";
process.on('uncaughtException', function (err) { console.error(err); });
process.on('unhandledRejection', function (err) { console.log('unhandledRejection Error: ' + err.stack); });
const http = require('http');
const fs = require('fs');
const func = require('./func.js');
const permissions = require('./permissions.js');
const dbm = require('./db.js');
const sched = require('./sched.js');
const ws = require('./ws.js');
const env = require('./env.json');

// load the arguments: node main.js db=serv port=9999 ----> arg = {"db": "serv", "port": "9999"}
let arg = {};
for (let i = 2; i < 999; i++) {
  let a = process.argv[i];
  if (a === undefined) break;
  if (a.indexOf('=') >= 0) {
    let k = a.substring(0, a.indexOf('='));
    let v = a.substring(a.indexOf('=') + 1, a.length);
    arg[k] = v;
  }
}

// initial values
let loginFails = []
global.port = arg.port; if (!global.port) global.port = env.port 
global.dbName = arg.db; if (!global.dbName) global.dbName = env.dbName
global.dbConn = arg.conn; if (!global.dbConn) global.dbConn = env.dbConn

// start the server
initServer()

async function initServer() {
  if (!global.db) await dbm.dbConnect(global.dbConn, global.dbName);
  let httpServer = http.createServer(async function (req, res) {
    console.log('.');

    // ----------------- static file server - front end
    if (req.method == 'GET') {
      //cut the first slash and the query
      let body, ext = '', head, u = req.url.slice(1);
      if (u.indexOf('?') >= 0) u = u.substring(0, u.indexOf('?'));
      if (u.indexOf('.') >= 0) ext = u.slice(u.lastIndexOf('.') + 1, u.length); //find the extension
      if (u.indexOf('..') >= 0) { res.end(); return; }

      //default document
      if ( u == 'admin/' || u === 'admin' || u == '' ) { res.writeHead(302, { 'Location': '/admin/index.html' }); res.end(); return; }

      //allow only these locations
      if ( !u.startsWith('admin/') ) { res.end('access denied'); return; }

      //check if exists
      if (!fs.existsSync(u) || fs.lstatSync(u).isDirectory()) { res.end('Not Found'); return; }

      //serve the file with header
      if (ext == 'js') head = { 'Content-Type': 'text/javascript', "Cache-Control": "max-age=86400" };
      if (ext == 'css') head = { 'Content-Type': 'text/css', "Cache-Control": "max-age=86400" };
      if (ext == 'ico') head = { 'Content-Type': 'image/x-icon', "Cache-Control": "max-age=86400" };
      if (ext == 'png') head = { 'Content-Type': 'image/png', "Cache-Control": "max-age=86400" };
      if (ext == 'jpg') head = { 'Content-Type': 'image/jpeg', "Cache-Control": "max-age=86400" };
      if (ext == 'svg') head = { 'Content-Type': 'image/svg+xml', "Cache-Control": "max-age=86400" };
      if (ext == 'htm') head = { 'Content-Type': 'text/html', "Cache-Control": "max-age=86400" };
      if (ext == 'html') head = { 'Content-Type': 'text/html', "Cache-Control": "max-age=86400" };
      if (ext == 'zip') head = { 'Content-Type': 'application/zip', "Cache-Control": "max-age=86400" };
      if (head) { res.writeHead(200, head); res.end(fs.readFileSync(u)); return; } else { res.end('Not Found'); return; }
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
        if (q.act == 'passwordsendresettoken') { q.host = req.headers.origin; reply( await func.passwordSendResetToken(q) ); return; }
        if (q.act == 'passworduseresettoken') { reply( await func.passwordUseResetToken(q) ); return; }

        // login / jwt
        {
          // tokenPass
          if ( !global.tokenPass ) {
            let t
            t = await db.collection('system').findOne( { _id: 'tokenPass' } )
            global.tokenPass = t?.value
            t = await db.collection('system').findOne( { _id: 'tokenPassLast' } )
            global.tokenPassLast = t?.value
            if ( !global.tokenPass ) { global.tokenPass = func.randomString(50); tokenPassChange(); }
            setInterval(tokenPassChange, 30 * 60000)
            function tokenPassChange() {
              global.tokenPassLast = global.tokenPass
              global.tokenPass = func.randomString(50)
              db.collection('system').updateOne( { _id: 'tokenPass' }, { $set: { value: global.tokenPass } }, { upsert: true } )
              db.collection('system').updateOne( { _id: 'tokenPassLast' }, { $set: { value: global.tokenPassLast } }, { upsert: true } )
            }
          }
          if (q.token) {
            let t = func.dec(q.token, global.tokenPass); if (!t) t = func.dec(q.token, global.tokenPassLast);
            if (t) q.user = JSON.parse(t);
          }
          if (q.act == 'refreshtoken') {
            if (!q.user || !q.user.email) { reply( { error: "bad token" } ); return }
            q.act = 'login'; q.actWas = 'refreshtoken'; q.query = { "email": q.user.email, "passHash": q.user.pass }
          }
          if (q.act == 'login' && q.query) {
            let ip = clientIP(), now = Date.now()
            let fails = loginFails.filter(a => (a.ip == ip || a.email == q.query.email) && a.time > now - 60000)
            if (fails.length >= 4) { reply( { error: 'too many login tries, please wait a few seconds.'} ); return; }
            let r = await global.db.collection("users").findOne({ email: q.query.email.toLowerCase() });
            if (r) { if (!func.validateHash(q.query.pass + r.passSalt, r.pass) && q.query.passHash != r.pass ) r = undefined; }
            if (!r) {
              loginFails = loginFails.filter(a => a.time > now - 60000)
              loginFails.push({ "ip": ip, "email": q.query.email, "time": now });
              reply( { error: 'permission denied' } ); return;
            }
            r.issued = Date.now(); if (global.dbName == 'serv') r.issued = 9999999999999 // for local debug
            let token = func.enc(JSON.stringify(r), global.tokenPass)
            delete r.pass;
            permissions.setPermissions(r)
            reply( { token, user: r, settings: await func.fetchSettings() } ); return;
          }
          if (!q.user) { reply( { error: 'invalid token' } ); return; }
          let tokenAge = (Date.now() - q.user.issued) / 60000 // minutes
          if (tokenAge >= 5) { reply( { error: 'token expired' } ); return; }
        }

        // handle the query
        let multiple = false, results = []; if ( q.queries ) { multiple = true } else { q.queries = [q] }
        for (q of q.queries) {
          let r = {}
          if (!q.data) q.data = []; if (typeof q.data == 'object' && !Array.isArray(q.data)) q.data = [q.data]

          // permissions
          if(q.user) {
            let t = await permissions.checkPermissions(q);
            if (t) { reply( { error: t } ); return; }
          }

          dbm.convertMongoIds(q.query)

          // actions
          if (q.act == 'passwordchange') r = await func.passwordChange(q);
          if (['find', 'insert', 'update', 'upsert', 'delete', 'push', 'pull'].includes(q.act)) r = await dbm.dbDo(q);

          results.push(r);
        }

        // response
        if ( multiple ) { reply( { results } ) } else { reply( results[0] ) }
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
      if ( arg.logAll ) func.addLog('../log.txt', new Date().toISOString() + ' ' + req.connection.remoteAddress + ' RES\n' + JSON.stringify(r) + '\n')
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

  }).listen(global.port);
  console.log('listening on port ' + global.port + ' db ' + global.dbName )

  ws.init(httpServer);
}


