#!/usr/bin/env node
"use strict";
global.env = require('./env.json')
let mongodb = require('mongodb')
let func = require('./func.js')
let dbm = require('./dbm.js')
let arg = func.getArgs()
console.log(arg)
main()

async function main() {
  global.dbName = arg.db; if(!global.dbName) global.dbName = global.env.dbName
  global.dbConn = arg.conn; if(!global.dbConn) global.dbConn = global.env.dbConn
  await dbm.dbConnect(global.dbConn, global.dbName);

  if( arg.act == 'changepass' ) {
    let e = arg.email; if (!e) e = 'kiki@kiki.com'
    let p = arg.pass; if (!p) p = '1'
    let salt = func.randomString(10)
    let f = { "email": e}
    let u = { "passSalt" : salt, "passHash": func.createHash(p + salt) }
    let t = await global.db.collection("users").updateMany(f, {"$set": u});
    console.log(t)
    console.log('updated password')
  }

  process.exit(); return
}

