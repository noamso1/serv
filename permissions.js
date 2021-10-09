#!/usr/bin/env node
"use strict";
const func = require('./func.js');

function setPermissions(user) {
  if (!user.perm) {
    user.perm = []
    if (user.role == 'admin') {
      user.perm = [
        { "col": "users", "act": "find", "project": { pass: 0, passSalt: 0 } },
        { "col": "users", "act": "insert" },
        { "col": "users", "act": "update" },
        { "col": "users", "act": "delete" },
      ]
    }
  }
  user.perm.push ( { "act": "passwordChange", "queryAdd": { "email": user.email } } )
}

let loginFails = []
async function login(q) {

  // tokenPass
  if ( !global.tokenPass ) {
    let t
    t = await global.db.collection('system').findOne( { _id: 'tokenPass' } )
    global.tokenPass = t?.value
    t = await global.db.collection('system').findOne( { _id: 'tokenPassLast' } )
    global.tokenPassLast = t?.value
    if ( !global.tokenPass ) { global.tokenPass = func.randomString(50); tokenPassChange(); }
    setInterval(tokenPassChange, 30 * 60000)
    function tokenPassChange() {
      global.tokenPassLast = global.tokenPass
      global.tokenPass = func.randomString(50)
      global.db.collection('system').updateOne( { _id: 'tokenPass' }, { $set: { value: global.tokenPass } }, { upsert: true } )
      global.db.collection('system').updateOne( { _id: 'tokenPassLast' }, { $set: { value: global.tokenPassLast } }, { upsert: true } )
    }
  }

  // validate token
  if (q.token) {
    let t = func.dec(q.token, global.tokenPass); if (!t) t = func.dec(q.token, global.tokenPassLast);
    if (t) q.user = JSON.parse(t);
  }

  // refresh token
  if (q.act == 'refreshtoken') {
    if (!q.user || !q.user.email) return { error: "bad token" }
    q.act = 'login'; q.actWas = 'refreshtoken'; q.query = { "email": q.user.email, "passHash": q.user.pass }
  }

  // login
  let now = Date.now()
  if (q.act == 'login' && q.query) {
    let fails = loginFails.filter(a => (a.ip == q.ip || a.email == q.query.email) && a.time > now - 60000)
    if (fails.length >= 4) return { error: 'too many login tries, please wait a few seconds.' }
    let user = await global.db.collection("users").findOne({ email: q.query.email.toLowerCase() });
    if (user) { if (!func.validateHash(q.query.pass + user.passSalt, user.pass) && q.query.passHash != user.pass ) user = undefined; }
    if (!user) {
      loginFails = loginFails.filter(a => a.time > now - 60000)
      loginFails.push({ "ip": q.ip, "email": q.query.email, "time": now });
      return { error: 'permission denied' }
    }
    user.issued = now; if (global.dbName == 'serv') user.issued = 9999999999999 // for local debug
    let token = func.enc(JSON.stringify(user), global.tokenPass)
    delete user.pass;
    setPermissions(user)
    return { token, user, settings: await func.fetchSettings() }
  }

  // check
  if (!q.user) return { error: 'invalid token' }
  let tokenAge = (now - q.user.issued) / 60000 // minutes
  if (tokenAge >= 5) return { error: 'token expired' }
}

async function checkPermissions(q) {

  // { "col": "users", "act": "insert", "queryAdd": { "site": 12, "username": "kiki" }, "dataAdd": {"role": user.role} },
  setPermissions(q.user)

  // check if has permissions, and add conditions to query and data
  let action = q.act;
  if (action == 'push' || action == 'pull') action = 'update';
  if (action == 'upsert' ) action = 'insert';
  let perm = q.user.perm.find(e => (!e.col || e.col == q.col) && e.act == action);
  if (!perm) return 'no permission to ' + action + (q.col ? ' ' + q.col : '');

  // read / write only my unit - supoort hirarchy parent/child unit
  // if (q.user.unit && q.query) q.query.unit = q.user.unit;
  // if (q.user.unit && q.data) for (let d of q.data) { d.unit = q.user.unit }
  if ( q.user?.unit ) {
    if ( !q.query ) q.query = {}; if ( !q.query.$and ) q.query.$and = []
    q.query.$and.push( { $or: [ { unit: q.user.unit }, { unit: { $regex: '^' + q.user.unit + '/' } } ] } )
    if ( q.data ) {
      for (let d of q.data) {
        if ( action == 'insert' && !d.unit ) d.unit = q.user.unit
        if ( d.hasOwnProperty('unit') && !(d.unit + '/').startsWith(q.user.unit + '/') ) d.unit = q.user.unit
      }
    }
  }

  //queryAdd - add keys to search query
  if (perm.queryAdd) {
    if (!q.query) q.query = {}
    q.query = { ...q.query, ...perm.queryAdd }
  }

  //project - allow only certain keys to be projected
  if (perm.project) {
    if ( !q.project ) q.project = perm.project 
    for ( let k in q.project ) if ( q.project[k] && perm.project[k] == 0 ) delete q.project[k]
    if ( Object.keys(q.project).length == 0 ) q.project = perm.project
  }

  //dataFilter - allow only certain keys in inserted/updated docs
  if (perm.dataFilter) {
    if (!q.data) q.data = [];
    for (let d of q.data) {
      for (let k in d) {
        if(!perm.dataFilter.includes(k)) d[k].delete
      }
    }
  }

  //dataAdd - add some fixed values to all inserted/updated docs
  if (perm.dataAdd) {
    if (!q.data) q.data = [];
    for (let i = 0; i < q.data.length; i++) {
      q.data[i] = { ...q.data[i], ...perm.dataAdd }
    }
  }

  // revoked user tokens TODO - should be in the redis server...
  if (!global.revokedUsers) global.revokedUsers = []
  if (q.col == 'users' && q.act == 'update' && q.data[0].status == 'disabled') {
    global.revokedUsers.push(q.query._id + '')
    global.revokedUsers = global.revokedUsers.filter((v, i) => global.revokedUsers.indexOf(v) === i); //unique
  }
  if (q.col == 'users' && q.act == 'update' && q.data[0].status != 'disabled') {
    let x = global.revokedUsers.indexOf(q.query._id + '')
    if (x >= 0) global.revokedUsers.splice(x, 1)
  }
  if (global.revokedUsers.includes(q.user._id + '')) return 'user disabled'

}

module.exports = {login, setPermissions, checkPermissions}

