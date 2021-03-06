#!/usr/bin/env node
"use strict";
const http = require('http');
const https = require('https');
const crypto = require('crypto')
const fs = require('fs')
const email = require('./email.js')

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

function isHour(s) {
  if (!s || typeof s != 'string' ) return false
  let h = s.substring(0,2)
  let m = s.substring(3,5)
  if ( s.length != 5 || s.substring(2,3) != ':' ) return false
  if ( Number(h) < 0 || Number(h) > 23 ) return false
  if ( Number(m) < 0 || Number(m) > 59 ) return false
  return true
}

function isNumeric(n) {
  return !isNaN(parseFloat(n)) && isFinite(n);
}

// utcToLocal('2024-01-01 12:00', 'ISRAEL')
function utcToLocal(date, timeZone) {
  if (!date) date = new Date()
  let loc = new Date(date).toLocaleString('en-GB', { timeZone: timeZone })
  let r = loc.substring(6,10) + '-' + loc.substring(3,5) + '-' + loc.substring(0,2) + loc.substring(11)
  return r
}

function localToUTC(d) {
  var now = new Date(d);
  var utc = new Date(now.getTime() + now.getTimezoneOffset() * 60000);
  utc = utc.toISOString()
  utc = utc.substring(0,10) + ' ' + utc.substring(11,19)
  return utc
}

function lastDay( d ) {
  let today = new Date(d);
  let last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return last.getDate()
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
  //if (!chars) chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890@#$%^&*()_+`~-=[]{}|/:;<>,';
  if (!chars) chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
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
  let pass = crypto.createHash('sha256').update(thepass).digest('buffer')
  let iv = crypto.randomBytes(16)
  let cipher = crypto.createCipheriv('aes-256-cbc', pass , iv);
  let encrypted = cipher.update(text, 'utf-8', 'base64');
  encrypted += cipher.final('base64');
  return encrypted + '.' + iv.toString('base64')
}

function dec(thetext, thepass) {
  let text = thetext
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
  if ((Date.now() - settingsCacheDate) > 10000) {
    let s = {};
    s.settings = await global.db.collection("settings").find({}).toArray();
    settingsCache = s; settingsCacheDate = Date.now()
  }
  if (!settingsCache) settingsCache = [];
  return settingsCache;
}

