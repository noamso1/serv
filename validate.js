#!/usr/bin/env node
"use strict";
const func = require('./func.js');

async function validate(q) {

  let schema = {
    users: {
      allowExcessive: true,
      fields: [
        { name: "email", type: 'string', mandatory: true, unique: true },
        { name: "name", type: 'string', mandatory: false, unique: false },
        { name: "role", type: 'string', mandatory: false, unique: false },
        { name: "pass", type: 'string', mandatory: false, unique: false },
      ],
    },
    fares: {
      allowExcessive: true,
      fields: [
        { name: "code", type: 'increment', mandatory: false, unique: false },
        { name: "from", type: 'stringArray', mandatory: false, unique: false },
        { name: "to", type: 'stringArray', mandatory: false, unique: false },
        { name: "biDir", type: 'boolean', mandatory: false, unique: false },
        { name: "service", type: 'stringArray', mandatory: false, unique: false },
        { name: "unit", type: 'stringArray', mandatory: false, unique: false },
        { name: "profile", type: 'stringArray', mandatory: false, unique: false },
        { name: "profileType", type: 'stringArray', mandatory: false, unique: false },
        { name: "parentCode", type: 'stringArray', mandatory: false, unique: false },
        { name: "tag", type: 'stringArray', mandatory: false, unique: false },
        { name: "parentTag", type: 'stringArray', mandatory: false, unique: false },
        { name: "weekDays", type: 'numberArray', mandatory: false, unique: false },
        { name: "value", type: 'number',  mandatory: false, unique: false },
        { name: "priority", type: 'number',  mandatory: false, unique: false },
        { name: "dis1", type: 'number',  mandatory: false, unique: false },
        { name: "dis2", type: 'number',  mandatory: false, unique: false },
        { name: "seats", type: 'number',  mandatory: false, unique: false },
        { name: "date1", type: 'date',  mandatory: false, unique: false },
        { name: "date2", type: 'date',  mandatory: false, unique: false },
        { name: "hour1", type: 'hour', mandatory: false, unique: false },
        { name: "hour2", type: 'hour', mandatory: false, unique: false },
      ]
    },
  }

  if ( [ 'insert', 'update' ].includes(q.act) ) {

    for ( let item of q.data ) { 

      for ( let def of schema[q.col].fields ) {
        let f = def.name
        if ( q.act == 'insert' && def.mandatory && !item[f] ) return { error: 'must insert ' + q.col + '.' + f };
        if ( q.act == 'insert' && !item[f] ) item[f] = '' 
        if ( ( q.act == 'insert' || q.act == 'update' ) && def.unique && item[f] ) {
          let search = {}; search[f] = item[f]; if (q.act == 'update') search.$nor = [ q.query ]
          let found = await global.db.collection(q.col).findOne(search)
          if (found) return { error: f + ' ' + item[f] + ' already exists' };
        }
      }

      for ( let f in item ) {
        let def; if ( schema[q.col]?.fields ) def = schema[q.col]?.fields.find( e => e.name == f )
        if ( !schema[q.col]?.allowExcessive && item[f] && !def ) return { error: 'excessive field ' + q.col + '.' + f }
        if ( def ) {

          if ( def.type == 'increment' && q.act == 'insert' && !item[f] ) item[f] = await func.getSeedInc(q.col)

          if ( def.type == 'string' && q.act == 'insert' && !item[f] ) item[f] += ''

          if ( def.type == 'stringArray' && ( q.act == 'insert' || item[f] ) ) {
            if ( typeof item[f] == 'string' && item[f] != '' ) item[f] =  item[f].split(',')
            if ( !item[f] || !Array.isArray(item[f]) ) item[f] = []
            for ( let i = 0; i < item[f].length; i++ ) { item[f][i] += ''; item[f][i] = item[f][i].trim() }
            item[f] = item[f].filter( e => e != '' )
          }

          if ( def.type == 'numberArray' && ( q.act == 'insert' || item[f] ) ) {
            if ( typeof item[f] == 'string' && item[f] != '' ) item[f] =  item[f].split(',')
            if ( !item[f] || !Array.isArray(item[f]) ) item[f] = []
            item[f] = item[f].filter( e => func.isNumeric(e) )
            for ( let i = 0; i < item[f].length; i++ ) { item[f][i] = Number(item[f][i]) }
          }

          if ( def.type == 'number' && ( q.act == 'insert' || func.isNumeric( item[f] ) ) ) {
            if ( !item[f] || !func.isNumeric(item[f]) ) item[f] = 0
            item[f] = Number(item[f])
          } 

          if ( def.type == 'boolean' && ( q.act == 'insert' || item[f] ) ) {
            let t = item[f] + ''
            item[f] = false; if ( t.toLowerCase() == 'true' ) item[f] = true
          } 

          if ( def.type == 'date' && ( q.act == 'insert' || item[f] ) ) {
            if ( !item[f] || !func.isDate(item[f]) ) item[f] = ''
          }

          if ( def.type == 'hour' && ( q.act == 'insert' || item[f] ) ) {
            if ( !item[f] || !func.isHour(item[f]) ) item[f] = ''
          }

        }
      }
    }
  }

  // ------------ other data item validations
  for (let item of q.data) {
    if ( q.col == 'users' ) {
      if ( q.act == 'insert' && !item.pass ) item.pass = func.randomString(10)
      if ( ['insert', 'update', 'upsert'].includes(q.act) && item.email ) item.email = item.email.toLowerCase()
      if ( ['insert', 'update', 'upsert'].includes(q.act) && item.pass ) {
        item.passSalt = func.randomString(10)
        item.pass = func.createHash(item.pass + item.passSalt)
      }
    }
  }

  return {};
}

module.exports = validate;
