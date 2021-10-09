#!/usr/bin/env node
"use strict"
const func = require('./func.js');

async function doit() {

  let m = await global.db.collection("system").findOne({ "_id": "lastMigration" }); if ( !m ) m = { value: 0 }; m = m.value

  async function incrementMigration() {
    m++
    await global.db.collection("system").updateOne( { "_id": "lastMigration" }, { "$set": { "value": m } }, { upsert: true} );
  }

  // migration 1 - insert first user
  if ( m < 1 ) {
    let t = await global.db.collection("users").findOne({});
    if (!t) {
      let p = func.randomString(10)
      let salt = func.randomString(10)
      console.log('kiki first password ' + p)
      let u = {
        "email": "kiki@kiki.com",
        "name": "kiki",
        "role": "admin",
        "passSalt" : salt,
        "pass": func.createHash(p + salt)
      }
      let t = await global.db.collection("users").insertOne(u);
      console.log('created first user')
    }
    await incrementMigration()
  }

  // migration 2 - ...
  if ( m < 2 ) {

    //await incrementMigration()
  }

}

module.exports = { doit }
