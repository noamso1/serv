#!/usr/bin/env node
"use strict";
const func = require('./func.js');

function setPermissions(user) {
  // EXAMPLE { col: "users", act: "insert", queryAdd: { site: 12 }, project: { pass: 0 }, dataFilter: ['status'], dataAdd: {role: user.role} },
  if (!user.perm) {
    user.perm = []
    if (user.role == 'admin') {
      user.perm = [
        { col: "users", act: "find", project: { passHash: 0, passSalt: 0 } },
        { col: "users", act: "insert" },
        { col: "users", act: "update" },
        { col: "users", act: "delete" },
      ]
    }
    if (user.role == 'guest') {
      user.perm = [
        { act: 'register'},
        { act: 'registerConfirm'},
        { act: 'sendResetToken'},
        { act: 'useResetToken'},
      ]
    }
  }
  user.perm.push ( { act: "changePassword", queryAdd: { email: user.email } } )
}

async function checkPermissions(q) {
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
  // TODO allow unit admin to control his units..
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
    if (!global.revokedUsers.includes(q.query._id + '')) global.revokedUsers.push(q.query._id + '')
  }
  if (q.col == 'users' && q.act == 'update' && q.data[0].status != 'disabled') {
    let x = global.revokedUsers.indexOf(q.query._id + '')
    if (x >= 0) global.revokedUsers.splice(x, 1)
  }
  if (global.revokedUsers.includes(q.user._id + '')) return 'user disabled'

}

async function initTokenPass() {
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
      if ( global.arg.local ) { global.tokenPass = '1'; global.tokenPassLast = '1' }
      global.db.collection('system').updateOne( { _id: 'tokenPass' }, { $set: { value: global.tokenPass } }, { upsert: true } )
      global.db.collection('system').updateOne( { _id: 'tokenPassLast' }, { $set: { value: global.tokenPassLast } }, { upsert: true } )
    }
  }
}

let loginFails = []
async function login(q) {
  let validated, now = Date.now()
  // validate token
  if (q.token) {
    let t = func.dec(q.token, global.tokenPass); if (!t) t = func.dec(q.token, global.tokenPassLast);
    if (t) {
      q.user = JSON.parse(t)
      let age = (now - q.user.issued) / 60000; if (age >= 5) return { error: 'token expired' }
      validated = true // for refreshtoken
    }
    if (!q.user) return { error: 'invalid token' }
  }

  // refresh token
  if (q.act == 'refreshtoken') {
    if (!q.user || !q.user.email) return { error: "bad token" }
    q = { act: 'login', email: q.user.email }
  }

  // login
  if ( q.act == 'login' && q.email ) {
    let fails = loginFails.filter(a => (a.ip == q.ip || a.email == q.email) && a.time > now - 60000)
    if (fails.length >= 4) return { error: 'too many login tries, please wait a few seconds.' }
    let user = await global.db.collection("users").findOne({ email: q.email.toLowerCase() })
    if (user) { if (!func.validateHash(q.pass + user.passSalt, user.passHash) && !validated ) user = undefined }
    if (!user) {
      loginFails = loginFails.filter(a => a.time > now - 60000)
      loginFails.push({ "ip": q.ip, "email": q.email, "time": now })
      return { error: 'permission denied' }
    }
    delete user.passHash; delete user.passSalt; user.issued = now
    if ( global.arg.local ) user.issued = 9999999999999 // for local debug
    let token = func.enc(JSON.stringify(user), global.tokenPass)
    setPermissions(user)
    return { token, user }
  }

}

module.exports = { login, setPermissions, checkPermissions, initTokenPass }

