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

// load the arguments: node main.js db=local port=9999 ----> arg = {"db": "local", "port": "9999"}
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
let port = arg.port; if (!port) port = 1111
global.dbName = arg.db; if (!global.dbName) global.dbName = 'local'
global.dbConn = arg.conn; if (!global.dbConn) global.dbConn = 'mongodb://localhost:27017'

global.tokenPass = func.randomString(30); tokenPassChange(); setInterval(tokenPassChange, 600 * 60000) // 3 hours
function tokenPassChange() {
  global.tokenPassLast = global.tokenPass
  global.tokenPass = func.randomString(30)
  if (global.dbName == 'local') global.tokenPass = '1' // for debug in localhost
}

// start the server
initServer()

async function initServer() {
  if (!global.db) await dbm.dbConnect(global.dbConn, global.dbName);
  console.log("server started. port " + port + " db " + global.dbName)
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
      if (u == 'admin/' || u === 'admin' || u == '' || u.includes('/admin/index.htm')) { res.writeHead(302, { 'Location': '/admin/index.htm' }); res.end(); return; }

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
      if (ext == 'zip') head = { 'Content-Type': 'application/zip', "Cache-Control": "max-age=86400" };
      if (head) { res.writeHead(200, head); res.end(fs.readFileSync(u)); return; } else { res.end('Not Found'); return; }

    }

    // ----------------------------- API
    if (req.method == 'POST') {
      let q = {}, buf = '';
      res.writeHead(200, {
        "Content-Type": "text/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "OPTIONS, POST, GET",
        "Access-Control-Max-Age": 86400,
        "Connection": "close"
      }); //cors
      req.on('data', function (data) { buf += data; });
      req.on('end', async function () {

        let user = undefined, r = {}, t;
        // filter out script injection
        buf = buf.replace(/</g, '[').replace(/>/g, ']').replace(/javascript/ig, 'java script').replace(/\$where/ig, 'where')
        // parse the json input
        try { q = JSON.parse(buf); } catch (error) { res.end(JSON.stringify({ "error": "invalid json" })); return; }

        // make sure q.data is an array of objects
        if (!q.data) q.data = []; if (typeof q.data == 'object' && !Array.isArray(q.data)) q.data = [q.data]

        //--------------------------jwt
        if( ![ 'passwordsendresettoken', 'passworduseresettoken',].includes(q.act) ) { //actions without token
          if (q.token) {
            let t = func.dec(q.token, global.tokenPass); if (!t) t = func.dec(q.token, global.tokenPassLast);
            if (t) user = JSON.parse(t);
          }
          if (q.act == 'refreshtoken') {
            if (!user || !user.email) { res.end(JSON.stringify({ error: "bad token" })); return }
            q.act = 'login'; q.actWas = 'refreshtoken'; q.query = { "email": user.email, "passHash": user.pass }
          }
          if (q.act == 'login' && q.query) {
            let ip = clientIP(), now = (new Date()).getTime()
            let fails = loginFails.filter(a => (a.ip == ip || a.email == q.query.email) && a.time > now - 60000)
            if (fails.length >= 4) { res.end('{"error": "too many login tries, please wait a few seconds."}'); return; }
            r = await global.db.collection("users").findOne({ email: q.query.email.toLowerCase() });
            if (r) { if (!func.validateHash(q.query.pass + r.passSalt, r.pass) && q.query.passHash != r.pass ) r = undefined; }
            if (!r) {
              loginFails = loginFails.filter(a => a.time > now - 60000)
              loginFails.push({ "ip": ip, "email": q.query.email, "time": now });
              res.end('{"error": "permission denied"}'); return;
            }
            r.issued = Date.now(); if (global.dbName == 'local') r.issued = 9999999999999 // for local debug
            let token = func.enc(JSON.stringify(r), global.tokenPass)
            delete r.pass;
            permissions.setPermissions(r)
            res.end(JSON.stringify({ "token": token, "user": r, "settings": await func.fetchSettings() })); return;
          }
          if (!user) { res.end('{"error": "invalid token"}'); return; }
          let tokenAge = ((new Date()).getTime() - user.issued) / 60000 // minutes
          let tokenDie = 5;
          if (tokenAge >= tokenDie) { res.end('{"error": "token expired"}'); return; }
        }
        //-------------------------------------------

        // handle multiple queries
        let multiple = false, results = [], queries = q.queries;
        if (queries) { multiple = true } else { queries = [{ ...q }] }

        for (q of queries) {
          if (q.act) q.act = q.act.toLowerCase();

          // permissions
          if(user) {
            t = await permissions.checkPermissions(q, user);
            if (t) { res.end('{"error": "' + t + '"}'); return; }
          }

          dbm.convertMongoIds(q.query)

          // actions without token
          if (q.act == 'passwordsendresettoken') { q.host = req.headers.origin; r = await func.passwordSendResetToken(q); }
          if (q.act == 'passworduseresettoken') r = await func.passwordUseResetToken(q)

          // actions
          if (q.act == 'passwordchange') r = await func.passwordChange(q);
          if (['find', 'insert', 'update', 'delete', 'push', 'pull'].includes(q.act)) r = await dbm.dbDo(q, user);

          results.push(r);
        }

        // response
        if (multiple) { r = { "results": results } } else { r = results[0] }
        res.end(JSON.stringify(r)); return;
      });
    }

    function clientIP() {
      let r = req.connection.remoteAddress
      if( !r ) r = ''
      if( !r || r.indexOf('127.0.0.1') >= 0 ) r = req.headers['x-forwarded-for']
      if( !r ) r = ''
      if (r.indexOf(':') >= 0) r = r.substring(r.lastIndexOf(':')+1, r.length)
      return r
      // To pass the IP address, edit /etc/nginx/nginx.conf, under http {} section add this line:
      // proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      // And then you'll have in nodejs req.headers['x-forwarded-for']
    }

  }).listen(port);
  console.log('listen ' + port)

  ws.init(httpServer);
}


