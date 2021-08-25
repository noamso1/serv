#!/usr/bin/env node
"use strict";
const http = require('http');
const https = require('https');
const ObjectId = require('mongodb').ObjectId;
const crypto = require('crypto')
const fs = require('fs')

//-----------------------------------------
function showDate(d) {
  if (!d) d = new Date();
  var t, r = '';
  r += d.getFullYear();
  t = (d.getMonth() + 1); if (t.toString().length == 1) { t = '0' + t };
  r += '-' + t;
  t = d.getDate(); if (t.toString().length == 1) { t = '0' + t };
  r += '-' + t;
  t = d.getHours(); if (t.toString().length == 1) { t = '0' + t };
  r += ' ' + t;
  t = d.getMinutes(); if (t.toString().length == 1) { t = '0' + t };
  r += ':' + t;
  t = d.getSeconds(); if (t.toString().length == 1) { t = '0' + t };
  r += ':' + t;
  return r;
}

function dateAddSeconds(da, x) {
  let d = new Date(da);
  d = new Date(d.getTime() + x * 1000);
  return showDate(d);
}

function dateDiff(d1, d2) {
  if (!isDate(d1) || !isDate(d2)) return 0;
  let t1 = new Date(d1).getTime();
  let t2 = new Date(d2).getTime();
  return ((t2 - t1) / 1000).toFixed()
}

function isDate(s) {
  if (!isNaN(Date.parse(s))) { return true; } else { return false; }
}

function isNumeric(n) {
  return !isNaN(parseFloat(n)) && isFinite(n);
}

async function utcToLocal(date, timeZone) { // UTC to local time
  // utcToLocal('2024-01-01 12:00', 'EST')
  let tz = 0
  if (!isDate(date)) date = new Date().toISOString().substring(0, 19).replace('T', ' '); //current UTC date string
  if (!timeZone) timeZone = await getSettings('time zone')
  timeZone += ''
  if (isNumeric(timeZone)) {
    tz = parseFloat(timeZone)
  } else {
    let t = timeZone.toLowerCase(); t = strFilter(t, 'abcdefghijklmnopqrstuvwxyz')
    if (t == 'uae') tz = +4 // Emirates
    if (['est', 'cst', 'mst', 'pst', 'hast', 'akst'].includes(t)) { // USA
      if (t == 'est') tz = -5
      if (t == 'cst') tz = -6
      if (t == 'mst') tz = -7
      if (t == 'pst') tz = -8
      if (t == 'hast') tz = -9
      if (t == 'akst') tz = -10
      if (date >= '2019-03-10 07:00' && date <= '2019-11-03 07:00') tz += 1
      if (date >= '2020-03-08 07:00' && date <= '2020-11-01 07:00') tz += 1
      if (date >= '2021-03-14 07:00' && date <= '2021-11-07 07:00') tz += 1
      if (date >= '2022-03-13 07:00' && date <= '2022-11-06 07:00') tz += 1
      if (date >= '2023-03-12 07:00' && date <= '2023-11-05 07:00') tz += 1
      if (date >= '2024-03-10 07:00' && date <= '2024-11-03 07:00') tz += 1
      if (date >= '2025-03-09 07:00' && date <= '2025-11-02 07:00') tz += 1
      if (date >= '2026-03-08 07:00' && date <= '2026-11-01 07:00') tz += 1
      if (date >= '2027-03-14 07:00' && date <= '2027-11-07 07:00') tz += 1
      if (date >= '2028-03-12 07:00' && date <= '2028-11-05 07:00') tz += 1
      if (date >= '2029-03-11 07:00' && date <= '2029-11-04 07:00') tz += 1
    }
  }
  let r = dateAddSeconds(date, tz * 3600)
  return r
}


//-----------------------------------------
function fetch(url, method, headers, data) {
  //let t = await fetch('https://kiki.com')
  //let t = await fetch('https://kiki.com/some_api.php', 'POST', {'Content-Type': 'application/json'}, JSON.stringify(d))
  if (method === undefined) method = 'GET';
  if (headers === undefined) headers = {};
  if (data === undefined) data = '';
  let u = url;
  if (u.indexOf('://') < 4) {
    console.error("missing protocol (http://, https://)")
    return '';
  }
  if (u.indexOf('/', 8) == -1) u += '/';
  return new Promise((resolve, reject) => {
    let o, port, protocol, host, path, options, req, r = '';
    protocol = u.substring(0, u.indexOf("://"));
    if (protocol == "https") { o = https; port = 443 } else { o = http; port = 80; }

    host = u.substring(
      u.indexOf("://") + 3,
      u.indexOf("/", u.indexOf("://") + 3)
    );
    if (host.indexOf(":") !== -1) {
      port = host.substring(host.indexOf(":") + 1, host.length);
      host = host.substring(0, host.indexOf(":"));
    }

    path = u.substring(u.indexOf("/", u.indexOf("://") + 3), u.length);
    options = { host: host, port: port, path: path, method: method, headers: headers };
    req = o.request(options, function (response) {
      response.on("data", chunk => { r += chunk });
      response.on("error", err => { reject(err) });
      response.on("end", () => { resolve(r) });
    });
    req.write(data);
    req.end();
  })
}

function randomString(length, chars) {
  // to be able to control which characters to use
  if (!chars) chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890@#$%^&*()_+`~-=[]{}|/:;<>,';
  let pass = '';
  for (let x = 0; x < length; x++) {
    let i = Math.floor(Math.random() * chars.length);
    pass += chars.charAt(i);
  }
  return pass;
}

//---------------------------------------CRYPTO
////supported hashes
//console.log(crypto.getHashes());
//console.log(crypto.getCiphers());

