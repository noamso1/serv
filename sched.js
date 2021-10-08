#!/usr/bin/env node
"use strict"; //
const func = require("./func.js")
let counter = 0; function every(z) { return counter / z == ( counter / z ).toFixed() }

if ( !process.env.NODE_APP_INSTANCE || process.env.NODE_APP_INSTANCE == 0 ) setInterval(sched, 60000) // run only on first instance

async function sched() {
  let d = await func.utcToLocal(); counter += 1;

  if ( every(1) ) {

  }

}



