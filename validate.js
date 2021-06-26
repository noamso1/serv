#!/usr/bin/env node
"use strict";
const ObjectId = require('mongodb').ObjectId;
const func = require('./func.js');

async function validate(q, user) {

  // -------------------- check unique duplicates
  if (q.act == 'insert' || q.act == 'update') {
    let uniques = [
      { col: 'users', field: 'email', mandatory: true, unique: true },
    ]
    let i = q.data.length;
    while (i--) {
      let item = q.data[i];
      let uu = uniques.filter(e => e.col == q.col)
      for (let u = 0; u < uu.length; u++) {
        let found, search = {}, field = uu[u].field, isUnique = uu[u].unique, isMandatory = uu[u].mandatory
        if (isMandatory && (q.act == 'insert' && !item[field] || q.act == 'update' && (field in item) && !item[field])) return { "error": 'must have ' + field };
        if (isUnique && item[field]) {
          search[field] = item[field]; if (q.act == 'update') search["$nor"] =  [ q.query ]
          found = await global.db.collection(q.col).findOne(search)
          if (found) return { "error": field + ' ' + item[field] + ' already exists' };
        }
      }
      // autoincrement
      if (q.col == 'jobs' && q.act == 'insert' && !item.id) { item.id = await func.getSeedInc("jobs") }
    }
  }

  // ------------------------------- other data item validations
  for (let item of q.data) {
    if ( q.col == 'users' ) {
      if ( ['insert', 'update'].includes(q.act) && item.email ) item.email = item.email.toLowerCase()
      if ( q.act == 'insert' ) {
        if (!item.email) return { "error": datai + ' user must have email' };
        if (!item.pass) item.pass = func.randomString(10)
        item.passSalt = func.randomString(10)
        item.pass = func.createHash(item.pass + item.passSalt)
      }
    }
  }

  return {};
}

module.exports = validate;