async function getSettings(field, user) {
  let a, v = '', ss = await fetchSettings()
  ss = ss?.settings
  ss.sort((a, b) => (a.unit > b.unit || !b.unit) ? 1 : -1) // undefined on top
  for ( let s of ss ) {
    if ( s.name == field ) {
      if (!s.unit || s.unit == user?.unit || user?.unit && s.unit.startsWith(user.unit + '/') ) {
        v = s.value
      }
    }
  }
  return v
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
async function changePassword(q, user) {
  if (!q.email) return {ok: 0, error: "must specify email"}
  let u = await global.db.collection("users").findOne({email: q.email})
  if (!u) return {ok: 0, error: "user not found"}
  let strength = passStrength(q.newPass); if (strength) return {ok:0, error: strength}
  if (!validateHash(q.oldPass + u.passSalt, u.passHash)) return {ok: 0, error: "wrong old password"}
  let passSalt = randomString(10)
  let res = await global.db.collection("users").updateOne({email: q.email}, {"$set": {passHash: createHash(q.newPass + passSalt), passSalt}})
  return {ok:1}
}

function passStrength(pass) {
  let pp = (pass + '').split('') , r = ''
  let lower = 'abcdefghijklmnopqrstuvwxyz'
  let upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  if ( pp.length < 8 ) r+= 'password must be at least 8 chars long. '
  if ( !pp.some( e => lower.includes(e) ) ) r+= 'password must include lower case letters. '
  if ( !pp.some( e => upper.includes(e) ) ) r+= 'password must include upper case letters. '
  if ( !pp.some( e => !(lower + upper).includes(e) ) ) r+= 'password must include numeric of symbol characters. '
  return r
}

//------register
async function register(q) {
  if ( !q.email ) return {"error": "must specify email"}
  if ( !q.pass ) return {"error": "must specify pass"}
  let strength = passStrength(q.pass); if (strength) return {ok:0, error: strength}
  await global.db.collection('users').deleteMany( { email: q.email, status: 'unconfirmed' } )
  let uu = await global.db.collection('users').find({"email": q.email}).toArray()
  if (uu.length >= 1) return {"error": "email already exists"}
  let passSalt = randomString(10)
  let unlockKey = randomString(10, "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ")
  let u = {
   "email": q.email,
   "name": q.name,
   "phone": q.phone,
   "role": "user",
   "status": "unconfirmed",
   "unlockKey": unlockKey,
   "passHash": createHash(q.pass + passSalt),
   "passSalt": passSalt,
   "registered": Date.now(),
  }

  let r = await global.db.collection('users').insertOne(u)
  if( !r.insertedId ) return { ok: 0, "error": "cannot create user" }

  let link = q.origin + '/confirmemail.html?email=' + q.email + '&unlockKey=' + unlockKey
  email.send( {from: global.env.siteEmail, to: q.email, subject: "Confirm your email", html: link} )

  return {ok: 1, "message": "a confirmation link has been sent to " + q.email }
}

async function registerConfirm(q) {
  if ( !q.email ) return {"error": "must specify email"}
  let uu = await global.db.collection('users').find({"email": q.email, "unlockKey": q.unlockKey, "status": "unconfirmed"}).toArray()
  if (uu.length == 0) return {"error": "cannot find user, or wrong unlock key, or user already active."}
  let u = {
   "$set": { "status": "active" },
   "$unset": { "unlockKey": 1 },
  }
  let r = await global.db.collection("users").updateOne( { "email": q.email }, u )
  if( r.modifiedCount != 1 ) return { ok: 0, error: "cannot confirm email" }
  return { ok: 1 }
}

//----------reset pass
async function sendResetToken(q) {
  let resetToken = { email: q.email, issued: Date.now() }; resetToken = enc(JSON.stringify(resetToken), global.tokenPass)
  let url = q.origin + '/resetpass.html?email=' + q.email + '&resetToken=' + encodeURIComponent(resetToken) //resetToken.replace(/\+/g, '%2b')
  email.send( {from: global.env.siteEmail , to: q.email, subject: "Password Reset", html: url} )
  return {ok:1}
}

async function useResetToken(q) { //email,resetToken,newPass
  if( !q.email ) return {ok: 0, error: "please specify email"}
  let tok = dec(q.resetToken, global.tokenPass); if (!tok) tok = dec(q.resetToken, global.tokenPassLast);
  if (tok) tok = JSON.parse(tok)
  if( !tok || !tok.email || !tok.issued || tok.email != q.email ) return {ok: 0, error: "invalid reset token"}
  if( !q.newPass ) return {ok: 0, error: "please choose a new password"}
  let strength = passStrength(q.newPass); if (strength) return {ok:0, error: strength}
  if( tok.issued < Date.now() - 600000 ) return {ok:0, error: "reset token expired"} // 10 min
  let passSalt = randomString(10)
  global.db.collection("users").updateOne({email: q.email}, {"$set": {passHash: createHash(q.newPass + passSalt), passSalt}})
  return {ok:1}
}

// add lookups - much faster than aggregate
// { "token": "...", "act": "find", "col": "comments", "skip": 0, "limit": 20, "query": { "id": "123" },
//   "lookups": [ { "field": "user_id", "col": "users", "as": "user", "project": { "name": 1 } } ] }
async function addLookups(q, r) {
  if ( q.act == 'find' ) {
    if (!Array.isArray(q.lookups)) q.lookups = []
    for ( let look of q.lookups ) {
      if ( !look.foreign ) look.foreign = "_id"
      if ( !look.project ) look.project = {}
      if ( !look.as ) look.as = look.field + '_doc'
      let ii = r.data.map( e => e[look.field] ); ii = uniqueArray(ii)
      let qu = {}; qu[look.foreign] = { $in: ii }
      let found = await db.collection(look.col).find( qu ).project(look.project).toArray()
      for ( let d of r.data ) {
        let i = d[look.field].toString()
        let f = found.find( e => e[look.foreign] == i )
        if ( f ) d[look.as] = f
      }
    }
  }
}

function addLog(f, s) {
  fs.appendFileSync(f, s + '\n', 'utf8')
}

function addLog2(f, s) {
  fs.appendFile( f, s, { encoding: 'utf8' }, function(e){} ) 
}

function num(s) {
  if (isNumeric(s)) return Number(s)
  return 0
}

//Response=000&tranmode=AK&notify_url_address=http%3A%2F%2Flocalhost%3A3333%2Ftz.html
function url2json(s) {
  return Object.fromEntries(new URLSearchParams(s))
}

//delKeys(object, 'key1,key2')
function delKeys(obj, keys) {
  let kk = keys.split(',')
  for ( let k of kk ) delete obj[k]
}

// load the arguments: node main.js db=moovex port=9999 ----> arg = {"db": "moovex", "port": "9999"}
function getArgs() {
  let arg = {};
  for (let i = 2; i < 999; i++) {
    let a = process.argv[i]
    if ( !a ) break
    if ( a.indexOf('=') >= 0 ) {
      let k = a.substring(0, a.indexOf('='))
      let v = a.substring(a.indexOf('=') + 1, a.length)
      arg[k] = v
    }
  }
  return arg  
}

function sortKeys( o ) { // recursively sort object keys
  return Object.assign({}, ...Object
    .keys(o)
    .sort()
    .map(k => ({ [k]: o[k] && typeof o[k] === 'object' ? sortKeys(o[k]) : o[k] }))
  );
}

function isSame( a, b ) {
  let a_snap = JSON.stringify(sortKeys(a))
  let b_snap = JSON.stringify(sortKeys(b))
  if ( a_snap == b_snap ) return true
}

//-----------------------------------------
module.exports = {
  isEmail, fetch, enc, dec, isNumeric, isDate, isHour, utcToLocal, localToUTC, showDate, dateAddSeconds, dateDiff, delKeys,
  getFromTo, replaceFromTo, randomString, fetchSettings, clone, strFilter, fetchSettings, getSettings, getSeedInc, uniqueArray,
  createHash, validateHash, changePassword, passStrength, register, registerConfirm, sendResetToken, useResetToken, addLookups,
  addLog, addLog2, num, url2json, getArgs, lastDay, sortKeys, isSame
}