////create hash
//let hash = crypto.createHash('sha512').update('your message').digest('hex')
//console.log(hash);

function enc(thetext, thepass) {
  let text = thetext
  let addition = crypto.randomBytes(Math.random() * 10 + 5).toString('base64')
  text += '.' + addition
  //let pass = thepass; while (pass.length < 32) pass += pass; pass = pass.substring(0, 32)
  let pass = crypto.createHash('sha256').update(thepass).digest('buffer')
  let iv = crypto.randomBytes(16)
  let cipher = crypto.createCipheriv('aes-256-cbc', pass , iv);
  let encrypted = cipher.update(text, 'utf-8', 'base64');
  encrypted += cipher.final('base64');
  return encrypted + '.' + iv.toString('base64')
}

function dec(thetext, thepass) {
  let text = thetext
  //let pass = thepass; while (pass.length < 32) pass += pass; pass = pass.substring(0, 32)
  let pass = crypto.createHash('sha256').update(thepass).digest('buffer')
  try {
    let ivb = text.substring(text.lastIndexOf('.') + 1, text.length)
    let iv = Buffer.from(ivb, 'base64');
    text = text.substring(0, text.lastIndexOf('.'))
    let decipher = crypto.createDecipheriv('aes-256-cbc', pass, iv);
    let decrypted = decipher.update(text, 'base64', 'utf-8');
    decrypted += decipher.final('utf-8');
    decrypted = decrypted.substring(0, decrypted.lastIndexOf('.')) //remove addition
    return decrypted;
  } catch {
    return ''
  }
}

//---------------------------------------------------

function isEmail(e) {
  var r = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
  return r.test(String(e).toLowerCase());
}

function getFromTo(a, start, f, t) {
  var x0, x1, x2, x1a, x2a;
  x1 = a.indexOf(f, start); if (x1 == -1) return "";
  x1 += f.length;
  x2 = a.indexOf(t, x1); if (x2 == -1) return "";
  return a.substring(x1, x2);
}

function replaceFromTo(a, start, f, t, rep, delf, delt) {
  var x0, x1, x2, x1a, x2a;
  x1 = a.indexOf(f, start); if (x1 == -1) return a;
  x1 += f.length;
  x2 = a.indexOf(t, x1); if (x2 == -1) return a;
  if (delf) x1 -= f.length
  if (delt) x2 += t.length
  return a.substring(0, x1) + rep + a.substring(x2, a.length);
}

let settingsCache, settingsCacheDate = 0
async function fetchSettings() {
  //only fetch from db every 10 seconds..
  if (((new Date()).getTime() - settingsCacheDate) > 10000) {
    let s = {};
    s.settings = await global.db.collection("settings").find({}).toArray();
    settingsCache = s; settingsCacheDate = (new Date()).getTime()
  }
  if (!settingsCache) settingsCache = [];
  return settingsCache;
}

async function getSettings(field, user) {
  let a = await fetchSettings();
  if (a) a = a.settings;
console.log(a)

  if (user?.unit) {
    a = a.find((e) => e.name == field && e.unit == user.unit);
  } else {
    a = a.find((e) => e.name == field && !e.unit);
  }
  if (a?.value) return a.value
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj))
}

function strFilter(string, okChars) {
  let r = '', s = string + ''
  for(let i = 0; i < s.length; i++) {
    if(okChars.indexOf(s[i]) >= 0) r += s[i]
  }
  return r
}

// autoincrement id field
async function getSeedInc(col) {
  let res, id = '', inc = 1
  while (true) {
    res = await global.db.collection("system").findOneAndUpdate({ "_id": col + "Seed" }, { "$inc": { "value": inc } }, { "returnNewDocument": true })
    if (!res.value) {
      await global.db.collection("system").insertOne({ "_id": col + "Seed", "value": 0 });
    } else {
      id = res.value.value + ''
      res = await global.db.collection(col).findOne({ "id": id })
      if (!res) break
      inc += 10 //if db is full this will accelerate performance
    }
  }
  return id + ''
}

function uniqueArray(a) {
  return a.filter((v, i) => v && a.indexOf(v) === i);
}

// -------------------hash
let hashSaltAdd = 'vjdDFG#^$421'
let hashPepperChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'

function createHash(string, pepper) {
  if (!pepper) pepper = randomString(2, hashPepperChars)
  let t = string + hashSaltAdd + pepper
  return crypto.createHash('sha512').update(t).digest('hex')
}

function validateHash(p, h) {
  for(let c of hashPepperChars) {
    for(let d of hashPepperChars) {
      if(createHash(p, c + d) == h) return true
    }
  }
  return false
}

//------pass
async function passwordChange(q, user) {
  if (!q.email) return {ok: 0, error: "must specify email"}
  let u = await global.db.collection("users").findOne({email: q.email})
  if (!u) return {ok: 0, error: "user not found"}
  if (!validateHash(q.oldPass + u.passSalt, u.pass)) return {ok: 0, error: "wrong old password"}
  let passSalt = randomString(10)
  let res = await global.db.collection("users").updateOne({email: q.email}, {"$set": {pass: createHash(q.newPass + passSalt), passSalt}})
  return {ok:1}
}



//-----------------------------------------
module.exports = {
  isEmail, fetch, enc, dec, isNumeric, isDate, utcToLocal, showDate, dateAddSeconds, dateDiff,
  getFromTo, replaceFromTo, randomString, fetchSettings, clone, strFilter, fetchSettings, getSettings, getSeedInc, uniqueArray,
  createHash, validateHash, passwordChange,
}
