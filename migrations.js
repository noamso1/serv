#!/usr/bin/env node
"use strict"
const func = require('./func.js');

async function doit() {

  // insert first user
  {
    let u = await db.collection('users').findOne( { } )
    if ( !u ) {
      //let p = func.randomString(10, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890')
      let p = '1'
      let salt = func.randomString(10)
      console.log('kiki first password ' + p)
      let u = {
        "email": "kiki@kiki.com",
        "name": "kiki",
        "role": "admin",
        "status": "active",
        "passSalt" : salt,
        "passHash": func.createHash(p + salt)
      }
      let t = await global.db.collection("users").insertOne(u);
      console.log('created first user')
    }
  }

}

module.exports = { doit }
