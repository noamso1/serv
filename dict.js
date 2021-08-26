#!/usr/bin/env node
"use strict";
process.on('uncaughtException', function (err) { console.error(err); });
process.on('unhandledRejection', function (err) { console.log('unhandledRejection Error: ' + err.stack); });
const http = require('http');
const env = require('./env.json');

// DICT.JS = CACHE DICTIONARY SERVER (REDIS REPLACER)
// curl localhost:2222/ppp|s|a|some+test --- password set a = some+text
// curl localhost:2222/ppp|g|a           --- password get a

let port = env.dictPort, pass = env.dictPass, dict = {}

let httpServer = http.createServer(function (req, res) {
  let r = req.url.slice(1).split('|')
  if ( r[0] == pass && r[1] == 's' ) { dict[ r[2] ] = r[3]; res.end('ok') }
  if ( r[0] == pass && r[1] == 'g' ) { res.end(dict[ r[2] ]) }
  res.end('')
}).listen(port);

console.log('listen ' + port)


