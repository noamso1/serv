#!/usr/bin/env node
"use strict";

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
  user.perm.push ( { "act": "passwordchange", "queryAdd": { "email": user.email } } )
}

async function checkPermissions(q, user) {
  // { "col": "users", "act": "insert", "queryAdd": { "site": 12, "username": "kiki" }, "dataAdd": {"role": user.role} },
  setPermissions(user)

  // show and insert only my unit
  if (user.unit && q.query) q.query.unit = user.unit;
  if (user.unit && q.data) for (let d of q.data) { d.unit = user.unit }

  // check if has permissions, and add conditions to query and data
  let action = q.act;
  if (action == 'push' || action == 'pull') action = 'update';
  let perm = user.perm.find(e => (!e.col || e.col == q.col) && e.act == action);
  if (!perm) return 'no permission to ' + action + (q.col ? ' ' + q.col : '');

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
  if (global.revokedUsers.includes(user._id + '')) return 'user disabled'

}

module.exports = {setPermissions, checkPermissions}
