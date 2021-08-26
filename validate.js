#!/usr/bin/env node
"use strict";
const ObjectId = require('mongodb').ObjectId;
const func = require('./func.js');

async function validate(q, user) {

  // ------------ check schema
  let schema = {
    fares: {
      code: 'increment',
      from: 'stringArray',
      to: 'stringArray',
      biDir: 'boolean',
      service: 'stringArray',
      unit: 'stringArray',
      profile: 'stringArray',
      profileType: 'stringArray',
      parentCode: 'stringArray',
      tag: 'stringArray',
      parentTag: 'stringArray',
      weekDays: 'numberArray',
      value: 'number', 
      priority: 'number', 
      dis1: 'number', 
      dis2: 'number', 
      seats: 'number', 
      date1: 'date', 
      date2: 'date', 
      hour1: 'hour',
      hour2: 'hour',
    }
  }

  if ( [ 'insert', 'update' ].includes(q.act) ) {

    for ( let item of q.data ) { 

      if ( q.act == 'insert' ) { 
        for ( let f in schema[q.col] ) {
          if ( !item[f] ) item[f] = '' 
        }
      }

      for ( let f in item ) {
        let m = schema[q.col]
        if ( m ) {
          if ( m[f] == 'increment' && q.act == 'insert' && !item[f] ) item[f] = await func.getSeedInc(q.col)

          if ( m[f] == 'string' && q.act == 'insert' && !item[f] ) item[f] += ''

          if ( m[f] == 'stringArray' && ( q.act == 'insert' || item[f] ) ) {
            if ( typeof item[f] == 'string' && item[f] != '' ) item[f] =  item[f].split(',')
            if ( !item[f] || !Array.isArray(item[f]) ) item[f] = []
            for ( let i = 0; i < item[f].length; i++ ) { item[f][i] += ''; item[f][i] = item[f][i].trim() }
            item[f] = item[f].filter( e => e != '' )
          }

          if ( m[f] == 'numberArray' && ( q.act == 'insert' || item[f] ) ) {
            if ( typeof item[f] == 'string' && item[f] != '' ) item[f] =  item[f].split(',')
            if ( !item[f] || !Array.isArray(item[f]) ) item[f] = []
            item[f] = item[f].filter( e => func.isNumeric(e) )
            for ( let i = 0; i < item[f].length; i++ ) { item[f][i] = Number(item[f][i]) }
          }

          if ( m[f] == 'number' && ( q.act == 'insert' || item[f] ) ) {
            if ( !item[f] || !func.isNumeric(item[f]) ) item[f] = 0
            item[f] = Number(item[f])
          } 

          if ( m[f] == 'boolean' && ( q.act == 'insert' || item[f] ) ) {
            let t = item[f] + ''
            item[f] = false; if ( t.toLowerCase() == 'true' ) item[f] = true
          } 

          if ( m[f] == 'date' && ( q.act == 'insert' || item[f] ) ) {
            if ( !item[f] || !func.isDate(item[f]) ) item[f] = ''
          }

          if ( m[f] == 'hour' && ( q.act == 'insert' || item[f] ) ) {
            if ( !item[f] || !func.isHour(item[f]) ) item[f] = ''
          }

        }
      }
    }
  }

  // ------------ check unique duplicates
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
    }
  }

  // ------------ other data item validations
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
