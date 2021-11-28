#!/usr/bin/env node
"use strict"; ////
const mongodb = require('mongodb');
const validate = require('./validate.js');
const func = require('./func.js');
const migrations = require('./migrations.js');

async function dbConnect(dbConn, dbName) {
  let t = await mongodb.MongoClient.connect(dbConn, { useUnifiedTopology: true }); global.db = t.db(dbName);
  await migrations.doit()
}

async function dbDo(q) {
  let r = {};

  //if (q.act == 'update' && !q.before) {
  //  q.before = await global.db.collection(q.col).find(q.query).toArray() // for history / validate etc.. - fetch current documents before update
  //}

  let vres = await validate(q); if (vres.error) return vres;

  if (q.act == 'find' && q.count) {
    if (q.count) r.count = await global.db.collection(q.col).find(q.query,{}).count()
  }
  if (q.act == 'find' && q.count != 2) {
    if (q.count) r.count = await global.db.collection(q.col).find(q.query,{}).count();
    let skip = q.skip; if (!skip) skip = 0;
    let limit = q.limit; if (!limit) limit = 999999;
    let sort = q.sort; if (!sort) sort = {};
    let project = q.project; if (!project) project = {};
    if (q.sums) {
      r.sums = []
      let ag = [ { $match: q.query }, { $group: { _id: '1' } } ]
      for ( let i = 0; i < q.sums.length; i++ ) ag[1].$group['sum' + i] = { $sum: '$' + q.sums[i] }
      let aa = await db.collection(q.col).aggregate(ag).toArray()
      for ( let i = 0; i < q.sums.length; i++ ) r.sums.push( aa[0] ? aa[0]['sum' + i] : 0 )        
    }
    r.data = await global.db.collection(q.col).find(q.query).skip(skip).project(project).limit(limit).sort(sort).toArray()
  }

  else if (q.act == 'insert' && q.data.length) {
    r = await global.db.collection(q.col).insertMany(q.data)
  }
  else if (q.act == 'update') {
    r = await global.db.collection(q.col).updateMany(q.query, { $set: q.data[0] }, q.updateOptions)
  }
  else if (q.act == 'upsert') {
    r = await global.db.collection(q.col).updateMany(q.query, { $set: q.data[0] }, { upsert: true } )
  }
  else if (q.act == 'push') {
    r = await global.db.collection(q.col).updateMany(q.query, { $push: q.data[0] }, q.updateOptions)
  }
  else if (q.act == 'pull') {
    r = await global.db.collection(q.col).updateMany(q.query, { $pull: q.data[0] }, q.updateOptions)
  }
  else if (q.act == 'delete') {
    r = await global.db.collection(q.col).deleteMany(q.query)
  }

  delete r.connection;
  return r;
}

function convertMongoIds(q) {
  // convert string _id to mongo objectid
  if (q.query) {
    convertKeysToMongoIds(q.query)
    if (typeof q._id === 'object') {
      if(q._id["$in"]) q._id["$in"] = q._id["$in"].map(e => mongodb.ObjectId(e));
      if(q._id["$ne"]) q._id["$ne"] = mongodb.ObjectId(q._id["$ne"]);
    }
  }
  //for ( let d of q.data ) convertKeysToMongoIds(d)
  //function convertKeysToMongoIds(d) {
  //  for ( let k in d ) {
  //    if ( k.endsWith('_id') && typeof d[k] == 'string' ) d[k] = mongodb.ObjectId(d[k])
  //  }
  //}
}

module.exports = { dbConnect, dbDo, convertMongoIds }
